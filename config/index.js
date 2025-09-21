import { config as loadEnv } from 'dotenv';
import {
  sanitizeEnvValue,
  parseIntEnv,
  parseFloatEnv,
  parseBooleanEnv,
  parseColorEnv,
  parseIdListEnv,
} from '../utils/env.js';

loadEnv();

const config = {
  BOT_TOKEN: sanitizeEnvValue(process.env.BOT_TOKEN),
  COMMAND_PREFIX: sanitizeEnvValue(process.env.COMMAND_PREFIX) || ';',

  VERIFIED_ROLE_ID: sanitizeEnvValue(process.env.VERIFIED_ROLE_ID),
  VERIFICATION_CHANNEL_ID: sanitizeEnvValue(process.env.VERIFICATION_CHANNEL_ID),
  INVITE_CHANNEL_ID: sanitizeEnvValue(process.env.INVITE_CHANNEL_ID),
  VERIFICATION_MESSAGE_ID: sanitizeEnvValue(process.env.VERIFICATION_MESSAGE_ID),

  WELCOME_RATE_MS: parseIntEnv(process.env.WELCOME_RATE_MS, 1500),
  WELCOME_CONCURRENCY: parseIntEnv(process.env.WELCOME_CONCURRENCY, 1),
  WELCOME_MAX_QUEUE: parseIntEnv(process.env.WELCOME_MAX_QUEUE, 5000),

  GUILD_URL: sanitizeEnvValue(process.env.GUILD_URL) || 'https://discord.gg/dedos',
  HELP_URL:
    sanitizeEnvValue(process.env.HELP_URL) ||
    sanitizeEnvValue(process.env.GUILD_URL) ||
    'https://discord.gg/dedos',
  BRAND_ICON:
    sanitizeEnvValue(process.env.BRAND_ICON) ||
    'https://cdn.discordapp.com/attachments/1412699909949358151/1417020355389952031/8acfd3c22d8286c858abb3e9b4bc97cc.jpg',
  WELCOME_GIF: sanitizeEnvValue(process.env.WELCOME_GIF),

  SHOW_DEBUG: parseBooleanEnv(process.env.DEBUG, false),
  LOG_LEVEL: sanitizeEnvValue(process.env.LOG_LEVEL) || 'info',
  LOG_FILE_LEVEL: sanitizeEnvValue(process.env.LOG_FILE_LEVEL) || 'debug',
  LOG_DIRECTORY: sanitizeEnvValue(process.env.LOG_DIRECTORY) || 'logs',
  LOG_MAX_FILES: sanitizeEnvValue(process.env.LOG_MAX_FILES) || '14d',

  DB_HOST: sanitizeEnvValue(process.env.DB_HOST),
  DB_PORT: parseIntEnv(process.env.DB_PORT, 3306),
  DB_USER: sanitizeEnvValue(process.env.DB_USER),
  DB_PASSWORD: sanitizeEnvValue(process.env.DB_PASSWORD),
  DB_NAME: sanitizeEnvValue(process.env.DB_NAME),
  DB_POOL_LIMIT: parseIntEnv(process.env.DB_POOL_LIMIT, 10),

  WARN_EMBED_COLOR: parseColorEnv(process.env.WARN_EMBED_COLOR, 0x5000ab),
  WARN_GIF_URL:
    sanitizeEnvValue(process.env.WARN_GIF_URL) ||
    'https://media.tenor.com/4y0KxO6-hlUAAAAC/laser-cat.gif',
  VERBAL_WARN_GIF_URL:
    sanitizeEnvValue(process.env.VERBAL_WARN_GIF_URL) ||
    sanitizeEnvValue(process.env.WARN_GIF_URL) ||
    'https://media.tenor.com/XlKJsteVEhAAAAAC/anime-warning.gif',
  WARN_HISTORY_PAGE_SIZE: Math.max(1, parseIntEnv(process.env.WARN_HISTORY_PAGE_SIZE, 6)),

  TICKET_PANEL_CHANNEL_ID: sanitizeEnvValue(process.env.TICKET_PANEL_CHANNEL_ID),
  TICKET_CATEGORY_ID: sanitizeEnvValue(process.env.TICKET_CATEGORY_ID),
  TICKET_STAFF_ROLE_IDS: parseIdListEnv(
    process.env.TICKET_SUPPORT_ROLE_IDS || process.env.TICKET_STAFF_ROLE_IDS
  ),
  TICKET_MAX_PER_USER: Math.max(1, parseIntEnv(process.env.TICKET_MAX_PER_USER, 1)),
  TICKET_COOLDOWN_MS: Math.max(0, parseIntEnv(process.env.TICKET_COOLDOWN_MS, 3000)),
  TICKET_BRAND_ICON:
    sanitizeEnvValue(process.env.TICKET_BRAND_ICON) ||
    'https://cdn.discordapp.com/attachments/1412699909949358151/1417272988801175593/dedosbot_avatar.jpg',

  FX_REFRESH_INTERVAL_MS: 6 * 60 * 60 * 1000,
  MXN_USD_RATE: parseFloatEnv(process.env.MXN_USD_RATE, 0),

  TICKET_SELECT_ID: 'dedos_ticket_menu',
  TICKET_BUTTON_PREFIX: 'dedos_ticket_open_',
  TICKET_CLOSE_BUTTON_ID: 'dedos_ticket_close',
  VERIFY_BUTTON_ID: 'dedos_verify_me',
  HELP_MENU_ID: 'menu_inquietudes',
};

export default config;
