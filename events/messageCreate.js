export default {
  name: 'messageCreate',
  once: false,
  async execute(message, context) {
    const { eventService, config, commands, logger } = context;

    try {
      await eventService.handleReminderMessage(message);
    } catch (error) {
      logger.error('[EVENT] Error procesando recordatorio:', error);
    }

    if (!message || message.author?.bot) {
      return;
    }

    if (!message.content || !config.COMMAND_PREFIX) {
      return;
    }

    if (!message.content.startsWith(config.COMMAND_PREFIX)) {
      return;
    }

    const content = message.content.slice(config.COMMAND_PREFIX.length).trim();
    if (!content.length) {
      return;
    }

    if (!message.guild) {
      return;
    }

    const [commandName, ...rawArgs] = content.split(/\s+/);
    const command = commands.get(commandName.toLowerCase());
    if (!command) {
      return;
    }

    try {
      await command.execute(message, rawArgs, context);
    } catch (error) {
      logger.error(`[COMMAND] Error ejecutando "${command.name}"`, error);
      await message
        .reply({
          content: 'Ocurrió un error al ejecutar el comando. Intenta nuevamente o contacta a un administrador.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    }
  },
};
