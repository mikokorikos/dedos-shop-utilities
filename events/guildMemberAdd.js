import { CONFIG } from '../config/config.js';
import { withBranding } from '../utils/branding.js';
import { RateLimitedQueue } from '../utils/queue.js';
import { logger } from '../utils/logger.js';

const welcomeQueue = new RateLimitedQueue({
  intervalMs: CONFIG.WELCOME.RATE_MS,
  concurrency: CONFIG.WELCOME.CONCURRENCY,
  maxSize: CONFIG.WELCOME.MAX_QUEUE,
});
welcomeQueue.start();

export function onGuildMemberAdd(member) {
  if (!CONFIG.WELCOME.ENABLED) return;
  welcomeQueue.push(async () => {
    try {
      await member.send(
        withBranding({
          title: '👋 ¡Bienvenido a Dedos Shop!',
          description: 'Abre un ticket cuando necesites ayuda y sigue las reglas para mantener la comunidad segura.',
        })
      );
      logger.info('DM de bienvenida enviado a', member.id);
    } catch (error) {
      logger.warn('No se pudo enviar bienvenida a', member.id, error.message);
    }
  });
}
