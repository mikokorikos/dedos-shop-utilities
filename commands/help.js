import { EmbedBuilder } from 'discord.js';
import { hasAdminAccess } from '../utils/permissions.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';

const collectPrimaryCommands = (registry) => {
  if (!registry || typeof registry.values !== 'function') {
    return [];
  }
  const unique = new Map();
  for (const command of registry.values()) {
    if (!command?.name) {
      continue; // eslint-disable-line no-continue
    }
    const key = command.source || command.name.toLowerCase();
    if (unique.has(key)) {
      continue; // eslint-disable-line no-continue
    }
    unique.set(key, command);
  }
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const formatAliases = (command, prefix) => {
  const aliases = command.aliases?.filter?.((alias) => alias && alias !== command.name);
  if (!aliases?.length) {
    return null;
  }
  const formatted = aliases.map((alias) => `${prefix}${alias}`).join(', ');
  return `Alias: ${formatted}`;
};

const buildCommandSummary = (command, prefix) => {
  const description = command.description || 'Sin descripción disponible.';
  const usage = command.usage || `${prefix}${command.name}`;
  const lines = [description, `Uso: \`${usage}\``];
  const aliasLine = formatAliases(command, prefix);
  if (aliasLine) {
    lines.push(aliasLine);
  }
  return lines.join('\n');
};

const createHelpEmbed = (prefix, commands) => {
  const embed = new EmbedBuilder()
    .setTitle('Panel administrativo de comandos')
    .setDescription(
      'Todos los comandos están restringidos al equipo administrativo. Usa este panel como referencia rápida.'
    )
    .setColor(0x5000ab)
    .setTimestamp();

  const limitedCommands = commands.slice(0, 25);
  for (const command of limitedCommands) {
    embed.addFields({
      name: `${prefix}${command.name}`,
      value: buildCommandSummary(command, prefix),
      inline: false,
    });
  }

  if (commands.length > limitedCommands.length) {
    embed.setFooter({
      text: `Mostrando ${limitedCommands.length} de ${commands.length} comandos registrados.`,
    });
  }

  return embed;
};

export default {
  name: 'help',
  description: 'Muestra la lista de comandos disponibles para el staff administrativo.',
  usage: ';help',
  aliases: ['ayuda'],
  async execute(message, args, { logger, config, commands }) {
    logger.info(
      `[HELP COMMAND] ${message.author?.tag || message.author?.id} solicitó el panel de ayuda con argumentos: ${
        args?.join(' ') || 'sin argumentos'
      }.`
    );

    if (!hasAdminAccess(message.member)) {
      logger.warn('[HELP COMMAND] Intento de uso sin permisos administrativos.');
      await message
        .reply({
          content: 'Este panel sólo está disponible para administradores.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const availableCommands = collectPrimaryCommands(commands);
    logger.debug(`[HELP COMMAND] ${availableCommands.length} comandos únicos detectados.`);

    if (!availableCommands.length) {
      logger.warn('[HELP COMMAND] No se encontraron comandos registrados para mostrar.');
      await message
        .reply({
          content: 'No hay comandos registrados en este momento.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const embed = createHelpEmbed(config.COMMAND_PREFIX, availableCommands);
    logger.debug('[HELP COMMAND] Embed de ayuda construido correctamente.');

    const gifPath = resolveGifPath(config.WELCOME_GIF);
    logger.debug(
      `[HELP COMMAND] Firma resuelta: ${gifPath ? 'archivo local encontrado' : 'usando URL de respaldo'}.`
    );

    const payload = buildEmbedPayload(embed, gifPath, config.BRAND_ICON, {
      allowedMentions: { repliedUser: false },
    });

    try {
      logger.info(`[HELP COMMAND] Enviando panel de ayuda en el canal ${message.channel?.id || 'desconocido'}.`);
      await message.reply(payload);
      logger.info('[HELP COMMAND] Panel de ayuda enviado correctamente.');
    } catch (error) {
      logger.error(`[HELP COMMAND] Error al enviar el panel de ayuda: ${error?.message || error}`);
    }
  },
};
