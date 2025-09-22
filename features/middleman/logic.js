import {
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { CONFIG } from '../../config/config.js';
import { INTERACTION_IDS, TICKET_TYPES } from '../../config/constants.js';
import { buildCooldownEmbed, buildDisabledPanel, buildHelpEmbed, buildMiddlemanInfo, buildMiddlemanPanel, buildPartnerModal, buildRobloxErrorEmbed, buildRobloxWarningEmbed, buildTicketCreatedEmbed, buildTicketLimitEmbed, buildTradeModal, buildTradePanel, buildTradeLockedEmbed, buildTradeUpdateEmbed } from './ui.js';
import { ensureUser } from '../../services/users.repo.js';
import { countOpenTicketsByUser, createTicket, registerParticipant, getTicketByChannel, listParticipants } from '../../services/tickets.repo.js';
import { getTrade, getTradesByTicket, resetTradeConfirmation, setTradeConfirmed, upsertTradeData } from '../../services/mm.repo.js';
import { checkCooldown } from '../../utils/cooldowns.js';
import { parseUser } from '../../utils/helpers.js';
import { assertRobloxUser } from '../../utils/roblox.js';
import { logger } from '../../utils/logger.js';

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
    await interaction.channel.permissionOverwrites.edit(participants.owner.id, { SendMessages: false });
    await interaction.channel.permissionOverwrites.edit(participants.partner.id, { SendMessages: false });
    await ensurePanelMessage(interaction.channel, { owner: participants.owner, partner: participants.partner, disabled: true });
    await interaction.followUp({ ...buildTradeLockedEmbed(CONFIG.MM_ROLE_ID), allowedMentions: { roles: CONFIG.MM_ROLE_ID ? [CONFIG.MM_ROLE_ID] : [] } });
  }
}

export async function handleTradeHelp(interaction) {
  const ticket = await getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    await interaction.reply({ ...buildTradeUpdateEmbed('❌ Ticket no encontrado', 'No se encontró información del trade.'), ephemeral: true });
    return;
  }
  const participants = await fetchParticipants(interaction.guild, ticket);
  const trades = await getTradesByTicket(ticket.id);
  await interaction.channel.permissionOverwrites.edit(participants.owner.id, { SendMessages: true });
  await interaction.channel.permissionOverwrites.edit(participants.partner.id, { SendMessages: true });
  const help = buildHelpEmbed(CONFIG.ADMIN_ROLE_ID);
  await interaction.reply({ ...help, allowedMentions: { roles: CONFIG.ADMIN_ROLE_ID ? [CONFIG.ADMIN_ROLE_ID] : [] } });
  setTimeout(async () => {
    try {
      await interaction.channel.permissionOverwrites.edit(participants.owner.id, { SendMessages: false });
      await interaction.channel.permissionOverwrites.edit(participants.partner.id, { SendMessages: false });
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

export function isMiddlemanComponent(interaction) {
  return [
    INTERACTION_IDS.MIDDLEMAN_MENU,
    INTERACTION_IDS.MIDDLEMAN_MODAL_PARTNER,
    INTERACTION_IDS.MIDDLEMAN_MODAL_TRADE,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_DATA,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_CONFIRM,
    INTERACTION_IDS.MIDDLEMAN_BUTTON_HELP,
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
    default:
      break;
  }
}
