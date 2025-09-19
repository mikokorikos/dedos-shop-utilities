import { hasModeratorAccess } from '../utils/permissions.js';
import { normalizeUserId } from '../utils/strings.js';

const parseLimit = (tokens) => {
  let limit;
  const leftovers = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.startsWith('--limite=')) {
      limit = Number.parseInt(token.split('=')[1], 10);
      // eslint-disable-next-line no-continue
      continue;
    }

    if (token === '--limite') {
      const value = tokens[index + 1];
      if (value !== undefined) {
        limit = Number.parseInt(value, 10);
        index += 1;
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    if (limit === undefined) {
      const parsed = Number.parseInt(token, 10);
      if (!Number.isNaN(parsed)) {
        limit = parsed;
        // eslint-disable-next-line no-continue
        continue;
      }
    }

    leftovers.push(token);
  }

  return { limit, leftovers };
};

const usageMessage = (prefix) => `Uso: ${prefix}warns @usuario [limite]`;

export default {
  name: 'warns',
  description: 'Consulta el historial de advertencias de un usuario.',
  usage: ';warns @usuario [limite]',
  aliases: [],
  async execute(message, args, { warnService, config, logger }) {
    logger.info(
      `[WARNS COMMAND] ${message.author?.tag || message.author?.id} ejecutó warns con argumentos: ${args?.join(' ') || 'sin argumentos'}.`
    );
    if (!hasModeratorAccess(message.member)) {
      logger.warn('[WARNS COMMAND] Usuario sin permisos intentó ejecutar warns.');
      await message
        .reply({
          content: 'Necesitas permisos de moderación para usar este comando.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!warnService.enabled) {
      logger.warn('[WARNS COMMAND] WarnService no está habilitado.');
      await message
        .reply({
          content: 'El sistema de warns no está configurado.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!args?.length) {
      logger.warn('[WARNS COMMAND] Comando sin argumentos.');
      await message
        .reply({
          content: usageMessage(config.COMMAND_PREFIX),
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const userId = normalizeUserId(args[0]);
    if (!userId) {
      logger.warn('[WARNS COMMAND] No se pudo normalizar el usuario objetivo.');
      await message
        .reply({
          content: 'Debes mencionar a un usuario válido.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const { limit, leftovers } = parseLimit(args.slice(1));
    if (leftovers.length) {
      logger.warn('[WARNS COMMAND] Parámetros no reconocidos en la solicitud.');
      await message
        .reply({
          content: usageMessage(config.COMMAND_PREFIX),
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (limit !== undefined) {
      if (Number.isNaN(limit) || limit < 1 || limit > 20) {
        logger.warn(`[WARNS COMMAND] Límite inválido recibido: ${limit}.`);
        await message
          .reply({
            content: 'El límite debe ser un número entre 1 y 20.',
            allowedMentions: { repliedUser: false },
          })
          .catch(() => {});
        return;
      }
    }

    let member;
    try {
      member = await message.guild.members.fetch(userId);
      logger.debug(`[WARNS COMMAND] Miembro ${member.user?.tag || member.id} resuelto correctamente.`);
    } catch (error) {
      logger.error(
        `[WARNS COMMAND] No se pudo obtener al miembro ${userId}: ${error?.message || error}`
      );
      member = null;
    }

    if (!member) {
      logger.warn(`[WARNS COMMAND] No se encontró al miembro ${userId}.`);
      await message
        .reply({
          content: 'No pude encontrar a ese miembro en el servidor.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    try {
      await message.channel.sendTyping().catch(() => {});

      const totals = await warnService.getTotals(message.guild.id, member.id);
      if (!totals.totalWarns) {
        logger.info(`[WARNS COMMAND] ${member.user?.tag || member.id} no tiene warns registrados.`);
        await message
          .reply({
            content: `${member} no tiene warns registrados.`,
            allowedMentions: { repliedUser: false },
          })
          .catch(() => {});
        return;
      }

      const history = await warnService.getHistory(message.guild.id, member.id, limit);
      const payload = warnService.createHistoryPayload({ targetMember: member, history, totals });
      await message
        .reply({ ...payload, allowedMentions: { repliedUser: false } })
        .catch(() => {});
    } catch (error) {
      logger.error('[WARNS] Error consultando historial de warns:', error);
      await message
        .reply({
          content: 'No pude consultar el historial de warns. Intenta nuevamente.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    }
  },
};
