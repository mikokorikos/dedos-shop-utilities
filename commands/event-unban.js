import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { hasAdminAccess } from '../utils/permissions.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';

export default {
  name: 'event-unban',
  description: 'Permite que un usuario vuelva a participar en los eventos activos.',
  usage: ';event-unban @usuario [motivo]',
  aliases: ['event-pardon'],
  async execute(message, args, { amnestyService, eventService, config, logger }) {
    logger.info(`[EVENT-UNBAN] Solicitud de ${message.author.tag}: ${message.content}`);

    const member = message.member;
    const hasPermission =
      hasAdminAccess(member) || member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);

    if (!hasPermission) {
      await message
        .reply({
          content: 'Necesitas permisos de administración para usar este comando.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!args.length) {
      await message
        .reply({
          content: 'Debes mencionar o indicar la ID del usuario a desbloquear.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const targetArg = args.shift();
    const idMatch = targetArg?.match(/\d{17,20}/);
    const targetId = message.mentions.users.first()?.id || idMatch?.[0];
    if (!targetId) {
      await message
        .reply({
          content: 'No pude identificar al usuario indicado.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const motive = args.length ? args.join(' ').slice(0, 200) : null;
    const session = await eventService.getActiveSession(message.guildId);
    const sessionId = session?.id ?? null;

    await amnestyService.unbanParticipant({
      guildId: message.guildId,
      userId: targetId,
      moderatorId: message.author.id,
      sessionId,
    });

    const embed = new EmbedBuilder()
      .setColor(config.WARN_EMBED_COLOR)
      .setTitle('Participación restaurada')
      .setDescription(`El usuario <@${targetId}> puede volver a unirse a los eventos.`)
      .addFields({ name: 'Moderador', value: `<@${message.author.id}>`, inline: true })
      .setTimestamp();

    if (motive) {
      embed.addFields({ name: 'Motivo', value: motive });
    }

    const payload = buildEmbedPayload(embed, resolveGifPath(config.WELCOME_GIF), config.WARN_GIF_URL);

    await message
      .reply({ ...payload, allowedMentions: { users: [targetId] } })
      .catch((error) => logger.error('[EVENT-UNBAN] No se pudo enviar confirmación:', error));
  },
};
