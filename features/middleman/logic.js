import {
  ChannelType,
  OverwriteType,
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
  buildMiddlemanStatsMessage,
  buildPartnerModal,
  buildFinalizationPrompt,
  buildRequestReviewsMessage,
  buildReviewModal,
  buildReviewPublishedEmbed,
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
import {
  createClaim,
  getClaimByTicket,
  markClaimClosed,
  markClaimVouched,
  setClaimFinalizationMessageId,
  setClaimPanelMessageId,
} from '../../services/mmClaims.repo.js';
import {
  addMiddlemanRating,
  getMiddlemanByDiscordId,
  incrementMiddlemanVouch,
  listTopMiddlemen,
  updateMiddleman,
  upsertMiddleman,
} from '../../services/middlemen.repo.js';
import {
  createReview,
  DuplicateReviewError,
  countReviewsForTicket,
  getReviewsForTicket,
  hasReviewFromUser,
} from '../../services/mmReviews.repo.js';
import { listFinalizations, resetFinalizations, setFinalizationConfirmed } from '../../services/mmFinalizations.repo.js';
import { incrementMemberTrade } from '../../services/memberStats.repo.js';
import { checkCooldown } from '../../utils/cooldowns.js';
import { parseUser } from '../../utils/helpers.js';
import { assertRobloxUser } from '../../utils/roblox.js';
import { logger } from '../../utils/logger.js';
import { generateForRobloxUser } from '../../services/canvasCard.js';
import { userIsAdmin } from '../../utils/permissions.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { sendCommandReply } from '../../utils/respond.js';

const tradePanelMessages = new Map();
const finalizationMessages = new Map();

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

function sanitizeChannelSegment(value, fallback) {
  const base = String(value ?? fallback ?? 'usuario')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base ? base.slice(0, 16) : 'usuario';
}

function buildChannelStatusName({ owner, partner, state }) {
  const prefix = state?.channelStatus ?? 'mm';
  const ownerSegment = sanitizeChannelSegment(owner?.displayName ?? owner?.user?.username, 'owner');
  const partnerSegment = sanitizeChannelSegment(partner?.displayName ?? partner?.user?.username, 'partner');
  const composed = [prefix, ownerSegment, partnerSegment].filter(Boolean).join('-');
  return composed.slice(0, 90);
}

function formatMention(target) {
  if (!target) return 'al otro trader';
  if (typeof target.toString === 'function') {
    const value = target.toString();
    if (value) return value;
  }
  const id = normalizeSnowflake(target.id ?? target.user?.id);
  return id ? `<@${id}>` : 'al otro trader';
}

function computeTradeState({ ticket, trades, claim, participants }) {
  const { ownerId, partnerId } = resolveParticipantIds(ticket, participants);
  const ownerTrade = ownerId ? trades.find((t) => String(t.user_id) === String(ownerId)) ?? null : null;
  const partnerTrade = partnerId ? trades.find((t) => String(t.user_id) === String(partnerId)) ?? null : null;
  const ownerConfirmed = Boolean(ownerTrade?.confirmed);
  const partnerConfirmed = Boolean(partnerTrade?.confirmed);
  const ownerHasData = Boolean(ownerTrade);
  const partnerHasData = Boolean(partnerTrade);
  const pendingUsers = [];
  if (!ownerConfirmed) pendingUsers.push(participants.owner);
  if (!partnerConfirmed) pendingUsers.push(participants.partner);
  const everyoneConfirmed = ownerConfirmed && partnerConfirmed;
  const tradeStatusKey = everyoneConfirmed ? 'confirmed' : 'not-confirmed';
  const claimStatus = claim?.closed_at ? 'closed' : claim ? 'claimed' : 'unclaimed';

  let summary = 'Completa tus datos y confirma cuando estés listo.';
  if (!ownerHasData || !partnerHasData) {
    summary = 'Ambos deben registrar sus datos de trade antes de confirmar.';
  } else if (!everyoneConfirmed) {
    const pendingMentions = pendingUsers
      .filter(Boolean)
      .map((user) => formatMention(user))
      .filter(Boolean);
    if (pendingMentions.length === 1) {
      summary = `Esperando confirmación de ${pendingMentions[0]}.`;
    } else if (pendingMentions.length === 2) {
      summary = `Esperando confirmación de ${pendingMentions[0]} y ${pendingMentions[1]}.`;
    }
  } else if (claimStatus === 'unclaimed') {
    summary = 'Trade listo. Espera a que un middleman lo reclame.';
  } else if (claimStatus === 'claimed') {
    summary = claim?.middleman_user_id
      ? `Middleman atendiendo: <@${claim.middleman_user_id}>.`
      : 'Middleman atendiendo el trade.';
  } else if (claimStatus === 'closed') {
    summary = 'Trade finalizado.';
  }

  let title = 'Seguimiento';
  if (!ownerHasData || !partnerHasData) {
    title = 'Datos pendientes';
  } else if (!everyoneConfirmed) {
    title = 'Confirmaciones pendientes';
  } else if (claimStatus === 'unclaimed') {
    title = 'Esperando middleman';
  } else if (claimStatus === 'claimed') {
    title = 'Atendido por middleman';
  } else if (claimStatus === 'closed') {
    title = 'Cerrado';
  }

  let claimStatusLabel = null;
  if (claimStatus === 'claimed') {
    claimStatusLabel = claim?.middleman_user_id
      ? `Reclamado por <@${claim.middleman_user_id}>`
      : 'Reclamado por un middleman.';
  } else if (claimStatus === 'unclaimed') {
    claimStatusLabel = 'Aún no ha sido reclamado por un middleman.';
  } else if (claimStatus === 'closed') {
    claimStatusLabel = 'Este trade fue cerrado.';
  }

  const channelStatus = (ticket.status ?? '').toUpperCase() === 'CLOSED' ? 'mm-closed' : `mm-${tradeStatusKey}-${claimStatus}`;

  return {
    owner: { trade: ownerTrade, hasData: ownerHasData, confirmed: ownerConfirmed },
    partner: { trade: partnerTrade, hasData: partnerHasData, confirmed: partnerConfirmed },
    tradeStatus: tradeStatusKey,
    claimStatus,
    claimStatusLabel,
    summary,
    title,
    everyoneConfirmed,
    channelStatus,
    middlemanId: claim?.middleman_user_id ?? null,
  };
}

function mapReviewsForPanel(reviews = []) {
  return reviews.map((review) => ({
    stars: review.stars ?? 0,
    reviewer: review.reviewer_user_id ? `<@${review.reviewer_user_id}>` : 'Usuario desconocido',
    text: review.review_text?.slice(0, 200) ?? '',
  }));
}

async function applyChannelStatus(channel, { owner, partner, state }) {
  if (!state) return;
  const nextName = buildChannelStatusName({ owner, partner, state });
  if (!nextName || channel.name === nextName) {
    return;
  }
  try {
    await channel.setName(nextName);
  } catch (error) {
    logger.warn('No se pudo actualizar el nombre del canal middleman', channel.id, nextName, error);
  }
}

function isTradeParticipant(userId, ticket, participants) {
  const { ownerId, partnerId } = resolveParticipantIds(ticket, participants);
  const normalized = normalizeSnowflake(userId);
  return Boolean(normalized && [ownerId, partnerId].filter(Boolean).some((id) => String(id) === normalized));
}

async function ensureTraderAccess(interaction, ticket, participants) {
  if (isTradeParticipant(interaction.user.id, ticket, participants)) {
    return true;
  }
  await interaction.reply({
    ...buildTradeUpdateEmbed('⛔ No participas en el trade', 'Solo los traders pueden usar este botón.'),
    ephemeral: true,
  });
  return false;
}

async function updateSendPermission(channel, userId, value) {
  const targetId = normalizeSnowflake(userId);
  if (!targetId) {
    return false;
  }

  const member =
    channel.guild.members.cache.get(targetId) ??
    (await channel.guild.members.fetch(targetId).catch(() => null));

  const user = member
    ? member
    : channel.client.users.cache.get(targetId) ??
      (await channel.client.users.fetch(targetId).catch(() => null));

  if (!user) {
    logger.warn('No se pudo resolver usuario para actualizar permisos', targetId);
    return false;
  }

  const overwriteOptions =
    typeof OverwriteType?.Member === 'number' ? { type: OverwriteType.Member } : undefined;

  try {
    if (overwriteOptions) {
      await channel.permissionOverwrites.edit(user, { SendMessages: value }, overwriteOptions);
    } else {
      await channel.permissionOverwrites.edit(user, { SendMessages: value });
    }
    return true;
  } catch (error) {
    logger.warn('No se pudo actualizar permisos para el usuario', targetId, error);
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
      interaction.options.getUser('usuario') ??
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
  if (subcommand === 'stats') {
    return true;
  }
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

export async function canExecuteCloseCommand(member, ctx) {
  if (userIsAdmin(member, CONFIG.ADMIN_ROLE_ID)) {
    return true;
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
  if (!claim || claim.closed_at) {
    return false;
  }
  return String(claim.middleman_user_id) === String(member.id);
}

async function ensurePanelMessage(channel, { owner, partner, disabled } = {}) {
  const ticket = await getTicketByChannel(channel.id);
  if (!ticket) {
    logger.warn('No se encontró ticket asociado al canal', channel.id);
    return { message: null, state: null };
  }
  const trades = await getTradesByTicket(ticket.id);
  const claim = await getClaimByTicket(ticket.id);
  const participants = await fetchParticipants(channel.guild, ticket);
  const ownerMember = owner ?? participants.owner;
  const partnerMember = partner ?? participants.partner;
  const normalizedParticipants = {
    ...participants,
    owner: ownerMember,
    partner: partnerMember,
  };
  const state = computeTradeState({ ticket, trades, claim, participants: normalizedParticipants });
  const payload = disabled
    ? buildDisabledPanel({ owner: ownerMember, partner: partnerMember, trades, state })
    : buildTradePanel({ owner: ownerMember, partner: partnerMember, trades, state });
  const existingId = tradePanelMessages.get(channel.id);
  if (existingId) {
    try {
      const message = await channel.messages.fetch(existingId);
      await message.edit({ ...payload, allowedMentions: { parse: [] } });
      await applyChannelStatus(channel, { owner: ownerMember, partner: partnerMember, state });
      return { message, state };
    } catch (error) {
      logger.warn('No se pudo actualizar panel, creando uno nuevo', error);
    }
  }
  const message = await channel.send({ ...payload, allowedMentions: { parse: [] } });
  tradePanelMessages.set(channel.id, message.id);
  await applyChannelStatus(channel, { owner: ownerMember, partner: partnerMember, state });
  return { message, state };
}

async function ensureFinalizationPanel(channel, { ticket, claim, owner, partner, confirmations = [], completed = false }) {
  const confirmedIds = new Set(confirmations.filter(Boolean).map((id) => String(id)));
  const payload = buildFinalizationPrompt({ owner, partner, confirmedIds, completed });
  const storedId = finalizationMessages.get(channel.id) ?? claim?.finalization_message_id ?? null;
  if (storedId) {
    try {
      const message = await channel.messages.fetch(storedId);
      await message.edit({ ...payload, allowedMentions: { parse: [] } });
      finalizationMessages.set(channel.id, message.id);
      return message;
    } catch (error) {
      logger.warn('No se pudo actualizar panel de cierre, se enviará uno nuevo', {
        channelId: channel.id,
        storedId,
        reason: error.message,
      });
    }
  }
  const message = await channel.send({ ...payload, allowedMentions: { parse: [] } });
  finalizationMessages.set(channel.id, message.id);
  await setClaimFinalizationMessageId(ticket.id, message.id);
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
      '`/mmstats @usuario?` (acceso público)',
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

export async function handleStandaloneMmStatsCommand(ctx) {
  const isSlash = 'isChatInputCommand' in ctx && typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand();
  let targetId = null;
  if (isSlash) {
    const option =
      ctx.options.getUser?.('usuario') ??
      ctx.options.getUser?.('user') ??
      ctx.options.getUser?.('target');
    targetId = option?.id ?? ctx.user?.id ?? null;
  } else {
    const content = ctx.content ?? '';
    const [, maybeTarget] = content.trim().split(/\s+/, 2);
    targetId = parseUser(maybeTarget) ?? ctx.author?.id ?? null;
  }
  if (!targetId) {
    const usage = buildTradeUpdateEmbed(
      '⚠️ Faltan argumentos',
      'Menciona qué middleman quieres consultar o ejecútalo sin argumentos para ver tus propios datos.'
    );
    await sendCommandReply(ctx, usage, { ephemeral: isSlash });
    return;
  }
  await respondMmStats(ctx, targetId, { isSlash });
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

async function respondMmStats(ctx, targetUserId, { isSlash }) {
  const mm = await getMiddlemanByDiscordId(targetUserId);
  if (!mm) {
    const embed = buildTradeUpdateEmbed('❌ Middleman no registrado', 'No se encontraron datos para este usuario.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const avg = computeAverageFromRecord(mm);
  const tag = await resolveUserTag(ctx.client, targetUserId);
  const payload = buildMiddlemanStatsMessage({
    mmTag: tag,
    robloxUsername: mm.roblox_username,
    vouches: mm.vouches_count,
    avgStars: avg,
    reviewsCount: mm.rating_count,
  });
  const files = [...payload.files];
  const card = await generateForRobloxUser({
    robloxUsername: mm.roblox_username,
    robloxUserId: mm.roblox_user_id,
    rating: avg,
    ratingCount: mm.rating_count,
    vouches: mm.vouches_count,
  }).catch((error) => {
    logger.warn('No se pudo generar tarjeta de middleman para stats', {
      userId: targetUserId,
      reason: error?.message ?? error,
    });
    return null;
  });
  if (card) {
    files.push(card);
  }
  const allowedMentions = { users: [String(targetUserId)] };
  await sendCommandReply(
    ctx,
    { ...payload, files, allowedMentions },
    { ephemeral: false }
  );
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
  const existing = await getMiddlemanByDiscordId(userId);
  await ensureUser(userId);
  const sameData =
    existing &&
    existing.roblox_username?.toLowerCase?.() === lookup.user.name.toLowerCase() &&
    String(existing.roblox_user_id ?? '') === String(lookup.user.id ?? '');
  const tag = await resolveUserTag(ctx.client, userId);
  if (sameData) {
    const embed = buildTradeUpdateEmbed(
      'ℹ️ Middleman ya registrado',
      [`${tag} ya está registrado como middleman.`, `Roblox actual: **${existing.roblox_username}** (${existing.roblox_user_id ?? 'sin ID'})`].join('\n')
    );
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  await upsertMiddleman({
    discordUserId: userId,
    robloxUsername: lookup.user.name,
    robloxUserId: lookup.user.id,
  });
  const embed = buildTradeUpdateEmbed(
    existing
      ? '🔁 Middleman actualizado'
      : '✅ Middleman registrado',
    existing
      ? [`Se actualizó la información de ${tag}.`, `Roblox ahora es **${lookup.user.name}** (${lookup.user.id}).`].join('\n')
      : [`Se registró ${tag} como middleman.`, `Roblox: **${lookup.user.name}** (${lookup.user.id})`].join('\n')
  );
  await sendCommandReply(ctx, embed, { ephemeral: isSlash });
  logger.flow(
    existing ? 'Middleman actualizado via add' : 'Middleman agregado',
    userId,
    'por',
    ctx.user?.id ?? ctx.author?.id
  );
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
  const targetId = args.userId ?? ctx.user?.id ?? ctx.author?.id ?? null;
  if (!targetId) {
    const usage = buildTradeUpdateEmbed(
      '⚠️ Faltan argumentos',
      'Indica qué middleman quieres consultar o déjalo vacío para verte a ti mismo.'
    );
    await sendCommandReply(ctx, usage, { ephemeral: isSlash });
    return;
  }
  await respondMmStats(ctx, targetId, { isSlash });
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

export async function handleCloseCommand(ctx) {
  const isSlash = 'isChatInputCommand' in ctx && typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand();
  const channel = ctx.channel ?? (ctx.client?.channels ? await ctx.client.channels.fetch(ctx.channelId) : null);
  if (!channel || !channel.isTextBased?.()) {
    const embed = buildTradeUpdateEmbed('❌ Canal inválido', 'Este comando debe ejecutarse dentro del canal del trade.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const ticket = await getTicketByChannel(channel.id);
  if (!ticket) {
    const embed = buildTradeUpdateEmbed('❌ Ticket no encontrado', 'No se halló información para este canal.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  if ((ticket.status ?? '').toUpperCase() === 'CLOSED') {
    const embed = buildTradeUpdateEmbed('ℹ️ Trade cerrado', 'Este trade ya fue marcado como finalizado anteriormente.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const claim = await getClaimByTicket(ticket.id);
  if (!claim || claim.closed_at) {
    const embed = buildTradeUpdateEmbed('❌ Sin middleman activo', 'No se encontró un middleman atendiendo este trade.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const participants = await fetchParticipants(channel.guild, ticket);
  const { state } = await ensurePanelMessage(channel, {
    owner: participants.owner,
    partner: participants.partner,
  });
  if (!state?.everyoneConfirmed) {
    const embed = buildTradeUpdateEmbed('⌛ Aún no está listo', 'Ambos traders deben confirmar el inicio antes de cerrar el trade.');
    await sendCommandReply(ctx, embed, { ephemeral: isSlash });
    return;
  }
  const confirmations = await listFinalizations(ticket.id);
  await ensureFinalizationPanel(channel, {
    ticket,
    claim,
    owner: participants.owner,
    partner: participants.partner,
    confirmations,
    completed: false,
  });
  const embed = buildTradeUpdateEmbed('✅ Panel enviado', 'Se solicitó confirmación final a ambos traders.');
  await sendCommandReply(ctx, embed, { ephemeral: isSlash });
  logger.flow('Panel de cierre del trade solicitado', ticket.id, 'por', ctx.user?.id ?? ctx.author?.id ?? 'desconocido');
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

async function resolvePartnerMember(guild, rawInput) {
  const input = rawInput?.trim();
  if (!input) {
    logger.warn('resolvePartnerMember: input vacío', { guildId: guild.id, rawInput });
    return null;
  }

  const parsedId = parseUser(input);
  if (parsedId) {
    logger.debug('resolvePartnerMember: buscando por ID', { guildId: guild.id, parsedId });
    if (guild.members.cache.has(parsedId)) {
      logger.debug('resolvePartnerMember: encontrado en cache', { guildId: guild.id, parsedId });
      return guild.members.cache.get(parsedId);
    }
    try {
      const fetched = await guild.members.fetch(parsedId);
      logger.debug('resolvePartnerMember: encontrado vía fetch por ID', { guildId: guild.id, parsedId });
      return fetched;
    } catch (error) {
      logger.warn('resolvePartnerMember: no se pudo obtener miembro por ID', {
        guildId: guild.id,
        parsedId,
        reason: error.message,
      });
      return null;
    }
  }

  const normalized = input.toLowerCase();
  logger.debug('resolvePartnerMember: buscando por nombre', { guildId: guild.id, normalized });
  const cached = guild.members.cache.find((member) => {
    const username = member.user.username?.toLowerCase();
    const displayName = member.displayName?.toLowerCase();
    return username === normalized || displayName === normalized;
  });
  if (cached) {
    logger.debug('resolvePartnerMember: encontrado en cache por nombre', {
      guildId: guild.id,
      normalized,
      memberId: cached.id,
    });
    return cached;
  }

  if (normalized.length < 2) {
    logger.warn('resolvePartnerMember: búsqueda remota omitida por input corto', {
      guildId: guild.id,
      normalized,
    });
    return null;
  }

  try {
    const fetched = await guild.members.fetch({ query: normalized, limit: 10 });
    const match = fetched.find((member) => {
      const username = member.user.username?.toLowerCase();
      const globalName = member.user.globalName?.toLowerCase();
      const displayName = member.displayName?.toLowerCase();
      return username === normalized || displayName === normalized || globalName === normalized;
    });
    if (match) {
      logger.debug('resolvePartnerMember: encontrado vía fetch por nombre', {
        guildId: guild.id,
        normalized,
        memberId: match.id,
      });
      return match;
    }
    logger.warn('resolvePartnerMember: sin coincidencias tras búsqueda remota', { guildId: guild.id, normalized });
  } catch (error) {
    logger.error('resolvePartnerMember: error al buscar miembro por nombre', {
      guildId: guild.id,
      normalized,
      reason: error.message,
    });
  }

  return null;
}

async function createMiddlemanChannel({ interaction, partnerMember, context }) {
  const guild = interaction.guild;
  const ownerMember = interaction.member;
  const baseName = `mm-${ownerMember.displayName || ownerMember.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const partnerPart = (partnerMember.displayName || partnerMember.user.username).toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const channelName = `${baseName}-${partnerPart}`.slice(0, 90);

  const parent = CONFIG.MIDDLEMAN.CATEGORY_ID ?? interaction.channel?.parentId ?? null;
  logger.debug('createMiddlemanChannel: preparando canal', {
    guildId: guild.id,
    ownerId: ownerMember.id,
    partnerId: partnerMember.id,
    parent,
    channelName,
  });
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
  logger.info('createMiddlemanChannel: canal creado', {
    guildId: guild.id,
    channelId: channel.id,
    ownerId: ownerMember.id,
    partnerId: partnerMember.id,
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

    logger.info('createMiddlemanChannel: configurado correctamente', {
      guildId: guild.id,
      channelId: channel.id,
      ticketId,
    });

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
  logger.debug('handleMiddlemanModal: recibido', {
    guildId: interaction.guild?.id,
    userId: interaction.user?.id,
    partnerInput,
  });
  await interaction.deferReply({ ephemeral: true });
  const partnerMember = await resolvePartnerMember(interaction.guild, partnerInput);
  if (!partnerMember) {
    logger.warn('handleMiddlemanModal: partner no encontrado', {
      guildId: interaction.guild?.id,
      userId: interaction.user?.id,
      partnerInput,
    });
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
  logger.flow('handleMiddlemanModal: middleman creado', interaction.user.id, '->', partnerMember.id, 'canal', channel.id);
  logger.flow('Middleman creado', interaction.user.id, '->', partnerMember.id, 'canal', channel.id);
}

export async function handleTradeModal(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket no encontrado', 'No se encontró información del trade.'), ephemeral: true });
    return;
  }
  const participants = await fetchParticipants(interaction.guild, ticket);
  if (!(await ensureTraderAccess(interaction, ticket, participants))) {
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
  const participants = await fetchParticipants(interaction.guild, ticket);
  if (!(await ensureTraderAccess(interaction, ticket, participants))) {
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
  const { state } = await ensurePanelMessage(interaction.channel, {
    owner: participants.owner,
    partner: participants.partner,
  });
  await interaction.reply({ ...buildTradeUpdateEmbed('✅ Confirmado', 'Tu confirmación quedó registrada. Espera a que la otra parte confirme.'), ephemeral: true });
  if (state?.everyoneConfirmed && state?.owner?.hasData && state?.partner?.hasData) {
    const { ownerId, partnerId } = resolveParticipantIds(ticket, participants);
    const targetsToLock = [ownerId, partnerId].filter(Boolean);
    if (targetsToLock.length === 0) {
      logger.warn('No se encontraron participantes válidos para bloquear el canal middleman', ticket.id, interaction.channel.id);
    }
    await resetFinalizations(ticket.id);
    await setTicketStatus(ticket.id, 'CONFIRMED');
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
      const { state } = await ensurePanelMessage(interaction.channel, {
        owner: participants.owner,
        partner: participants.partner,
      });
      if (state?.everyoneConfirmed && state?.owner?.hasData && state?.partner?.hasData) {
        await ensurePanelMessage(interaction.channel, {
          owner: participants.owner,
          partner: participants.partner,
          disabled: true,
        });
      }
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
  const allowedMentionUsers = new Set(
    [claim.middleman_user_id, participants.owner?.id, participants.partner?.id]
      .filter(Boolean)
      .map((id) => String(id))
  );
  const allowedMentions = {
    users: Array.from(allowedMentionUsers),
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
  await setTicketStatus(ticket.id, 'CLOSED');
  const { ownerId, partnerId } = resolveParticipantIds(ticket, participants);
  const statsUpdates = [];
  if (ownerId) {
    statsUpdates.push(
      incrementMemberTrade({
        discordUserId: ownerId,
        robloxUsername: ownerTrade?.roblox_username ?? null,
        robloxUserId: ownerTrade?.roblox_user_id ?? null,
        partnerRobloxUsername: partnerTrade?.roblox_username ?? null,
        partnerRobloxUserId: partnerTrade?.roblox_user_id ?? null,
      })
        .then(() => logger.flow('Trade contabilizado para miembro', ownerId, 'ticket', ticket.id))
        .catch((error) =>
          logger.warn('No se pudo actualizar stats de miembro', {
            ticketId: ticket.id,
            userId: ownerId,
            reason: error?.message ?? error,
          })
        )
    );
  }
  if (partnerId) {
    statsUpdates.push(
      incrementMemberTrade({
        discordUserId: partnerId,
        robloxUsername: partnerTrade?.roblox_username ?? null,
        robloxUserId: partnerTrade?.roblox_user_id ?? null,
        partnerRobloxUsername: ownerTrade?.roblox_username ?? null,
        partnerRobloxUserId: ownerTrade?.roblox_user_id ?? null,
      })
        .then(() => logger.flow('Trade contabilizado para miembro', partnerId, 'ticket', ticket.id))
        .catch((error) =>
          logger.warn('No se pudo actualizar stats de miembro', {
            ticketId: ticket.id,
            userId: partnerId,
            reason: error?.message ?? error,
          })
        )
    );
  }
  if (statsUpdates.length) {
    await Promise.all(statsUpdates);
  }
  const participantsToLock = [ownerId, partnerId].filter(Boolean);
  if (participantsToLock.length) {
    await Promise.all(participantsToLock.map((id) => updateSendPermission(channel, id, false)));
  }
  await ensurePanelMessage(channel, {
    owner: participants.owner,
    partner: participants.partner,
    disabled: true,
  });
  await ensureFinalizationPanel(channel, {
    ticket,
    claim,
    owner: participants.owner,
    partner: participants.partner,
    confirmations: participantsToLock,
    completed: true,
  }).catch((error) => {
    logger.warn('No se pudo actualizar panel de cierre final', error);
  });
  await resetFinalizations(ticket.id);
  const reviewPrompt = buildRequestReviewsMessage({
    mmTag: middlemanTag,
    ownerMention: participants.owner?.toString?.() ?? null,
    partnerMention: participants.partner?.toString?.() ?? null,
  });
  const mentionTargets = Array.from(new Set(participantsToLock));
  await channel.send({ ...reviewPrompt, allowedMentions: { users: mentionTargets } });
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
  const claimMessage = await interaction.reply({
    ...payload,
    files,
    allowedMentions: { users: [interaction.user.id] },
    fetchReply: true,
  });
  await setClaimPanelMessageId(ticket.id, claimMessage.id);
  const participants = await fetchParticipants(interaction.guild, ticket);
  await ensurePanelMessage(interaction.channel, { owner: participants.owner, partner: participants.partner });
  try {
    const disabledRow = claimRow();
    disabledRow.components[0].setDisabled(true);
    await interaction.message.edit({ components: [disabledRow] });
  } catch (error) {
    logger.warn('No se pudo deshabilitar botón de reclamo', error);
  }
  logger.flow('MM', interaction.user.tag, 'reclamó ticket', interaction.channel.id);
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

async function handleFinalConfirmation(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket inválido', 'No se encontró información para este canal.'), ephemeral: true });
    return;
  }
  const claim = await getClaimByTicket(ticket.id);
  if (!claim || claim.closed_at) {
    await interaction.reply({ ...buildTradeUpdateEmbed('ℹ️ Trade cerrado', 'Este trade ya fue finalizado.'), ephemeral: true });
    return;
  }
  const participantsInfo = await fetchParticipants(interaction.guild, ticket);
  if (!(await ensureTraderAccess(interaction, ticket, participantsInfo))) {
    return;
  }
  const participantIds = participantsInfo.participantIds?.length
    ? participantsInfo.participantIds
    : await listParticipants(ticket.id);
  await ensureUser(interaction.user.id);
  await setFinalizationConfirmed(ticket.id, interaction.user.id);
  const confirmations = await listFinalizations(ticket.id);
  const uniqueConfirmations = new Set(confirmations);
  if (uniqueConfirmations.size === 1) {
    await setTicketStatus(ticket.id, 'CLAIMED');
  }
  await ensureFinalizationPanel(interaction.channel, {
    ticket,
    claim,
    owner: participantsInfo.owner,
    partner: participantsInfo.partner,
    confirmations,
    completed: false,
  });
  await interaction.reply({ ...buildTradeUpdateEmbed('✅ Confirmación registrada', 'Gracias por confirmar el cierre del trade.'), ephemeral: true });
  if (uniqueConfirmations.size >= new Set(participantIds).size) {
    const result = await finalizeTrade({ channel: interaction.channel, ticket, forced: false, executorId: interaction.user.id });
    if (!result.ok) {
      await interaction.followUp({
        ...buildTradeUpdateEmbed('⚠️ No se pudo cerrar', result.reason ?? 'Intenta nuevamente o contacta al staff.'),
        ephemeral: true,
      });
    }
  }
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
  const participantIds = await listParticipants(ticket.id);
  if (!participantIds.includes(String(interaction.user.id))) {
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
  const participantsInfo = await fetchParticipants(interaction.guild, ticket);
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
  const reviews = await getReviewsForTicket(ticket.id);
  const panelPayload = buildTicketClaimedMessage({
    mmTag: `<@${claim.middleman_user_id}>`,
    robloxUsername: middleman?.roblox_username ?? 'Desconocido',
    vouches: middleman?.vouches_count ?? 0,
    avgStars: computeAverageFromRecord(middleman),
    reviews: mapReviewsForPanel(reviews),
  });
  const panelFiles = [...panelPayload.files];
  if (card) panelFiles.push(card);
  if (claim.panel_message_id) {
    try {
      const panelMessage = await interaction.channel.messages.fetch(claim.panel_message_id);
      await panelMessage.edit({ ...panelPayload, files: panelFiles, allowedMentions: { parse: [] } });
    } catch (error) {
      logger.warn('No se pudo actualizar el panel del middleman con la reseña', error);
    }
  } else {
    try {
      const newMessage = await interaction.channel.send({
        ...panelPayload,
        files: panelFiles,
        allowedMentions: { users: [claim.middleman_user_id] },
      });
      await setClaimPanelMessageId(ticket.id, newMessage.id);
    } catch (error) {
      logger.warn('No se pudo publicar panel del middleman tras reseña', error);
    }
  }

  const runtimeConfig = await getRuntimeConfig();
  if (runtimeConfig.reviewsChannel) {
    try {
      const reviewsChannel = await interaction.client.channels.fetch(runtimeConfig.reviewsChannel);
      if (reviewsChannel?.isTextBased?.()) {
        const reviewEmbed = buildReviewPublishedEmbed({
          reviewerTag: interaction.user.toString(),
          stars,
          text,
          mmTag: `<@${claim.middleman_user_id}>`,
          ownerTag: participantsInfo.owner?.toString?.() ?? 'Usuario 1',
          partnerTag: participantsInfo.partner?.toString?.() ?? 'Usuario 2',
        });
        const files = [...reviewEmbed.files];
        if (card) files.push(card);
        const reviewMentions = Array.from(
          new Set([interaction.user.id, claim.middleman_user_id].filter(Boolean).map((id) => String(id)))
        );
        await reviewsChannel.send({ ...reviewEmbed, files, allowedMentions: { users: reviewMentions } });
        logger.flow('Reseña publicada en canal configurado', {
          ticketId: ticket.id,
          reviewerId: interaction.user.id,
          channelId: reviewsChannel.id,
        });
      }
    } catch (error) {
      logger.warn('No se pudo publicar reseña en canal dedicado', error);
    }
  }

  await interaction.reply({ ...buildTradeUpdateEmbed('✅ ¡Gracias por tu reseña!', 'Se registró tu opinión correctamente.'), ephemeral: true });
  logger.flow('Reseña registrada', interaction.user.tag, 'ticket', ticket.id, 'stars', stars);

  const reviewsCount = await countReviewsForTicket(ticket.id);
  const uniqueParticipants = new Set(participantIds);
  if (reviewsCount >= uniqueParticipants.size) {
    const claimAfter = await getClaimByTicket(ticket.id);
    if (claimAfter && !claimAfter.vouched) {
      await incrementMiddlemanVouch(claimAfter.middleman_user_id);
      await markClaimVouched(ticket.id);
      logger.flow('Vouch sumado por reseñas completas', claimAfter.middleman_user_id, 'ticket', ticket.id);
    }
    logger.info('Todas las reseñas registradas para ticket', ticket.id);
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
    INTERACTION_IDS.MIDDLEMAN_BUTTON_OPEN_REVIEW,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_FINAL_CONFIRM,
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
    case INTERACTION_IDS.MIDDLEMAN_BUTTON_OPEN_REVIEW:
      await handleOpenReviewButton(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_BUTTON_FINAL_CONFIRM:
      await handleFinalConfirmation(interaction);
      break;
    case INTERACTION_IDS.MIDDLEMAN_MODAL_REVIEW:
      await handleReviewModalSubmit(interaction);
      break;
    default:
      break;
  }
}
