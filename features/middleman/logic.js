import {
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { CONFIG } from '../../config/config.js';
import { INTERACTION_IDS, TICKET_TYPES } from '../../config/constants.js';
import {
  buildClaimPromptEmbed,
  buildCooldownEmbed,
  buildDisabledPanel,
  buildHelpEmbed,
  buildMiddlemanInfo,
  buildMiddlemanPanel,
  buildPartnerModal,
  buildRequestReviewsMessage,
  buildReviewModal,
  buildReviewPublishedEmbed,
  buildReviewPromptForMiddleman,
  buildRobloxErrorEmbed,
  buildRobloxWarningEmbed,
  buildTicketClaimedMessage,
  buildTicketCreatedEmbed,
  buildTicketLimitEmbed,
  buildTradeCompletedMessage,
  buildTradeModal,
  buildTradePanel,
  buildTradeLockedEmbed,
  buildTradeUpdateEmbed,
  claimRow,
  requestReviewRow,
} from './ui.js';
import { ensureUser } from '../../services/users.repo.js';
import {
  countOpenTicketsByUser,
  createTicket,
  getTicketByChannel,
  listParticipants,
  registerParticipant,
  setTicketStatus,
} from '../../services/tickets.repo.js';
import {
  getTrade,
  getTradesByTicket,
  resetTradeConfirmation,
  setTradeConfirmed,
  upsertTradeData,
} from '../../services/mm.repo.js';
import { createClaim, getClaimByTicket, markClaimClosed, markClaimVouched, markReviewRequested } from '../../services/mmClaims.repo.js';
import {
  addMiddlemanRating,
  getMiddlemanByDiscordId,
  incrementMiddlemanVouch,
  listTopMiddlemen,
  updateMiddleman,
  upsertMiddleman,
} from '../../services/middlemen.repo.js';
import { createReview, DuplicateReviewError, countReviewsForTicket, hasReviewFromUser } from '../../services/mmReviews.repo.js';
import { checkCooldown } from '../../utils/cooldowns.js';
import { parseUser } from '../../utils/helpers.js';
import { assertRobloxUser } from '../../utils/roblox.js';
import { logger } from '../../utils/logger.js';
import { generateForRobloxUser } from '../../services/canvasCard.js';
import { userIsAdmin } from '../../utils/permissions.js';

const tradePanelMessages = new Map();

function buildFallbackMember(id, { label, mention } = {}) {
  const safeId = id ? String(id) : null;
  const displayName = label ?? (safeId ? `Usuario ${safeId}` : 'Usuario desconocido');
  const username = displayName;
  const mentionText = mention ?? (safeId ? `<@${safeId}>` : 'Usuario desconocido');
  return {
    id: safeId ?? '0',
    displayName,
    user: {
      id: safeId ?? '0',
      username,
      tag: `${username}#${(safeId ?? '0').slice(-4).padStart(4, '0')}`,
    },
    toString() {
      return mentionText;
    },
  };
}

async function safeFetchMember(guild, userId) {
  if (!userId) return null;
  try {
    return await guild.members.fetch(String(userId));
  } catch (error) {
    logger.warn('No se pudo obtener miembro para panel', userId, error.message);
    return null;
  }
}

async function fetchParticipants(guild, ticket) {
  const participantIds = await listParticipants(ticket.id);
  const ownerId = String(ticket.owner_id);
  const owner = (await safeFetchMember(guild, ownerId)) ?? buildFallbackMember(ownerId);
  let partnerMember = null;
  for (const participantId of participantIds) {
    if (participantId !== ownerId) {
      const fetched = await safeFetchMember(guild, participantId);
      if (fetched) {
        partnerMember = fetched;
        break;
      }
    }
  }
  const fallbackPartnerId = participantIds.find((id) => id !== ownerId) ?? partnerMember?.id ?? null;
  return {
    owner,
    partner:
      partnerMember ??
      (fallbackPartnerId
        ? buildFallbackMember(fallbackPartnerId)
        : buildFallbackMember(null, {
            label: 'Partner pendiente',
            mention: 'Aún no se registra partner para este trade.',
          })),
    participantIds,
  };
}

async function sendCommandReply(ctx, payload, { ephemeral = false } = {}) {
  if ('reply' in ctx && typeof ctx.reply === 'function') {
    return ctx.reply({ ...payload, ephemeral });
  }
  if ('followUp' in ctx && typeof ctx.followUp === 'function') {
    return ctx.followUp({ ...payload, ephemeral });
  }
  if ('channel' in ctx && typeof ctx.channel?.send === 'function') {
    return ctx.channel.send(payload);
  }
  throw new Error('No se pudo responder al comando middleman');
}

function computeAverageFromRecord(record) {
  if (!record) return 0;
  const sum = Number(record.rating_sum ?? 0);
  const count = Number(record.rating_count ?? 0);
  return count > 0 ? sum / count : 0;
}

const SNOWFLAKE_REGEX = /^\d{17,20}$/;

function normalizeSnowflake(value) {
  if (!value && value !== 0) {
    return null;
  }
  const id = String(value);
  return SNOWFLAKE_REGEX.test(id) ? id : null;
}

function resolveParticipantIds(ticket, participants) {
  const ownerId = normalizeSnowflake(ticket?.owner_id) ?? normalizeSnowflake(participants.owner?.id);
  let partnerId = null;
  if (Array.isArray(participants?.participantIds)) {
    partnerId = participants.participantIds
      .map((id) => normalizeSnowflake(id))
      .find((id) => id && id !== ownerId)
      ?? null;
  }
  if (!partnerId) {
    const fallbackPartnerId = normalizeSnowflake(participants.partner?.id);
    partnerId = fallbackPartnerId && fallbackPartnerId !== ownerId ? fallbackPartnerId : null;
  }
  return { ownerId, partnerId };
}

async function updateSendPermission(channel, userId, value) {
  if (!userId) {
    return false;
  }
  try {
    await channel.permissionOverwrites.edit(userId, { SendMessages: value });
    return true;
  } catch (error) {
    logger.warn('No se pudo actualizar permisos para el usuario', userId, error);
    return false;
  }
}

function resolveMmSubcommand(ctx) {
  if ('isChatInputCommand' in ctx && typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand()) {
    try {
      const sub = ctx.options.getSubcommand(false);
      return sub?.toLowerCase?.() ?? null;
    } catch (error) {
      logger.debug('No se pudo resolver subcomando slash /mm', error);
      return null;
    }
  }
  const content = ctx.content ?? '';
  const [, ...parts] = content.trim().split(/\s+/);
  return parts[0]?.toLowerCase?.() ?? null;
}

function resolvePrefixArgs(message) {
  const parts = message.content.trim().split(/\s+/);
  const [, subcommandRaw, ...rest] = parts;
  const subcommand = subcommandRaw?.toLowerCase?.() ?? null;
  let userId = null;
  let username = null;
  if (['add', 'set', 'stats'].includes(subcommand)) {
    const mention = message.mentions?.users?.first();
    if (mention) {
      userId = mention.id;
      const idx = rest.findIndex((token) => token.includes(mention.id));
      if (idx >= 0) {
        rest.splice(idx, 1);
      }
    } else if (rest.length > 0) {
      const parsed = parseUser(rest[0]);
      if (parsed) {
        userId = parsed;
        rest.shift();
      }
    }
    if (rest.length > 0) {
      username = rest.join(' ');
    }
  }
  return { subcommand, userId, username };
}

function resolveSlashArgs(interaction) {
  const subcommand = resolveMmSubcommand(interaction);
  let userId = null;
  let username = null;
  if (['add', 'set', 'stats'].includes(subcommand)) {
    const userOption =
      interaction.options.getUser('user') ??
      interaction.options.getUser('objective') ??
      interaction.options.getUser('target');
    userId = userOption?.id ?? null;
    username =
      interaction.options.getString('roblox_username') ??
      interaction.options.getString('roblox') ??
      interaction.options.getString('username') ??
      null;
  }
  return { subcommand, userId, username };
}

export async function canExecuteMmCommand(member, ctx) {
  if (userIsAdmin(member, CONFIG.ADMIN_ROLE_ID)) {
    return true;
  }
  const subcommand = resolveMmSubcommand(ctx);
  if (subcommand !== 'closeforce') {
    return false;
  }
  if (!member) {
    return false;
  }
  const channelId = ctx.channelId ?? ctx.channel?.id ?? null;
  if (!channelId) {
    return false;
  }
  const ticket = await getTicketByChannel(channelId);
  if (!ticket) {
    return false;
  }
  const claim = await getClaimByTicket(ticket.id);
  if (!claim) {
    return false;
  }
  return String(claim.middleman_user_id) === String(member.id);
}

async function ensurePanelMessage(channel, { owner, partner, disabled } = {}) {
  const ticket = await getTicketByChannel(channel.id);
  if (!ticket) {
    logger.warn('No se encontró ticket asociado al canal', channel.id);
    return null;
  }
  const trades = await getTradesByTicket(ticket.id);
  let ownerMember = owner;
  let partnerMember = partner;
  if (!ownerMember || !partnerMember) {
    const participants = await fetchParticipants(channel.guild, ticket);
    ownerMember = ownerMember ?? participants.owner;
    partnerMember = partnerMember ?? participants.partner;
  }
  const payload = disabled
    ? buildDisabledPanel({ owner: ownerMember, partner: partnerMember, trades })
    : buildTradePanel({ owner: ownerMember, partner: partnerMember, trades });
  const existingId = tradePanelMessages.get(channel.id);
  if (existingId) {
    try {
      const message = await channel.messages.fetch(existingId);
      await message.edit({ ...payload, allowedMentions: { parse: [] } });
      return message;
    } catch (error) {
      logger.warn('No se pudo actualizar panel, creando uno nuevo', error);
    }
  }
  const message = await channel.send({ ...payload, allowedMentions: { parse: [] } });
  tradePanelMessages.set(channel.id, message.id);
  return message;
}

export async function handleMiddlemanCommand(ctx) {
  const panel = buildMiddlemanPanel();
  if ('reply' in ctx && typeof ctx.reply === 'function') {
    await ctx.reply({ ...panel, ephemeral: false, allowedMentions: { parse: [] } });
  } else if ('channel' in ctx) {
    await ctx.reply?.({ ...panel, allowedMentions: { parse: [] } }) ?? ctx.channel.send({ ...panel, allowedMentions: { parse: [] } });
  }
  logger.flow('Panel middleman publicado por', ctx.user?.id ?? ctx.author?.id);
}

function buildMmUsageEmbed() {
  return buildTradeUpdateEmbed(
    '📘 Comandos middleman',
    [
      '`/mm add @usuario roblox_username`',
      '`/mm set @usuario roblox_username?`',
      '`/mm stats @usuario`',
      '`/mm list`',
      '`/mm closeforce` (solo middleman reclamante o admin)',
    ].join('\n')
  );
}

export async function handleMmCommand(ctx) {
  const isSlash = 'isChatInputCommand' in ctx && typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand();
  const args = isSlash ? resolveSlashArgs(ctx) : resolvePrefixArgs(ctx);
  const subcommand = args.subcommand ?? null;
  switch (subcommand) {
    case 'add':
      await handleMmAdd(ctx, args, { isSlash });
      break;
    case 'set':
      await handleMmSet(ctx, args, { isSlash });
      break;
    case 'stats':
      await handleMmStats(ctx, args, { isSlash });
      break;
    case 'list':
      await handleMmList(ctx, { isSlash });
      break;
    case 'closeforce':
      await handleMmCloseForce(ctx, { isSlash });
      break;
    default: {
      const usage = buildMmUsageEmbed();
      await sendCommandReply(ctx, usage, { ephemeral: isSlash });
      break;
    }
  }
}

async function resolveUserTag(client, userId) {
  if (!userId) return 'Usuario desconocido';
  try {
    const user = await client.users.fetch(String(userId));
    return `${user}`;
  } catch (error) {
    return `<@${userId}>`;
  }
}

async function handleMmAdd(ctx, args, { isSlash }) {
  const { userId, username } = args;
  if (!userId || !username) {
    const usage = buildTradeUpdateEmbed('⚠️ Faltan argumentos', 'Debes indicar un usuario y un username de Roblox.');
    await sendCommandReply(ctx, usage, { ephemeral: isSlash });
    return;
  }
  const lookup = await assertRobloxUser(username);
  if (!lookup.exists) {
    await sendCommandReply(ctx, { ...buildRobloxErrorEmbed(username) }, { ephemeral: isSlash });
    return;
  }
  await ensureUser(userId);
  await upsertMiddleman({
    discordUserId: userId,
    robloxUsername: lookup.user.name,
    robloxUserId: lookup.user.id,
  });
  const tag = await resolveUserTag(ctx.client, userId);
  const embed = buildTradeUpdateEmbed(
    '✅ Middleman registrado',
    [`Se registró ${tag} como middleman.`, `Roblox: **${lookup.user.name}** (${lookup.user.id})`].join('\n')
  );
  await sendCommandReply(ctx, embed, { ephemeral: isSlash });
  logger.flow('Middleman agregado/actualizado', userId, 'por', ctx.user?.id ?? ctx.author?.id);
}

async function handleMmSet(ctx, args, { isSlash }) {
  const { userId, username } = args;
  if (!userId) {
    const usage = buildTradeUpdateEmbed('⚠️ Faltan argumentos', 'Debes indicar a qué usuario deseas actualizar.');
    await sendCommandReply(ctx, usage, { ephemeral: isSlash });
    return;
  }
  const mm = await getMiddlemanByDiscordId(userId);
  if (!mm) {
    const embed = buildTradeUpdateEmbed('❌ Middleman no registrado', 'Registra al usuario primero con `/mm add`.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  let newRoblox = null;
  if (username) {
    const lookup = await assertRobloxUser(username);
    if (!lookup.exists) {
      await sendCommandReply(ctx, { ...buildRobloxErrorEmbed(username) }, { ephemeral: isSlash });
      return;
    }
    newRoblox = lookup;
    await updateMiddleman({
      discordUserId: userId,
      robloxUsername: lookup.user.name,
      robloxUserId: lookup.user.id,
    });
  } else {
    await updateMiddleman({ discordUserId: userId });
  }
  const tag = await resolveUserTag(ctx.client, userId);
  const embed = buildTradeUpdateEmbed(
    '🔁 Middleman actualizado',
    newRoblox
      ? [`Se actualizó la información de ${tag}.`, `Roblox ahora es **${newRoblox.user.name}** (${newRoblox.user.id}).`].join('\n')
      : `Se refrescaron los datos de ${tag}.`
  );
  await sendCommandReply(ctx, embed, { ephemeral: isSlash });
  logger.flow('Middleman actualizado', userId, 'por', ctx.user?.id ?? ctx.author?.id);
}

async function handleMmStats(ctx, args, { isSlash }) {
  const { userId } = args;
  if (!userId) {
    const usage = buildTradeUpdateEmbed('⚠️ Faltan argumentos', 'Indica qué middleman quieres consultar.');
    await sendCommandReply(ctx, usage, { ephemeral: isSlash });
    return;
  }
  const mm = await getMiddlemanByDiscordId(userId);
  if (!mm) {
    const embed = buildTradeUpdateEmbed('❌ Middleman no registrado', 'No se encontraron datos para este usuario.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const avg = computeAverageFromRecord(mm);
  const tag = await resolveUserTag(ctx.client, userId);
  const embed = buildTradeUpdateEmbed(
    '📊 Estadísticas de middleman',
    [
      `Usuario: ${tag}`,
      `Roblox: **${mm.roblox_username}**${mm.roblox_user_id ? ` (${mm.roblox_user_id})` : ''}`,
      `Vouches: **${mm.vouches_count}**`,
      `Promedio de estrellas: **${mm.rating_count ? avg.toFixed(2) : 'N/A'}** (${mm.rating_count} reseña${mm.rating_count === 1 ? '' : 's'})`,
    ].join('\n')
  );
  await sendCommandReply(ctx, embed, { ephemeral: isSlash });
}

async function handleMmList(ctx, { isSlash }) {
  const rows = await listTopMiddlemen(10);
  if (!rows.length) {
    const embed = buildTradeUpdateEmbed('ℹ️ Sin middlemans', 'Aún no se registran middlemans en la base de datos.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const description = await Promise.all(
    rows.map(async (row, index) => {
      const avg = computeAverageFromRecord(row);
      const tag = await resolveUserTag(ctx.client, row.discord_user_id);
      const ratingLabel = row.rating_count ? `${avg.toFixed(2)} ⭐ (${row.rating_count})` : 'Sin reseñas';
      return `${index + 1}. ${tag} — **${row.vouches_count}** vouches — ${ratingLabel}`;
    })
  );
  const embed = buildTradeUpdateEmbed('🏆 Top middlemans', description.join('\n'));
  await sendCommandReply(ctx, embed, { ephemeral: isSlash });
}

async function handleMmCloseForce(ctx, { isSlash }) {
  const channel = ctx.channel ?? (ctx.client?.channels ? await ctx.client.channels.fetch(ctx.channelId) : null);
  if (!channel || !channel.isTextBased?.()) {
    const embed = buildTradeUpdateEmbed('❌ Canal inválido', 'Este comando solo funciona dentro de un canal de ticket.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const ticket = await getTicketByChannel(channel.id);
  if (!ticket) {
    const embed = buildTradeUpdateEmbed('❌ Ticket no encontrado', 'No se halló un ticket asociado a este canal.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const result = await finalizeTrade({
    channel,
    ticket,
    forced: true,
    executorId: ctx.user?.id ?? ctx.author?.id ?? null,
  });
  if (!result.ok) {
    const embed = buildTradeUpdateEmbed('⚠️ No se pudo cerrar', result.reason ?? 'Intenta nuevamente.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const embed = buildTradeUpdateEmbed('⚠️ Cierre forzado ejecutado', 'Se cerró el trade y se publicó el resumen final.');
  await sendCommandReply(ctx, embed, { ephemeral: isSlash });
}

export async function handleMiddlemanMenu(interaction) {
  const [value] = interaction.values;
  if (value === 'info') {
    const info = buildMiddlemanInfo();
    await interaction.reply({ ...info, ephemeral: true, allowedMentions: { parse: [] } });
    return;
  }
  if (value === 'open') {
    await ensureUser(interaction.user.id);
    const openCount = await countOpenTicketsByUser(interaction.user.id, TICKET_TYPES.MIDDLEMAN);
    if (openCount >= CONFIG.MIDDLEMAN.MAX_TICKETS_PER_USER) {
      const limitEmbed = buildTicketLimitEmbed(CONFIG.MIDDLEMAN.MAX_TICKETS_PER_USER);
      await interaction.reply({ ...limitEmbed, ephemeral: true });
      return;
    }
    const { allowed, remainingMs } = checkCooldown(interaction.user.id, 'middleman_open', CONFIG.MIDDLEMAN.TICKET_COOLDOWN_MS);
    if (!allowed) {
      const cooldownEmbed = buildCooldownEmbed(remainingMs);
      await interaction.reply({ ...cooldownEmbed, ephemeral: true });
      return;
    }
    const modal = buildPartnerModal();
    await interaction.showModal(modal);
  }
}

function resolvePartnerMember(guild, input) {
  const parsedId = parseUser(input);
  if (parsedId) {
    if (guild.members.cache.has(parsedId)) {
      return guild.members.cache.get(parsedId);
    }
    return guild.members.fetch(parsedId).catch(() => null);
  }
  const normalized = input.toLowerCase();
  return guild.members.cache.find(
    (member) => member.user.username.toLowerCase() === normalized || member.displayName?.toLowerCase() === normalized
  );
}

async function createMiddlemanChannel({ interaction, partnerMember, context }) {
  const guild = interaction.guild;
  const ownerMember = interaction.member;
  const baseName = `mm-${ownerMember.displayName || ownerMember.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const partnerPart = (partnerMember.displayName || partnerMember.user.username).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const channelName = `${baseName}-${partnerPart}`.slice(0, 90);

  const parent = CONFIG.MIDDLEMAN.CATEGORY_ID ?? interaction.channel?.parentId ?? null;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: ownerMember.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.SendMessages],
    },
    {
      id: partnerMember.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.SendMessages],
    },
  ];
  if (CONFIG.ADMIN_ROLE_ID) {
    overwrites.push({ id: CONFIG.ADMIN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }
  if (CONFIG.MM_ROLE_ID) {
    overwrites.push({ id: CONFIG.MM_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites: overwrites,
  });

  try {
    await ensureUser(ownerMember.id);
    await ensureUser(partnerMember.id);
    const ticketId = await createTicket({
      guildId: guild.id,
      channelId: channel.id,
      ownerId: ownerMember.id,
      type: TICKET_TYPES.MIDDLEMAN,
    });
    await registerParticipant(ticketId, ownerMember.id);
    await registerParticipant(ticketId, partnerMember.id);

    await channel.send({
      ...buildTicketCreatedEmbed({ owner: ownerMember, partner: partnerMember, context }),
      allowedMentions: { parse: [] },
    });
    await ensurePanelMessage(channel, { owner: ownerMember, partner: partnerMember });

    return { channel, ticketId };
  } catch (error) {
    logger.error('Fallo configurando canal middleman recién creado', error);
    await channel.delete('Error configurando middleman').catch((deleteError) => {
      logger.warn('No se pudo eliminar canal fallido', deleteError);
    });
    throw error;
  }
}

export async function handleMiddlemanModal(interaction) {
  const partnerInput = interaction.fields.getTextInputValue('partner');
  const context = interaction.fields.getTextInputValue('context');
  await interaction.deferReply({ ephemeral: true });
  const partnerMember = await resolvePartnerMember(interaction.guild, partnerInput);
  if (!partnerMember) {
    const errorEmbed = buildTradeUpdateEmbed('❌ No encontramos al partner', 'Verifica que esté en el servidor e intenta de nuevo.');
    await interaction.editReply({ ...errorEmbed });
    return;
  }
  if (partnerMember.id === interaction.user.id) {
    const errorEmbed = buildTradeUpdateEmbed('❌ Partner inválido', 'Debes indicar a otra persona para abrir el middleman.');
    await interaction.editReply({ ...errorEmbed });
    return;
  }
  let channel;
  try {
    ({ channel } = await createMiddlemanChannel({ interaction, partnerMember, context }));
  } catch (error) {
    logger.error('No se pudo crear canal de middleman', error);
    const errorEmbed = buildTradeUpdateEmbed(
      '❌ No se pudo crear el canal',
      'Verifica los permisos del bot e intenta nuevamente o abre un ticket con el staff.'
    );
    await interaction.editReply({ ...errorEmbed });
    return;
  }
  const confirmation = buildTradeUpdateEmbed('✅ Middleman creado', `Se creó el canal ${channel} y se notificó a tu partner.`);
  await interaction.editReply({ ...confirmation, allowedMentions: { users: [partnerMember.id] } });
  logger.flow('Middleman creado', interaction.user.id, '->', partnerMember.id, 'canal', channel.id);
}

export async function handleTradeModal(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket no encontrado', 'No se encontró información del trade.'), ephemeral: true });
    return;
  }
  const robloxUsername = interaction.fields.getTextInputValue('roblox_username').trim();
  const items = interaction.fields.getTextInputValue('items').trim();
  const lookup = await assertRobloxUser(robloxUsername);
  if (!lookup.exists) {
    await interaction.reply({ ...buildRobloxErrorEmbed(robloxUsername), ephemeral: true });
    return;
  }
  await ensureUser(interaction.user.id);
  await upsertTradeData({
    ticketId: ticket.id,
    userId: interaction.user.id,
    robloxUsername: lookup.user.name,
    robloxUserId: lookup.user.id,
    items,
  });
  await resetTradeConfirmation(ticket.id, interaction.user.id);
  const participants = await fetchParticipants(interaction.guild, ticket);
  await ensurePanelMessage(interaction.channel, { owner: participants.owner, partner: participants.partner });
  await interaction.reply({ ...buildTradeUpdateEmbed('📝 Datos actualizados', 'Tu información de trade se guardó correctamente.'), ephemeral: true });
  if (lookup.user.isYoungerThanYear) {
    await interaction.channel.send({ ...buildRobloxWarningEmbed(lookup.user.name), allowedMentions: { parse: [] } });
  }
}

export async function handleTradeConfirm(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket no encontrado', 'No se encontró información del trade.'), ephemeral: true });
    return;
  }
  const trade = await getTrade(ticket.id, interaction.user.id);
  if (!trade) {
    await interaction.reply({ ...buildTradeUpdateEmbed('📝 Falta información', 'Primero registra tus datos con el botón **Mis datos de trade**.'), ephemeral: true });
    return;
  }
  if (trade.confirmed) {
    await interaction.reply({ ...buildTradeUpdateEmbed('✅ Ya confirmaste', 'Tu confirmación ya fue registrada.'), ephemeral: true });
    return;
  }
  await setTradeConfirmed(ticket.id, interaction.user.id);
  const participants = await fetchParticipants(interaction.guild, ticket);
  await ensurePanelMessage(interaction.channel, { owner: participants.owner, partner: participants.partner });
  await interaction.reply({ ...buildTradeUpdateEmbed('✅ Confirmado', 'Tu confirmación quedó registrada. Espera a que la otra parte confirme.'), ephemeral: true });
  const trades = await getTradesByTicket(ticket.id);
  if (trades.every((t) => t.confirmed)) {
    const { ownerId, partnerId } = resolveParticipantIds(ticket, participants);
    const targetsToLock = [ownerId, partnerId].filter(Boolean);
    if (targetsToLock.length === 0) {
      logger.warn('No se encontraron participantes válidos para bloquear el canal middleman', ticket.id, interaction.channel.id);
    }
    await Promise.all(targetsToLock.map((id) => updateSendPermission(interaction.channel, id, false)));
    await ensurePanelMessage(interaction.channel, { owner: participants.owner, partner: participants.partner, disabled: true });
    await interaction.followUp({
      ...buildTradeLockedEmbed(CONFIG.MM_ROLE_ID),
      allowedMentions: { roles: CONFIG.MM_ROLE_ID ? [CONFIG.MM_ROLE_ID] : [] },
      ephemeral: false,
    });
    await interaction.channel.send({
      ...buildClaimPromptEmbed(CONFIG.MM_ROLE_ID),
      allowedMentions: { roles: CONFIG.MM_ROLE_ID ? [CONFIG.MM_ROLE_ID] : [] },
    });
    const claim = await getClaimByTicket(ticket.id);
    if (claim && !claim.vouched) {
      await incrementMiddlemanVouch(claim.middleman_user_id);
      await markClaimVouched(ticket.id);
      logger.flow('Vouch sumado por confirmaciones completas', claim.middleman_user_id, 'ticket', ticket.id);
    }
  }
}

export async function handleTradeHelp(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket no encontrado', 'No se encontró información del trade.'), ephemeral: true });
    return;
  }
  const participants = await fetchParticipants(interaction.guild, ticket);
  const { ownerId, partnerId } = resolveParticipantIds(ticket, participants);
  const targetsToUnlock = [ownerId, partnerId].filter(Boolean);
  if (targetsToUnlock.length === 0) {
    logger.warn('No se encontraron participantes válidos para desbloquear el canal middleman', ticket.id, interaction.channel.id);
  }
  await Promise.all(targetsToUnlock.map((id) => updateSendPermission(interaction.channel, id, true)));
  const help = buildHelpEmbed(CONFIG.ADMIN_ROLE_ID);
  await interaction.reply({ ...help, allowedMentions: { roles: CONFIG.ADMIN_ROLE_ID ? [CONFIG.ADMIN_ROLE_ID] : [] } });
  setTimeout(async () => {
    try {
      await Promise.all(targetsToUnlock.map((id) => updateSendPermission(interaction.channel, id, false)));
      const updatedTrades = await getTradesByTicket(ticket.id);
      await ensurePanelMessage(interaction.channel, {
        owner: participants.owner,
        partner: participants.partner,
        disabled: updatedTrades.every((t) => t.confirmed),
      });
      await interaction.channel.send({ ...buildTradeUpdateEmbed('🔒 Canal relockeado', 'Se restauraron los permisos después de la solicitud de ayuda.'), allowedMentions: { parse: [] } });
    } catch (error) {
      logger.warn('No se pudo relockear canal tras ayuda', error);
    }
  }, CONFIG.MIDDLEMAN.HELP_UNLOCK_MS).unref?.();
}

async function finalizeTrade({ channel, ticket, forced = false, executorId = null }) {
  const claim = await getClaimByTicket(ticket.id);
  if (!claim) {
    return { ok: false, reason: 'No hay middleman reclamado para este ticket.' };
  }
  if (claim.closed_at) {
    return { ok: false, reason: 'Este trade ya fue cerrado previamente.' };
  }
  const participants = await fetchParticipants(channel.guild, ticket);
  const trades = await getTradesByTicket(ticket.id);
  const ownerTrade = trades.find((t) => String(t.user_id) === String(participants.owner.id));
  const partnerTrade = trades.find((t) => String(t.user_id) === String(participants.partner.id));
  const middlemanTag = `<@${claim.middleman_user_id}>`;
  const payload = buildTradeCompletedMessage({
    middlemanTag,
    userOne: {
      label: participants.owner?.toString?.() ?? participants.owner?.displayName ?? participants.owner?.user?.username ?? 'Usuario 1',
      roblox: ownerTrade?.roblox_username ?? 'Sin registro',
      items: ownerTrade?.items ?? 'Sin información',
    },
    userTwo: {
      label: participants.partner?.toString?.() ?? participants.partner?.displayName ?? participants.partner?.user?.username ?? 'Usuario 2',
      roblox: partnerTrade?.roblox_username ?? 'Sin registro',
      items: partnerTrade?.items ?? 'Sin información',
    },
  });
  if (forced) {
    payload.embeds[0].addFields({ name: 'Estado del cierre', value: 'Forzado por el staff/middleman', inline: false });
  }
  const allowedMentions = {
    users: [claim.middleman_user_id, participants.owner?.id, participants.partner?.id]
      .filter(Boolean)
      .map((id) => String(id)),
  };
  await channel.send({ ...payload, allowedMentions });

  const logsChannelId = CONFIG.TRADE_LOGS_CHANNEL_ID;
  if (logsChannelId) {
    try {
      const logsChannel = await channel.client.channels.fetch(logsChannelId);
      if (logsChannel?.isTextBased?.()) {
        const logPayload = buildTradeCompletedMessage({
          middlemanTag,
          userOne: {
            label: participants.owner?.toString?.() ?? participants.owner?.displayName ?? participants.owner?.user?.username ?? 'Usuario 1',
            roblox: ownerTrade?.roblox_username ?? 'Sin registro',
            items: ownerTrade?.items ?? 'Sin información',
          },
          userTwo: {
            label: participants.partner?.toString?.() ?? participants.partner?.displayName ?? participants.partner?.user?.username ?? 'Usuario 2',
            roblox: partnerTrade?.roblox_username ?? 'Sin registro',
            items: partnerTrade?.items ?? 'Sin información',
          },
        });
        if (forced) {
          logPayload.embeds[0].addFields({ name: 'Estado del cierre', value: 'Forzado por el staff/middleman', inline: false });
        }
        await logsChannel.send({ ...logPayload, allowedMentions: { parse: [] } });
      }
    } catch (error) {
      logger.warn('No se pudo enviar log de trade completado', error);
    }
  }

  await markClaimClosed(ticket.id, { forced });
  await setTicketStatus(ticket.id, 'closed');
  if (forced) {
    logger.warn('Trade cerrado forzosamente', ticket.id, 'por', executorId ?? 'desconocido');
  } else {
    logger.flow('Trade completado y cerrado', ticket.id, 'por', executorId ?? 'automático');
  }
  return { ok: true };
}

async function handleClaimButton(interaction) {
  const member = interaction.member;
  const isAdmin = userIsAdmin(member, CONFIG.ADMIN_ROLE_ID);
  const isMiddleman = member?.roles?.cache?.has(CONFIG.MM_ROLE_ID);
  if (!isAdmin && !isMiddleman) {
    await interaction.reply({ ...buildTradeUpdateEmbed('⛔ Permisos insuficientes', 'Solo middlemans o admins pueden reclamar este ticket.'), ephemeral: true });
    return;
  }
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket inválido', 'No se encontró información para este canal.'), ephemeral: true });
    return;
  }
  const existing = await getClaimByTicket(ticket.id);
  if (existing && String(existing.middleman_user_id) !== String(interaction.user.id)) {
    await interaction.reply({ ...buildTradeUpdateEmbed('⏳ Ya reclamado', 'Otro middleman ya está atendiendo este ticket.'), ephemeral: true });
    return;
  }
  const middleman = await getMiddlemanByDiscordId(interaction.user.id);
  if (!middleman) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ No registrado', 'No estás en la base de datos de middlemans. Solicita a un admin que te registre.'), ephemeral: true });
    return;
  }
  await createClaim({ ticketId: ticket.id, middlemanUserId: interaction.user.id });
  const card = await generateForRobloxUser({
    robloxUsername: middleman.roblox_username,
    robloxUserId: middleman.roblox_user_id,
    rating: computeAverageFromRecord(middleman),
    ratingCount: middleman.rating_count,
    vouches: middleman.vouches_count,
  }).catch((error) => {
    logger.warn('No se pudo generar tarjeta de middleman', error);
    return null;
  });
  const payload = buildTicketClaimedMessage({
    mmTag: interaction.user.toString(),
    robloxUsername: middleman.roblox_username,
    vouches: middleman.vouches_count,
    avgStars: computeAverageFromRecord(middleman),
  });
  const files = [...payload.files];
  if (card) {
    files.push(card);
  }
  await interaction.reply({ ...payload, files, allowedMentions: { users: [interaction.user.id] } });
  try {
    const disabledRow = claimRow();
    disabledRow.components[0].setDisabled(true);
    await interaction.message.edit({ components: [disabledRow] });
  } catch (error) {
    logger.warn('No se pudo deshabilitar botón de reclamo', error);
  }
  const reviewPrompt = buildReviewPromptForMiddleman(interaction.user.toString());
  await interaction.channel.send({ ...reviewPrompt, allowedMentions: { users: [interaction.user.id] } });
  logger.flow('MM', interaction.user.tag, 'reclamó ticket', interaction.channel.id);
}

async function handleRequestReviewsButton(interaction) {
  const member = interaction.member;
  const isAdmin = userIsAdmin(member, CONFIG.ADMIN_ROLE_ID);
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket inválido', 'No se encontró información para este canal.'), ephemeral: true });
    return;
  }
  const claim = await getClaimByTicket(ticket.id);
  if (!claim) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Sin middleman', 'Debes reclamar el ticket antes de solicitar reseñas.'), ephemeral: true });
    return;
  }
  const isOwner = String(claim.middleman_user_id) === String(interaction.user.id);
  if (!isOwner && !isAdmin) {
    await interaction.reply({ ...buildTradeUpdateEmbed('⛔ Permisos insuficientes', 'Solo el middleman asignado puede solicitar reseñas.'), ephemeral: true });
    return;
  }
  if (claim.review_requested_at) {
    await interaction.reply({ ...buildTradeUpdateEmbed('ℹ️ Ya enviado', 'Las reseñas ya fueron solicitadas en este ticket.'), ephemeral: true });
    return;
  }
  await markReviewRequested(ticket.id);
  const participants = await fetchParticipants(interaction.guild, ticket);
  const prompt = buildRequestReviewsMessage({
    mmTag: interaction.user.toString(),
    ownerMention: participants.owner?.toString?.() ?? null,
    partnerMention: participants.partner?.toString?.() ?? null,
  });
  const mentionTargets = [participants.owner?.id, participants.partner?.id]
    .filter(Boolean)
    .map((id) => String(id));
  await interaction.channel.send({ ...prompt, allowedMentions: { users: mentionTargets } });
  try {
    const disabledRow = requestReviewRow();
    disabledRow.components[0].setDisabled(true);
    await interaction.message.edit({ components: [disabledRow] });
  } catch (error) {
    logger.warn('No se pudo deshabilitar botón de reseñas', error);
  }
  await interaction.reply({ ...buildTradeUpdateEmbed('✅ Solicitud enviada', 'Se invitó a los usuarios a dejar su reseña.'), ephemeral: true });
  logger.flow('Solicitadas reseñas para ticket', ticket.id, 'por', interaction.user.tag);
}

async function handleOpenReviewButton(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket inválido', 'No se encontró información para este canal.'), ephemeral: true });
    return;
  }
  const participants = await listParticipants(ticket.id);
  if (!participants.includes(String(interaction.user.id))) {
    await interaction.reply({ ...buildTradeUpdateEmbed('⛔ No participas en el trade', 'Solo los traders pueden dejar reseña.'), ephemeral: true });
    return;
  }
  const already = await hasReviewFromUser(ticket.id, interaction.user.id);
  if (already) {
    await interaction.reply({ ...buildTradeUpdateEmbed('ℹ️ Ya registraste reseña', 'Solo puedes enviar una reseña por trade.'), ephemeral: true });
    return;
  }
  const modal = buildReviewModal();
  await interaction.showModal(modal);
}

async function handleReviewModalSubmit(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket inválido', 'No se encontró información para este canal.'), ephemeral: true });
    return;
  }
  const claim = await getClaimByTicket(ticket.id);
  if (!claim) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Sin middleman', 'No se registró un middleman para este ticket.'), ephemeral: true });
    return;
  }
  const participants = await listParticipants(ticket.id);
  if (!participants.includes(String(interaction.user.id))) {
    await interaction.reply({ ...buildTradeUpdateEmbed('⛔ No participas en el trade', 'Solo los traders pueden dejar reseña.'), ephemeral: true });
    return;
  }
  const starsRaw = interaction.fields.getTextInputValue('stars');
  const stars = Number.parseInt(starsRaw, 10);
  if (!Number.isInteger(stars) || stars < 0 || stars > 5) {
    await interaction.reply({ ...buildTradeUpdateEmbed('⚠️ Calificación inválida', 'Debes ingresar un número entero entre 0 y 5.'), ephemeral: true });
    return;
  }
  const text = interaction.fields.getTextInputValue('review_text')?.slice(0, 400) ?? null;
  try {
    await createReview({
      ticketId: ticket.id,
      reviewerUserId: interaction.user.id,
      middlemanUserId: claim.middleman_user_id,
      stars,
      reviewText: text,
    });
  } catch (error) {
    if (error instanceof DuplicateReviewError) {
      await interaction.reply({ ...buildTradeUpdateEmbed('ℹ️ Ya registraste reseña', 'Solo puedes enviar una reseña por trade.'), ephemeral: true });
      return;
    }
    logger.error('No se pudo registrar reseña', error);
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Error', 'No se pudo guardar tu reseña. Intenta nuevamente más tarde.'), ephemeral: true });
    return;
  }

  await addMiddlemanRating(claim.middleman_user_id, stars);
  const middleman = await getMiddlemanByDiscordId(claim.middleman_user_id);
  const card = await generateForRobloxUser({
    robloxUsername: middleman?.roblox_username,
    robloxUserId: middleman?.roblox_user_id,
    rating: computeAverageFromRecord(middleman),
    ratingCount: middleman?.rating_count,
    vouches: middleman?.vouches_count,
  }).catch((error) => {
    logger.warn('No se pudo generar tarjeta para reseña', error);
    return null;
  });
  if (CONFIG.REVIEWS_CHANNEL_ID) {
    try {
      const reviewsChannel = await interaction.client.channels.fetch(CONFIG.REVIEWS_CHANNEL_ID);
      if (reviewsChannel?.isTextBased?.()) {
        const reviewEmbed = buildReviewPublishedEmbed({
          reviewerTag: interaction.user.toString(),
          stars,
          text,
          mmTag: `<@${claim.middleman_user_id}>`,
        });
        const files = [...reviewEmbed.files];
        if (card) files.push(card);
        await reviewsChannel.send({ ...reviewEmbed, files, allowedMentions: { users: [interaction.user.id, claim.middleman_user_id] } });
      }
    } catch (error) {
      logger.warn('No se pudo publicar reseña en canal dedicado', error);
    }
  }

  await interaction.reply({ ...buildTradeUpdateEmbed('✅ ¡Gracias por tu reseña!', 'Se registró tu opinión correctamente.'), ephemeral: true });
  logger.flow('Reseña registrada', interaction.user.tag, 'ticket', ticket.id, 'stars', stars);

  const reviewsCount = await countReviewsForTicket(ticket.id);
  const uniqueParticipants = new Set(participants);
  if (reviewsCount >= uniqueParticipants.size) {
    const claimAfter = await getClaimByTicket(ticket.id);
    if (claimAfter && !claimAfter.vouched) {
      await incrementMiddlemanVouch(claimAfter.middleman_user_id);
      await markClaimVouched(ticket.id);
      logger.flow('Vouch sumado por reseñas completas', claimAfter.middleman_user_id, 'ticket', ticket.id);
    }
    const channel = interaction.channel ?? (await interaction.client.channels.fetch(ticket.channel_id).catch(() => null));
    if (channel?.isTextBased?.()) {
      await finalizeTrade({ channel, ticket, forced: false, executorId: interaction.user.id });
    }
  }
}

export function isMiddlemanComponent(interaction) {
  return [
    INTERACTION_IDS.MIDDLEMAN_MENU,
    INTERACTION_IDS.MIDDLEMAN_MODAL_PARTNER,
    INTERACTION_IDS.MIDDLEMAN_MODAL_TRADE,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_DATA,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_CONFIRM,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_HELP,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_CLAIM,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_REQUEST_REVIEW,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_OPEN_REVIEW,
    INTERACTION_IDS.MIDDLEMAN_MODAL_REVIEW,
  ].includes(interaction.customId);
}

export async function handleMiddlemanComponent(interaction) {
  switch (interaction.customId) {
    case INTERACTION_IDS.MIDDLEMAN_MENU:
      await handleMiddlemanMenu(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_MODAL_PARTNER:
      await handleMiddlemanModal(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_MODAL_TRADE:
      await handleTradeModal(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_BUTTON_DATA: {
      const modal = buildTradeModal();
      await interaction.showModal(modal);
      break;
    }
    case INTERACTION_IDS.MIDDLEMAN_BUTTON_CONFIRM:
      await handleTradeConfirm(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_BUTTON_HELP:
      await handleTradeHelp(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_BUTTON_CLAIM:
      await handleClaimButton(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_BUTTON_REQUEST_REVIEW:
      await handleRequestReviewsButton(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_BUTTON_OPEN_REVIEW:
      await handleOpenReviewButton(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_MODAL_REVIEW:
      await handleReviewModalSubmit(interaction);
      break;
    default:
      break;
  }
}
