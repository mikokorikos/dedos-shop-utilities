import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { CONFIG, validateConfig } from './config/config.js';
import { buildPrefixCommandMap, buildSlashCommandMap } from './features/index.js';
import { createInteractionHandler } from './events/interactionCreate.js';
import { createMessageHandler } from './events/messageCreate.js';
import { onGuildMemberAdd } from './events/guildMemberAdd.js';
import { onMessageReactionAdd } from './events/messageReactionAdd.js';
import { onReady } from './events/ready.js';
import { logger } from './utils/logger.js';

validateConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

const slashCommands = buildSlashCommandMap();
const prefixCommands = buildPrefixCommandMap();

client.once('ready', (c) => {
  onReady(c).catch((error) => logger.error('Error en ready', error));
});
client.on('interactionCreate', createInteractionHandler({ slashCommands }));
client.on('messageCreate', createMessageHandler({ prefixCommands }));
client.on('guildMemberAdd', onGuildMemberAdd);
client.on('messageReactionAdd', onMessageReactionAdd);

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', error);
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
});

async function start() {
  try {
    await client.login(CONFIG.TOKEN);
    logger.info('Login iniciado');
  } catch (error) {
    logger.error('No se pudo iniciar sesión', error);
    process.exit(1);
  }
}

start();
