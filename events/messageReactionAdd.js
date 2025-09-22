import { logger } from '../utils/logger.js';

export async function onMessageReactionAdd(reaction, user) {
  if (user.bot) return;
  logger.debug('Reacción registrada', reaction.emoji?.name, 'por', user.id);
}
