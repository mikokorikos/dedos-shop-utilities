import { hasModeratorAccess } from '../utils/permissions.js';
import { normalizeUserId } from '../utils/strings.js';

const parseOptions = (args) => {
  const options = { points: 1, contextUrl: undefined, rest: [] };

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token.startsWith('--puntos=')) {
      const value = token.split('=')[1];
      options.points = Number.parseInt(value, 10);
      // eslint-disable-next-line no-continue
      continue;
    }

    if (token === '--puntos') {
      const value = args[index + 1];
      if (value !== undefined) {
        options.points = Number.parseInt(value, 10);
        index += 1;
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    if (token.startsWith('--contexto=')) {
      options.contextUrl = token.split('=').slice(1).join('=');
      // eslint-disable-next-line no-continue
      continue;
    }

    if (token === '--contexto') {
      const value = args[index + 1];
      if (value !== undefined) {
        options.contextUrl = value;
        index += 1;
      }
      // eslint-disable-next-line no-continue
      continue;
    }

    options.rest.push(token);
  }

  return options;
};

const buildUsageMessage = (prefix) =>
  `Uso: ${prefix}warn @usuario razón obligatoria [--puntos <1-10>] [--contexto <url>]`;

export default {
  name: 'warn',
  description: 'Registra una advertencia para un usuario.',
  usage: ';warn @usuario [--puntos <1-10>] [--contexto <url>] razón',
  aliases: [],
  async execute(message, args, { warnService, logger, config }) {
    logger.info(
      `[WARN COMMAND] ${message.author?.tag || message.author?.id} ejecutó warn con argumentos: ${args?.join(' ') || 'sin argumentos'}.`
    );
    if (!hasModeratorAccess(message.member)) {
      logger.warn('[WARN COMMAND] Usuario sin permisos intentó ejecutar warn.');
      await message
        .reply({
          content: 'Necesitas permisos de moderación para usar este comando.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!args?.length) {
      logger.warn('[WARN COMMAND] Warn sin argumentos.');
      await message
        .reply({
          content: buildUsageMessage(config.COMMAND_PREFIX),
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const userId = normalizeUserId(args[0]);
    if (!userId) {
      logger.warn('[WARN COMMAND] No se pudo normalizar el usuario objetivo.');
      await message
        .reply({
          content: 'Debes mencionar a un usuario válido.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const { rest, points, contextUrl } = parseOptions(args.slice(1));
    const reason = rest.join(' ').trim();

    if (!reason) {
      logger.warn('[WARN COMMAND] Warn sin razón proporcionada.');
      await message
        .reply({
          content: 'Debes especificar una razón para la advertencia.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (Number.isNaN(points) || points < 1 || points > 10) {
      logger.warn(`[WARN COMMAND] Puntos inválidos recibidos: ${points}.`);
      await message
        .reply({
          content: 'Los puntos deben ser un número entre 1 y 10.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!warnService.enabled) {
      logger.warn('[WARN COMMAND] WarnService no está habilitado.');
      await message
        .reply({
          content: 'El sistema de warns no está configurado.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    let member;
    try {
      member = await message.guild.members.fetch(userId);
      logger.debug(`[WARN COMMAND] Miembro ${member.user?.tag || member.id} resuelto correctamente.`);
    } catch (error) {
      logger.error(
        `[WARN COMMAND] No se pudo obtener al miembro ${userId}: ${error?.message || error}`
      );
      member = null;
    }

    if (!member) {
      logger.warn(`[WARN COMMAND] No se encontró al miembro ${userId}.`);
      await message
        .reply({
          content: 'No pude encontrar a ese miembro en el servidor.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (member.user.bot) {
      logger.warn('[WARN COMMAND] Se intentó advertir a un bot.');
      await message
        .reply({
          content: 'No puedes advertir a un bot.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    try {
      await message.channel.sendTyping().catch(() => {});

      const result = await warnService.addWarn({
        guildId: message.guild.id,
        userId: member.id,
        moderatorId: message.author.id,
        reason,
        points,
        contextUrl,
      });

      const totals = {
        totalWarns: result.totalWarns,
        totalPoints: result.totalPoints,
      };

      const payload = warnService.createWarnChannelPayload({
        targetMember: member,
        moderator: message.member,
        reason,
        totals,
        points,
        contextUrl: contextUrl ? `[Ver contexto](${contextUrl})` : undefined,
        messageUrl: message.url,
      });

      await warnService.sendWarnToChannel({
        channel: message.channel,
        payload,
        targetMember: member,
      });

      await warnService.sendWarnDm({ member, reason, moderator: message.member, points });
    } catch (error) {
      logger.error('[WARN] Error registrando advertencia:', error);
      await message
        .reply({
          content: 'No pude registrar la advertencia. Intenta nuevamente.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    }
  },
};
