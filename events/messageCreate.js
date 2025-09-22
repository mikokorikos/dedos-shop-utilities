import { COMMAND_PREFIX } from '../config/constants.js';
import { withBranding } from '../utils/branding.js';
import { logger } from '../utils/logger.js';

export function createMessageHandler({ prefixCommands }) {
  return async function onMessage(message) {
    if (message.author.bot) return;
    if (!message.content.startsWith(COMMAND_PREFIX)) return;
    const [commandName] = message.content.trim().split(/\s+/);
    const handler = prefixCommands.get(commandName.toLowerCase());
    if (!handler) return;
    try {
      await handler(message);
    } catch (error) {
      logger.error('Error ejecutando comando de prefijo', error);
      await message.reply(
        withBranding({ title: '❌ Error', description: 'Ocurrió un error al procesar tu comando.' })
      );
    }
  };
}
