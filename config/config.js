import 'dotenv/config';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

const deduceGifPath = () => {
  const candidates = [
    process.env.DEDOS_GIF,
    'assets/dedosgif.gif',
    'dedosgif.gif',
    resolve(process.cwd(), 'dedosgif.gif'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return 'dedosgif.gif';
};

export const CONFIG = {
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID ?? null,
  GUILD_ID: process.env.GUILD_ID ?? null,
  ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID,
  MM_ROLE_ID: process.env.MM_ROLE_ID,
  TRADE_LOGS_CHANNEL_ID: process.env.TRADE_LOGS_CHANNEL_ID ?? null,
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH ?? 'dedosbot.log',
  DEDOS_GIF_PATH: deduceGifPath(),
  MYSQL: {
    HOST: process.env.MYSQL_HOST ?? 'localhost',
    PORT: toInt(process.env.MYSQL_PORT, 3306),
    USER: process.env.MYSQL_USER ?? 'root',
    PASSWORD: process.env.MYSQL_PASSWORD ?? '',
    DATABASE: process.env.MYSQL_DATABASE ?? 'dedos_shop',
    CONNECTION_LIMIT: toInt(process.env.MYSQL_CONNECTION_LIMIT, 10),
  },
  TICKETS: {
    CATEGORY_ID: process.env.TICKET_CATEGORY_ID ?? null,
    PANEL_CHANNEL_ID: process.env.TICKET_PANEL_CHANNEL_ID ?? null,
    STAFF_ROLE_IDS: (process.env.TICKET_STAFF_ROLE_IDS ?? process.env.TICKET_SUPPORT_ROLE_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    MAX_PER_USER: Math.max(1, toInt(process.env.TICKET_MAX_PER_USER, 2)),
    COOLDOWN_MS: Math.max(0, toInt(process.env.TICKET_COOLDOWN_MS, 60_000)),
  },
  MIDDLEMAN: {
    CATEGORY_ID: process.env.MM_CATEGORY_ID ?? null,
    MAX_TICKETS_PER_USER: Math.max(1, toInt(process.env.MM_MAX_TICKETS_PER_USER, 2)),
    TICKET_COOLDOWN_MS: Math.max(0, toInt(process.env.MM_TICKET_COOLDOWN_MS, 60_000)),
    HELP_UNLOCK_MS: Math.max(5_000, toInt(process.env.MM_HELP_UNLOCK_MS, 60_000)),
  },
  WELCOME: {
    ENABLED: toBool(process.env.WELCOME_ENABLED, true),
    RATE_MS: Math.max(250, toInt(process.env.WELCOME_RATE_MS, 1_000)),
    CONCURRENCY: Math.max(1, toInt(process.env.WELCOME_CONCURRENCY, 1)),
    MAX_QUEUE: Math.max(1, toInt(process.env.WELCOME_MAX_QUEUE, 1_000)),
  },
};

export function validateConfig() {
  const missing = [];
  if (!CONFIG.TOKEN) missing.push('TOKEN');
  if (!CONFIG.ADMIN_ROLE_ID) missing.push('ADMIN_ROLE_ID');
  if (!CONFIG.MM_ROLE_ID) missing.push('MM_ROLE_ID');
  if (missing.length) {
    throw new Error(`Variables de entorno faltantes: ${missing.join(', ')}`);
  }
}
