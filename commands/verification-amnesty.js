import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { hasAdminAccess } from '../utils/permissions.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';
import { VERIFICATION_REASONS } from '../services/eventVerificationService.js';

const reasonAliases = new Map([
  ['tag', VERIFICATION_REASONS.MISSING_TAG],
  ['etiqueta', VERIFICATION_REASONS.MISSING_TAG],
  ['bio', VERIFICATION_REASONS.MISSING_BIO],
  ['verificacion', null],
  ['all', null],
  ['todos', null],
]);

export default {
  name: 'verification-amnesty',
  description: 'Reinicia los contadores de verificación para un participante del evento.',
  usage: ';verification-amnesty @usuario [tag|bio|all] [motivo]',
  aliases: ['veri-amnistia'],
  async execute(message, args, { amnestyService, eventService, config, logger }) {
    logger.info(`[VERIFICATION-AMNESTY] Solicitud de ${message.author.tag}: ${message.content}`);

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
          content: 'Debes indicar al usuario a limpiar.',
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

    let reasonKey = null;
    if (args.length) {
      const alias = args[0]?.toLowerCase();
      if (reasonAliases.has(alias)) {
        reasonKey = reasonAliases.get(alias);
        args.shift();
      }
    }

    const motive = args.length ? args.join(' ').slice(0, 200) : null;

    const session = await eventService.getActiveSession(message.guildId);
    const sessionId = session?.id ?? null;

    await amnestyService.clearVerificationCounters({
      guildId: message.guildId,
      userId: targetId,
      reasonKey,
      moderatorId: message.author.id,
      sessionId,
    });

    const embed = new EmbedBuilder()
      .setColor(config.WARN_EMBED_COLOR)
      .setTitle('Contadores de verificación reiniciados')
      .setDescription(`Se restablecieron los registros de verificación para <@${targetId}>.`)
      .addFields(
        { name: 'Moderador', value: `<@${message.author.id}>`, inline: true },
        {
          name: 'Cobertura',
          value: reasonKey ? `Sólo ${reasonKey.replace('_', ' ')}` : 'Todos los requisitos',
          inline: true,
        }
      )
      .setTimestamp();

    if (motive) {
      embed.addFields({ name: 'Motivo', value: motive });
    }

    const payload = buildEmbedPayload(embed, resolveGifPath(config.WELCOME_GIF), config.WARN_GIF_URL);

    await message
      .reply({ ...payload, allowedMentions: { users: [targetId] } })
      .catch((error) => logger.error('[VERIFICATION-AMNESTY] No se pudo enviar confirmación:', error));
  },
};
