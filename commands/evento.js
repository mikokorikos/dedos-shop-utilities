import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { hasAdminAccess } from '../utils/permissions.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';

export default {
  name: 'evento',
  description: 'Publica el panel de un evento para que los usuarios se unan.',
  usage: ';evento [start|finish]',
  aliases: [],
  async execute(message, args, { eventService, config, logger }) {
    logger.info(`[EVENT COMMAND] ${message.author.tag} -> ${message.content}`);

    const member = message.member;
    const hasPermission =
      hasAdminAccess(member) || member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);

    if (!hasPermission) {
      await message
        .reply({
          content: 'Necesitas permisos de administración para publicar eventos.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const subcommand = args.shift()?.toLowerCase();

    if (!subcommand || subcommand === 'start' || subcommand === 'iniciar') {
      await eventService.publishEvent(message);
      return;
    }

    if (subcommand === 'finish' || subcommand === 'finalizar' || subcommand === 'stop') {
      const reason = args.length ? args.join(' ').slice(0, 200) : null;
      const session = await eventService.finishActiveSession(message.guildId, message.author.id, reason);
      if (!session) {
        await message
          .reply({
            content: 'No hay un evento activo para finalizar.',
            allowedMentions: { repliedUser: false },
          })
          .catch(() => {});
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(config.WARN_EMBED_COLOR)
        .setTitle('Evento finalizado')
        .setDescription('El evento actual se marcó como finalizado y se deshabilitó el botón de unión.')
        .addFields({ name: 'Sesión', value: `ID ${session.id}`, inline: true })
        .setTimestamp();

      if (reason) {
        embed.addFields({ name: 'Motivo', value: reason });
      }

      const payload = buildEmbedPayload(embed, resolveGifPath(config.WELCOME_GIF), config.EVENT_REMINDER_GIF_URL);

      await message
        .reply({ ...payload, allowedMentions: { repliedUser: false } })
        .catch(() => {});
      return;
    }

    await message
      .reply({
        content: 'Subcomando no reconocido. Usa `;evento start` o `;evento finish`.',
        allowedMentions: { repliedUser: false },
      })
      .catch(() => {});
  },
};
