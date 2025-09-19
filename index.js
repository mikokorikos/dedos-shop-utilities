import { Client, GatewayIntentBits, Partials } from 'discord.js';
import config from './config/index.js';
import { createAppLogger } from './utils/logger.js';
import { createDatabasePool } from './services/database.js';
import { loadCommands } from './commands/index.js';
import { loadEvents } from './events/index.js';
import { FxService } from './services/fxService.js';
import { WelcomeService } from './services/welcomeService.js';
import { VerificationService } from './services/verificationService.js';
import { TicketService } from './services/ticketService.js';
import { WarnService } from './services/warnService.js';
import { EventService } from './services/eventService.js';
import { HelpService } from './services/helpService.js';
import { EventSessionRepository } from './repositories/eventSessionRepository.js';
import { EventParticipantRepository } from './repositories/eventParticipantRepository.js';
import { EventSanctionRepository } from './repositories/eventSanctionRepository.js';
import { EventVerificationLogRepository } from './repositories/eventVerificationLogRepository.js';
import { StaffActionRepository } from './repositories/staffActionRepository.js';
import { GuildSettingsRepository } from './repositories/guildSettingsRepository.js';
import { SettingsService } from './services/settingsService.js';
import { AmnestyService } from './services/amnestyService.js';
import { EventVerificationService } from './services/eventVerificationService.js';

const logger = createAppLogger(config);

process.on('unhandledRejection', (error) => {
  logger.error('[PROCESS] Promesa rechazada sin manejar:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('[PROCESS] Excepción no capturada:', error);
});

if (!config.BOT_TOKEN) {
  logger.error('[STARTUP] BOT_TOKEN no está configurado. Aborta el inicio.');
  process.exit(1);
}

const dbPool = createDatabasePool(config, logger);
const sessionRepository = new EventSessionRepository({ db: dbPool, logger });
const participantRepository = new EventParticipantRepository({ db: dbPool, logger });
const sanctionRepository = new EventSanctionRepository({ db: dbPool, logger });
const verificationLogRepository = new EventVerificationLogRepository({ db: dbPool, logger });
const staffActionRepository = new StaffActionRepository({ db: dbPool, logger });
const guildSettingsRepository = new GuildSettingsRepository({ db: dbPool, logger });
const settingsService = new SettingsService({ repository: guildSettingsRepository, logger });
const fxService = new FxService({ config, logger });
const welcomeService = new WelcomeService({ config, logger });
const verificationService = new VerificationService({ config, logger });
await verificationService.init();
const ticketService = new TicketService({ config, logger, fxService });
const warnService = new WarnService({ db: dbPool, config, logger });
const eventService = new EventService({
  config,
  logger,
  db: dbPool,
  sessionRepository,
  participantRepository,
  sanctionRepository,
  settingsService,
});
const helpService = new HelpService({ config });
const amnestyService = new AmnestyService({
  warnService,
  participantRepository,
  sanctionRepository,
  staffActionRepository,
  settingsService,
  logger,
});
const eventVerificationService = new EventVerificationService({
  config,
  logger,
  sessionRepository,
  participantRepository,
  sanctionRepository,
  verificationLogRepository,
  settingsService,
  eventService,
});

const commands = await loadCommands();
const events = await loadEvents();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

const context = {
  config,
  logger,
  db: dbPool,
  fxService,
  welcomeService,
  verificationService,
  ticketService,
  warnService,
  eventService,
  helpService,
  amnestyService,
  settingsService,
  eventVerificationService,
  commands,
};

for (const event of events) {
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, context));
  } else {
    client.on(event.name, (...args) => event.execute(...args, context));
  }
}

try {
  await client.login(config.BOT_TOKEN);
} catch (error) {
  logger.error('[STARTUP] No se pudo iniciar sesión en Discord:', error);
  process.exit(1);
}
