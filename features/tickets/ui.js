import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { INTERACTION_IDS, TICKET_TYPES } from '../../config/constants.js';
import { applyDedosBrand, createDedosAttachment } from '../../utils/branding.js';

const ticketLabels = {
  [TICKET_TYPES.BUY]: { label: 'Compra', emoji: '🛍️', description: 'Comprar productos o servicios' },
  [TICKET_TYPES.SELL]: { label: 'Venta', emoji: '💰', description: 'Vender tus productos' },
  [TICKET_TYPES.ROBUX]: { label: 'Robux', emoji: '💎', description: 'Transacciones con Robux' },
  [TICKET_TYPES.NITRO]: { label: 'Nitro', emoji: '⚡', description: 'Boosts y suscripciones' },
  [TICKET_TYPES.DECOR]: { label: 'Decor', emoji: '🎨', description: 'Decoraciones y servicios visuales' },
};

export function buildTicketPanel() {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('🛒 Tickets de Dedos Shop')
      .setDescription('Selecciona el tipo de ticket que deseas abrir.')
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(INTERACTION_IDS.TICKET_MENU)
    .setPlaceholder('Selecciona el tipo de ticket')
    .addOptions(
      ...Object.entries(ticketLabels).map(([value, meta]) => ({
        label: meta.label,
        emoji: meta.emoji,
        value,
        description: meta.description,
      }))
    );

  return {
    embeds: [embed],
    files: [createDedosAttachment()],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

export function buildTicketCreatedEmbed({ type, user, channel }) {
  const meta = ticketLabels[type];
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle(`🎫 Ticket creado — ${meta?.label ?? type}`)
      .setDescription('El equipo de Dedos Shop ha sido notificado. Describe tu caso con detalle.')
      .addFields({ name: 'Canal', value: channel.toString(), inline: true })
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildTicketOpenedMessage({ type, user }) {
  const meta = ticketLabels[type];
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle(`👋 Nuevo ticket — ${meta?.label ?? type}`)
      .setDescription(`${user} abrió este ticket. ¡Atiende su solicitud!`)
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildTicketLimitEmbed(limit) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('⛔ Límite de tickets')
      .setDescription(`Solo puedes tener ${limit} ticket(s) abierto(s) simultáneamente.`)
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildTicketCooldownEmbed(remainingMs) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('⌛ Cooldown activo')
      .setDescription(`Espera ${Math.ceil(remainingMs / 1000)} segundos antes de crear otro ticket.`)
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildTicketErrorEmbed(message) {
  const embed = applyDedosBrand(new EmbedBuilder().setTitle('❌ Error al crear ticket').setDescription(message));
  return { embeds: [embed], files: [createDedosAttachment()] };
}
