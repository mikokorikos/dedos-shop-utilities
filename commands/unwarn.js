import { PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { hasAdminAccess } from '../utils/permissions.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';

export default {
  name: 'unwarn',
  description: 'Elimina un warn específico o el último warn registrado para un usuario.',
  usage: ';unwarn @usuario [warnId|last] [razón]',
  aliases: [],
  async execute(message, args, { amnestyService, config, logger }) {
    logger.info(`[UNWARN COMMAND] Solicitud de ${message.author.tag} -> ${message.content}`);

    const member = message.member;
    const hasPermission =
      hasAdminAccess(member) || member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);

    if (!hasPermission) {
      await message
        .reply({
          content: 'Necesitas permisos de moderación para usar este comando.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!args.length) {
      await message
        .reply({
          content: 'Debes mencionar a un usuario o indicar su ID.',
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
          content: 'No pude identificar al usuario objetivo.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    let warnIdArg = null;
    if (args.length) {
      const candidate = args[0];
      if (/^\d+$/.test(candidate) || candidate?.toLowerCase() === 'last') {
        warnIdArg = args.shift();
      }
    }

    const reason = args.length ? args.join(' ').slice(0, 200) : null;
    let removedWarn = null;

    try {
      if (warnIdArg && /^\d+$/.test(warnIdArg)) {
        removedWarn = await amnestyService.removeWarnById({
          guildId: message.guildId,
          warnId: Number(warnIdArg),
          moderatorId: message.author.id,
          reason,
        });
      } else {
        removedWarn = await amnestyService.removeLatestWarn({
          guildId: message.guildId,
          userId: targetId,
          moderatorId: message.author.id,
          reason,
        });
      }
    } catch (error) {
      logger.error('[UNWARN COMMAND] Error eliminando warn:', error);
      await message
        .reply({
          content: 'Ocurrió un error al eliminar el warn. Revisa los logs para más detalles.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!removedWarn) {
      await message
        .reply({
          content: 'No se encontró un warn coincidente para ese usuario.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(config.WARN_EMBED_COLOR)
      .setTitle('Warn eliminado')
      .setDescription(`Se eliminó el warn **#${removedWarn.id}** del usuario <@${removedWarn.user_id}>.`)
      .addFields(
        { name: 'Moderador', value: `<@${message.author.id}>`, inline: true },
        { name: 'Puntos', value: String(removedWarn.points || 1), inline: true }
      )
      .setFooter({ text: 'Registro actualizado en la base de datos.' })
      .setTimestamp();

    if (reason) {
      embed.addFields({ name: 'Motivo administrativo', value: reason });
    }

    const payload = buildEmbedPayload(embed, resolveGifPath(config.WELCOME_GIF), config.WARN_GIF_URL);

    await message
      .reply({ ...payload, allowedMentions: { users: [removedWarn.user_id] } })
      .catch((error) => {
        logger.error('[UNWARN COMMAND] No se pudo responder con el resultado:', error);
      });
  },
};
