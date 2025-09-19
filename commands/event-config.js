import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { hasAdminAccess } from '../utils/permissions.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';

const SUPPORTED_KEYS = new Map([
  ['tag', 'event.required_tag'],
  ['etiqueta', 'event.required_tag'],
  ['channel', 'event.control_channel_id'],
  ['canal', 'event.control_channel_id'],
  ['interval', 'event.verification_interval_minutes'],
]);

export default {
  name: 'event-config',
  description: 'Actualiza parámetros del sistema de eventos sin editar el código.',
  usage: ';event-config <tag|channel|interval> <valor>',
  aliases: ['evento-config'],
  async execute(message, args, { settingsService, eventVerificationService, config, logger }) {
    logger.info(`[EVENT-CONFIG] ${message.author.tag} -> ${message.content}`);

    const member = message.member;
    const hasPermission =
      hasAdminAccess(member) || member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);

    if (!hasPermission) {
      await message
        .reply({
          content: 'Necesitas permisos de administración para actualizar la configuración.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!args.length) {
      await message
        .reply({
          content: 'Debes indicar la clave a modificar (tag, channel o interval).',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const rawKey = args.shift().toLowerCase();
    if (!SUPPORTED_KEYS.has(rawKey)) {
      await message
        .reply({
          content: 'Clave no reconocida. Usa tag, channel o interval.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!args.length) {
      await message
        .reply({
          content: 'Debes especificar el valor a guardar.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const settingKey = SUPPORTED_KEYS.get(rawKey);
    let storedValue = null;

    if (settingKey === 'event.required_tag') {
      storedValue = args.join(' ').trim();
    } else if (settingKey === 'event.control_channel_id') {
      const mention = args[0];
      const channelId = mention?.match(/\d{17,20}/)?.[0];
      if (!channelId) {
        await message
          .reply({
            content: 'Debes mencionar un canal válido o indicar su ID.',
            allowedMentions: { repliedUser: false },
          })
          .catch(() => {});
        return;
      }
      storedValue = channelId;
    } else if (settingKey === 'event.verification_interval_minutes') {
      const parsed = Number(args[0]);
      if (!Number.isFinite(parsed) || parsed < 1) {
        await message
          .reply({
            content: 'El intervalo debe ser un número entero de minutos mayor o igual a 1.',
            allowedMentions: { repliedUser: false },
          })
          .catch(() => {});
        return;
      }
      storedValue = String(Math.round(parsed));
      await eventVerificationService.reloadInterval(parsed);
    }

    await settingsService.set(message.guildId, settingKey, storedValue, message.author.id);

    const embed = new EmbedBuilder()
      .setColor(config.WARN_EMBED_COLOR)
      .setTitle('Configuración de eventos actualizada')
      .addFields(
        { name: 'Clave', value: settingKey, inline: true },
        { name: 'Valor', value: storedValue || 'Sin valor', inline: true }
      )
      .setFooter({ text: `Actualizado por ${message.author.tag}` })
      .setTimestamp();

    const payload = buildEmbedPayload(embed, resolveGifPath(config.WELCOME_GIF), config.WARN_GIF_URL);

    await message
      .reply({ ...payload, allowedMentions: { repliedUser: false } })
      .catch((error) => logger.error('[EVENT-CONFIG] No se pudo enviar confirmación:', error));
  },
};
