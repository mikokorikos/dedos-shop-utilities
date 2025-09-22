import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { INTERACTION_IDS, TICKET_TYPES } from '../../config/constants.js';
import { applyDedosBrand, createDedosAttachment } from '../../utils/branding.js';

export function buildMiddlemanPanel() {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('🛡️ Middleman Dedos Shop')
      .setDescription('Selecciona una opción para conocer el flujo o abrir un middleman seguro.')
  );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(INTERACTION_IDS.MIDDLEMAN_MENU)
    .setPlaceholder('Selecciona una opción')
    .addOptions(
      { label: 'Cómo funciona', value: 'info', emoji: '📖' },
      { label: 'Abrir middleman', value: 'open', emoji: '🛠' }
    );

  return {
    embeds: [embed],
    files: [createDedosAttachment()],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

export function buildMiddlemanInfo() {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('📖 ¿Cómo funciona el middleman?')
      .setDescription(
        [
          '1. Completa el formulario para indicar con quién tradearás.',
          '2. Ambos usuarios envían sus datos de trade con verificación Roblox.',
          '3. Cuando los dos confirman, el canal se bloquea y se avisa al equipo middleman.',
          '4. Usa el botón de **Pedir ayuda** si necesitas asistencia adicional.',
        ].join('\n')
      )
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildPartnerModal() {
  return new ModalBuilder()
    .setCustomId(INTERACTION_IDS.MIDDLEMAN_MODAL_PARTNER)
    .setTitle('Abrir middleman')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('partner')
          .setLabel('Usuario partner (ID o mención)')
          .setMinLength(3)
          .setMaxLength(100)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('context')
          .setLabel('Describe brevemente el trade')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );
}

export function buildTradeModal() {
  return new ModalBuilder()
    .setCustomId(INTERACTION_IDS.MIDDLEMAN_MODAL_TRADE)
    .setTitle('Mis datos de trade')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('roblox_username')
          .setLabel('Usuario de Roblox')
          .setMinLength(3)
          .setMaxLength(50)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('items')
          .setLabel('¿Qué ofreces? Incluye cantidades y moneda')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(5)
          .setMaxLength(1000)
          .setRequired(true)
      )
    );
}

export function buildTradePanel({ owner, partner, trades }) {
  const ownerTrade = trades.find((t) => String(t.user_id) === String(owner.id));
  const partnerTrade = trades.find((t) => String(t.user_id) === String(partner.id));
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('📦 Panel del trade')
      .setDescription('Completa tus datos y confirma cuando estés listo.')
      .addFields(
        {
          name: `${owner.displayName || owner.user?.username} — datos`,
          value: ownerTrade
            ? `• Roblox: **${ownerTrade.roblox_username}**\n• Items: ${ownerTrade.items}\n• Estado: ${ownerTrade.confirmed ? '✅ Confirmado' : '⌛ Pendiente'}`
            : 'Sin datos registrados. Usa **Mis datos de trade**.',
          inline: false,
        },
        {
          name: `${partner.displayName || partner.user?.username} — datos`,
          value: partnerTrade
            ? `• Roblox: **${partnerTrade.roblox_username}**\n• Items: ${partnerTrade.items}\n• Estado: ${partnerTrade.confirmed ? '✅ Confirmado' : '⌛ Pendiente'}`
            : 'Sin datos registrados. Usa **Mis datos de trade**.',
          inline: false,
        }
      )
  );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_DATA)
      .setLabel('📝 Mis datos de trade')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_CONFIRM)
      .setLabel('✅ Confirmar trade')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ownerTrade && !partnerTrade),
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_HELP)
      .setLabel('🚨 Pedir ayuda')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: [embed],
    files: [createDedosAttachment()],
    components: [buttons],
  };
}

export function buildTradeLockedEmbed(mmRole) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('🔒 Trade listo para middleman')
      .setDescription('Ambas partes confirmaron. Espera a que un middleman se una y finalice la transacción.')
  );
  const content = mmRole ? `<@&${mmRole}> se requiere asistencia en este trade.` : 'Se requiere asistencia del equipo middleman.';
  return { content, embeds: [embed], files: [createDedosAttachment()], components: [] };
}

export function buildRobloxWarningEmbed(username) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('⚠️ Roblox con poca antigüedad')
      .setDescription(`El usuario **${username}** tiene menos de 1 año en Roblox. Procede con precaución.`)
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildRobloxErrorEmbed(username) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('❌ Usuario de Roblox no encontrado')
      .setDescription(`No pudimos validar al usuario **${username}**. Verifica que esté escrito correctamente.`)
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildTicketCreatedEmbed({ owner, partner, context }) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('🎫 Middleman creado')
      .setDescription('Canal listo para continuar el trade con seguridad.')
      .addFields(
        { name: 'Trader', value: owner.toString(), inline: true },
        { name: 'Partner', value: partner.toString(), inline: true },
        { name: 'Contexto', value: context, inline: false }
      )
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}

export function buildTicketLimitEmbed(limit) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('⛔ Límite de tickets')
      .setDescription(`Alcanzaste el límite de ${limit} middleman abiertos. Cierra uno antes de crear otro.`)
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}

export function buildCooldownEmbed(remainingMs) {
  const seconds = Math.ceil(remainingMs / 1000);
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('⌛ Espera un momento')
      .setDescription(`Debes esperar ${seconds} segundos antes de volver a crear un middleman.`)
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}

export function buildHelpEmbed(adminRoleId) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('🚨 Ayuda solicitada')
      .setDescription('Se notificó al equipo para revisar este trade. El canal quedó desbloqueado temporalmente.')
  );
  const content = adminRoleId ? `<@&${adminRoleId}> se solicitó apoyo en este middleman.` : 'Se solicitó apoyo en este middleman.';
  return { content, embeds: [embed], files: [createDedosAttachment()] };
}

export function buildTradeUpdateEmbed(title, description) {
  const embed = applyDedosBrand(new EmbedBuilder().setTitle(title).setDescription(description));
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildDisabledPanel({ owner, partner, trades }) {
  const base = buildTradePanel({ owner, partner, trades });
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_DATA)
      .setLabel("📝 Mis datos de trade")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_CONFIRM)
      .setLabel("✅ Confirmar trade")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_HELP)
      .setLabel("🚨 Pedir ayuda")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );
  return { ...base, components: [disabledRow] };
}

