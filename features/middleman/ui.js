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

export function buildTradePanel({ owner, partner, trades, state }) {
  const ownerTrade = state?.owner?.trade ?? trades.find((t) => String(t.user_id) === String(owner.id));
  const partnerTrade = state?.partner?.trade ?? trades.find((t) => String(t.user_id) === String(partner.id));
  const ownerStatus = ownerTrade
    ? ownerTrade.confirmed
      ? '✅ Confirmado'
      : '⌛ Pendiente'
    : '❌ Sin registrar';
  const partnerStatus = partnerTrade
    ? partnerTrade.confirmed
      ? '✅ Confirmado'
      : '⌛ Pendiente'
    : '❌ Sin registrar';

  const titleSuffix = state?.title ?? 'Seguimiento';
  const baseDescription = 'Completa tus datos y confirma cuando estés listo.';
  const descriptionLines = [baseDescription];
  if (state?.summary && state.summary !== baseDescription) {
    descriptionLines.push('', state.summary);
  }

  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle(`📦 Panel del trade — ${titleSuffix}`)
      .setDescription(descriptionLines.join('\n'))
      .addFields(
        {
          name: `${owner.displayName || owner.user?.username || 'Trader 1'} — datos`,
          value: ownerTrade
            ? [
                `• Roblox: **${ownerTrade.roblox_username}**`,
                `• Ofrece: ${ownerTrade.items}`,
                `• Confirmación: ${ownerStatus}`,
              ].join('\n')
            : 'Sin datos registrados. Usa **Mis datos de trade**.',
          inline: false,
        },
        {
          name: `${partner.displayName || partner.user?.username || 'Trader 2'} — datos`,
          value: partnerTrade
            ? [
                `• Roblox: **${partnerTrade.roblox_username}**`,
                `• Ofrece: ${partnerTrade.items}`,
                `• Confirmación: ${partnerStatus}`,
              ].join('\n')
            : 'Sin datos registrados. Usa **Mis datos de trade**.',
          inline: false,
        }
      )
  );

  if (state?.claimStatusLabel) {
    embed.addFields({ name: 'Estado middleman', value: state.claimStatusLabel, inline: false });
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_DATA)
      .setLabel('📝 Mis datos de trade')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_CONFIRM)
      .setLabel('✅ Confirmar trade')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!(ownerTrade || partnerTrade)),
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

export function buildDisabledPanel({ owner, partner, trades, state }) {
  const base = buildTradePanel({ owner, partner, trades, state });
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

export function buildClaimPromptEmbed(mmRoleId) {
  const roleMention = mmRoleId ? `<@&${mmRoleId}>` : 'Middleman';
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('🛡️ Se requiere middleman')
      .setDescription(
        [
          `${roleMention}, este ticket está listo para ser atendido.`,
          'Pulsa el botón para reclamarlo y atender a los usuarios.',
        ].join('\n')
      )
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [claimRow()] };
}

export function claimRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_CLAIM)
      .setLabel('Reclamar Middleman')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🛡️')
  );
}

export function buildTicketClaimedMessage({ mmTag, robloxUsername, vouches, avgStars, reviews = [] }) {
  const stars = Number.isFinite(avgStars) ? avgStars : 0;
  const reviewLines = reviews.length
    ? reviews.map((review) => {
        const prefix = `⭐ ${review.stars}/5 — ${review.reviewer}`;
        const text = review.text ? `\n${review.text}` : '';
        return `${prefix}${text}`.slice(0, 256);
      })
    : ['Aún no se registran reseñas para este trade.'];
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('🛡️ Middleman asignado')
      .setDescription(
        [
          `Te atiende **${mmTag}**`,
          `**Roblox:** \`${robloxUsername}\``,
          `**Vouches acumulados:** ${vouches}`,
          `**⭐ Promedio histórico:** ${stars > 0 ? stars.toFixed(2) : 'N/A'}`,
        ].join('\n')
      )
      .addFields({ name: 'Reseñas de este trade', value: reviewLines.join('\n\n') })
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}

export function buildMiddlemanStatsMessage({ mmTag, robloxUsername, vouches, avgStars, reviewsCount }) {
  const safeAvg = Number.isFinite(avgStars) ? avgStars : 0;
  const lines = [
    `Middleman: ${mmTag}`,
    `Roblox: \`${robloxUsername ?? 'Sin registro'}\``,
    `Vouches acumulados: **${vouches ?? 0}**`,
  ];
  if (reviewsCount) {
    lines.push(`Promedio histórico: **${safeAvg.toFixed(2)}** (${reviewsCount} reseña${reviewsCount === 1 ? '' : 's'})`);
  } else {
    lines.push('Promedio histórico: Sin reseñas registradas.');
  }
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('📊 Estadísticas del middleman')
      .setDescription(lines.join('\n'))
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}

