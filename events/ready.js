import { ActivityType } from 'discord.js';

export default {
  name: 'ready',
  once: true,
  async execute(client, { logger, config, fxService, welcomeService }) {
    logger.info(`🤖 Bot conectado como ${client.user.tag}`);

    logger.info(`📢 Prefijo de comandos: "${config.COMMAND_PREFIX}"`);

    client.user.setPresence({
      activities: [{ name: 'nuevos miembros y reglas', type: ActivityType.Watching }],
      status: 'online',
    });

    welcomeService.start();
    fxService.start();
  },
};
