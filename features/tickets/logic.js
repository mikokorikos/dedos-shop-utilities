import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { CONFIG } from '../../config/config.js';
import { TICKET_TYPES } from '../../config/constants.js';
import { countOpenTicketsByUser, createTicket, registerParticipant } from '../../services/tickets.repo.js';
import { ensureUser } from '../../services/users.repo.js';
import { checkCooldown } from '../../utils/cooldowns.js';
import { logger } from '../../utils/logger.js';
import { buildTicketCooldownEmbed, buildTicketCreatedEmbed, buildTicketErrorEmbed, buildTicketLimitEmbed, buildTicketOpenedMessage, buildTicketPanel } from './ui.js';

export async function handleTicketPanelCommand(ctx) {
  const panel = buildTicketPanel();
  if ('reply' in ctx && typeof ctx.reply === 'function') {
    await ctx.reply({ ...panel, allowedMentions: { parse: [] } });
  } else {
    await ctx.channel.send({ ...panel, allowedMentions: { parse: [] } });
  }
  logger.flow('Panel de tickets publicado por', ctx.user?.id ?? ctx.author?.id);
}

function ticketName(type, member) {
  const base = member.displayName || member.user?.username || member.user?.tag || 'usuario';
  const sanitized = base.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${type}-${sanitized}`.slice(0, 90);
}

export async function handleTicketMenu(interaction) {
  const type = interaction.values?.[0];
  if (!type) {
    await interaction.reply({ ...buildTicketErrorEmbed('No se reconoció el tipo de ticket.'), ephemeral: true });
    return;
  }
  if (!Object.values(TICKET_TYPES).includes(type)) {
    await interaction.reply({ ...buildTicketErrorEmbed('Tipo de ticket no permitido.'), ephemeral: true });
    return;
  }
  await ensureUser(interaction.user.id);
  const open = await countOpenTicketsByUser(interaction.user.id, type);
  if (open >= CONFIG.TICKETS.MAX_PER_USER) {
    await interaction.reply({ ...buildTicketLimitEmbed(CONFIG.TICKETS.MAX_PER_USER), ephemeral: true });
    return;
  }
  const { allowed, remainingMs } = checkCooldown(
    interaction.user.id,
    `ticket_${type}`,
    CONFIG.TICKETS.COOLDOWN_MS
  );
  if (!allowed) {
    await interaction.reply({ ...buildTicketCooldownEmbed(remainingMs), ephemeral: true });
    return;
  }

  const parent = CONFIG.TICKETS.CATEGORY_ID ?? interaction.channel?.parentId ?? null;
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
  ];
  if (CONFIG.ADMIN_ROLE_ID) {
    overwrites.push({ id: CONFIG.ADMIN_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }
  for (const roleId of CONFIG.TICKETS.STAFF_ROLE_IDS) {
    overwrites.push({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  }

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: ticketName(type, interaction.member),
      type: ChannelType.GuildText,
      parent,
      permissionOverwrites: overwrites,
    });
  } catch (error) {
    logger.error('No se pudo crear canal de ticket', error);
    await interaction.reply({ ...buildTicketErrorEmbed('No fue posible crear el canal. Intenta más tarde.'), ephemeral: true });
    return;
  }

  const ticketId = await createTicket({
    guildId: interaction.guildId,
    channelId: channel.id,
    ownerId: interaction.user.id,
    type,
  });
  await registerParticipant(ticketId, interaction.user.id);

  const openedMessage = buildTicketOpenedMessage({ type, user: interaction.user });
  const pingRoles = [CONFIG.ADMIN_ROLE_ID, ...CONFIG.TICKETS.STAFF_ROLE_IDS].filter(Boolean);
  await channel.send({
    content: pingRoles.length ? pingRoles.map((role) => `<@&${role}>`).join(' ') : undefined,
    allowedMentions: { roles: pingRoles },
    ...openedMessage,
  });

  await interaction.reply({ ...buildTicketCreatedEmbed({ type, user: interaction.user, channel }), ephemeral: true });
  logger.flow('Ticket creado', type, 'por', interaction.user.id, 'canal', channel.id);
}