export function buildRequestReviewsMessage({ mmTag, ownerMention, partnerMention }) {
  const reminders = [
    'Cada trader puede enviar **una sola reseña** con calificación de 1 a 5 estrellas.',
    'Describe brevemente tu experiencia para ayudar a futuros usuarios.',
  ];
  const mentions = [ownerMention, partnerMention].filter(Boolean);
  const description = [
    'Gracias por completar el trade. Es momento de calificar al middleman que te atendió.',
    ...reminders,
  ];
  if (mentions.length) {
    description.unshift(mentions.join(' '));
  }
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('⭐ Reseñas del trade')
      .setDescription(description.join('\n'))
      .setAuthor({ name: `Atendido por ${mmTag}` })
      .setFooter({ text: 'Las reseñas se publicarán en el canal configurado.' })
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [buildReviewButtonRow()] };
}

export function buildReviewButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_OPEN_REVIEW)
      .setLabel('Dejar reseña')
      .setEmoji('⭐')
      .setStyle(ButtonStyle.Primary)
  );
}

export function buildFinalizationPrompt({ owner, partner, confirmedIds, completed = false }) {
  const ownerConfirmed = confirmedIds.has(String(owner?.id ?? ''));
  const partnerConfirmed = confirmedIds.has(String(partner?.id ?? ''));
  const statusLabel = completed
    ? 'El trade ha sido confirmado por ambas partes. El canal quedó bloqueado.'
    : 'Cada trader debe confirmar que recibió lo acordado para cerrar el trade.';
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('¿Terminar trade?')
      .setDescription(statusLabel)
      .addFields(
        {
          name: owner?.displayName || owner?.user?.username || 'Trader 1',
          value: ownerConfirmed ? '✅ Confirmado' : '⌛ Pendiente',
          inline: true,
        },
        {
          name: partner?.displayName || partner?.user?.username || 'Trader 2',
          value: partnerConfirmed ? '✅ Confirmado' : '⌛ Pendiente',
          inline: true,
        }
      )
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(INTERACTION_IDS.MIDDLEMAN_BUTTON_FINAL_CONFIRM)
      .setLabel('Confirmar trade')
      .setStyle(ButtonStyle.Success)
      .setDisabled(completed)
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [row] };
}

export function buildReviewModal() {
  return new ModalBuilder()
    .setCustomId(INTERACTION_IDS.MIDDLEMAN_MODAL_REVIEW)
    .setTitle('Reseña del middleman')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('stars')
          .setLabel('Calificación (0-5)')
          .setPlaceholder('Ingresa un número entero de 0 a 5')
          .setMinLength(1)
          .setMaxLength(2)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('review_text')
          .setLabel('Reseña (opcional)')
          .setPlaceholder('Cuenta cómo fue tu experiencia con el middleman')
          .setMaxLength(400)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    );
}

export function buildReviewPublishedEmbed({ reviewerTag, stars, text, mmTag, ownerTag, partnerTag }) {
  const safeText = text?.trim()?.length ? text.trim() : 'Sin comentarios adicionales.';
  const starsVisual = `${'⭐'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))} (${stars}/5)`;
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('⭐ Nueva reseña registrada')
      .addFields(
        { name: 'Tradeo con', value: `${ownerTag} ↔ ${partnerTag}`, inline: false },
        { name: 'Atendido por', value: mmTag, inline: false },
        { name: 'Usuario', value: reviewerTag, inline: true },
        { name: 'Calificación', value: starsVisual, inline: true },
        { name: 'Reseña', value: safeText, inline: false }
      )
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}

export function buildTradeCompletedMessage({ middlemanTag, userOne, userTwo }) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('TRADE COMPLETADO')
      .setDescription(`**Middleman:** ${middlemanTag}`)
      .addFields(
        {
          name: userOne?.label ?? 'Usuario 1',
          value: `${userOne?.roblox ?? 'Roblox desconocido'}\n${userOne?.items ?? 'Sin registro'}`,
          inline: true,
        },
        {
          name: userTwo?.label ?? 'Usuario 2',
          value: `${userTwo?.roblox ?? 'Roblox desconocido'}\n${userTwo?.items ?? 'Sin registro'}`,
          inline: true,
        }
      )
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}

