import { ActivityType } from 'discord.js';
import { ensureDatabaseConnection } from '../services/db.js';
import { runMigrations } from '../services/migrations.js';
import { logger } from '../utils/logger.js';

export async function onReady(client) {
  logger.info('Bot conectado como', client.user.tag);
  await ensureDatabaseConnection();
  await runMigrations();
  client.user.setPresence({
    activities: [{ name: 'Dedos Shop', type: ActivityType.Watching }],
    status: 'online',
  });
}
