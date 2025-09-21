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
import { HelpService } from './services/helpService.js';
import { StaffActionRepository } from './repositories/staffActionRepository.js';
import { AmnestyService } from './services/amnestyService.js';

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
const staffActionRepository = new StaffActionRepository({ db: dbPool, logger });
const fxService = new FxService({ config, logger });
const welcomeService = new WelcomeService({ config, logger });
const verificationService = new VerificationService({ config, logger });
await verificationService.init();
const ticketService = new TicketService({ config, logger, fxService });
const warnService = new WarnService({ db: dbPool, config, logger });
const helpService = new HelpService({ config });
const amnestyService = new AmnestyService({
  warnService,
  staffActionRepository,
  logger,
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
  helpService,
  amnestyService,
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
