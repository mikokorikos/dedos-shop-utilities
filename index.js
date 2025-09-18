// index.js — Bot completo: Reglas con verificación y Bienvenidas por DM
// Requisitos: Node 18+, discord.js v14, dotenv

import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import path from "node:path";
import { createLogger, format, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import fs from "node:fs";
import { createPool } from "mysql2/promise";
import 'dotenv/config';

const sanitizeEnvValue = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parseIntWithFallback = (value, fallback) => {
  const parsed = Number.parseInt(sanitizeEnvValue(value) ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseColor = (value, fallback) => {
  const raw = sanitizeEnvValue(value);
  if (!raw) return fallback;
  if (/^0x[0-9a-f]+$/i.test(raw)) {
    return Number.parseInt(raw.slice(2), 16);
  }
  if (/^#[0-9a-f]+$/i.test(raw)) {
    return Number.parseInt(raw.slice(1), 16);
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
};
const parseIdList = (value) => {
  const raw = sanitizeEnvValue(value);
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};


// ======== Configuración ========
const CONFIG = {
  // Configuración de reglas y verificación
  ROLE_ID: process.env.VERIFIED_ROLE_ID || "1414055931066716411", // Rol verificado
  VERIFICATION_CHANNEL_ID: process.env.VERIFICATION_CHANNEL_ID || "1412699909949358151",
  
  // Configuración de bienvenidas
  RATE_MS: parseInt(process.env.WELCOME_RATE_MS || "1500", 10), // ms entre envíos
  CONCURRENCY: parseInt(process.env.WELCOME_CONCURRENCY || "1", 10), // tareas por tick
  MAX_QUEUE: parseInt(process.env.WELCOME_MAX_QUEUE || "5000", 10), // tope cola
  SHOW_DEBUG: /^1|true$/i.test(process.env.DEBUG || "0"),
  GUILD_URL: process.env.GUILD_URL || "https://discord.gg/dedos",
  HELP_URL: process.env.HELP_URL || process.env.GUILD_URL || "https://discord.gg/dedos",
  INVITE_CHANNEL_ID: process.env.INVITE_CHANNEL_ID || "1417041676135956481",
  BRAND_ICON:
    process.env.BRAND_ICON ||
    "https://cdn.discordapp.com/attachments/1412699909949358151/1417020355389952031/8acfd3c22d8286c858abb3e9b4bc97cc.jpg",
  // Configuración de tickets
  TICKET_PANEL_CHANNEL_ID: process.env.TICKET_PANEL_CHANNEL_ID || "1412574665100230748",
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || null,
  TICKET_STAFF_ROLE_IDS: (process.env.TICKET_SUPPORT_ROLE_IDS || process.env.TICKET_STAFF_ROLE_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  TICKET_MAX_PER_USER: Math.max(1, parseInt(process.env.TICKET_MAX_PER_USER || "1", 10)),
  TICKET_COOLDOWN_MS: Math.max(0, parseInt(process.env.TICKET_COOLDOWN_MS || "3000", 10)),
  TICKET_BRAND_ICON:
    process.env.TICKET_BRAND_ICON ||
    "https://cdn.discordapp.com/attachments/1412699909949358151/1417272988801175593/dedosbot_avatar.jpg?ex=68c9e1d4&is=68c89054&hm=8c67741a13f8fa8bd24b48c7e77e43bf74d56d7bc80f38a23fd27d97d1ab880b&",
  VERIFICATION_MESSAGE_ID: process.env.VERIFICATION_MESSAGE_ID || null,
  COMMAND_PREFIX: sanitizeEnvValue(process.env.MOD_PREFIX) || '!',
  WARN_EMBED_COLOR: parseColor(process.env.WARN_EMBED_COLOR, 0x5000ab),
  WARN_GIF_URL:
    sanitizeEnvValue(process.env.WARN_GIF_URL) ||
    'https://media.tenor.com/4y0KxO6-hlUAAAAC/laser-cat.gif',
  VERBAL_WARN_GIF_URL:
    sanitizeEnvValue(process.env.VERBAL_WARN_GIF_URL) ||
    sanitizeEnvValue(process.env.WARN_GIF_URL) ||
    'https://media.tenor.com/XlKJsteVEhAAAAAC/anime-warning.gif',
  WARN_HISTORY_PAGE_SIZE: Math.max(
    1,
    parseIntWithFallback(process.env.WARN_HISTORY_PAGE_SIZE, 6)
  ),
  EVENT_ROLE_ID:
    sanitizeEnvValue(process.env.EVENTO_ROLE_ID) ||
    sanitizeEnvValue(process.env.EVENT_ROLE_ID) ||
    null,
  EVENTS_CHANNEL_ID:
    sanitizeEnvValue(process.env.EVENTOS_CHANNEL_ID) ||
    sanitizeEnvValue(process.env.EVENT_CHANNEL_ID) ||
    null,
  EVENT_BUTTON_LABEL:
    sanitizeEnvValue(process.env.EVENTO_BUTTON_LABEL) ||
    sanitizeEnvValue(process.env.EVENT_PANEL_BUTTON_LABEL) ||
    'Unirme al evento',
  EVENT_REMINDER_CHANNEL_IDS: parseIdList(process.env.EVENT_REMINDER_CHANNEL_IDS),
  EVENT_REMINDER_COOLDOWN_MS: Math.max(
    0,
    parseIntWithFallback(process.env.EVENT_REMINDER_COOLDOWN_MINUTES, 720) * 60_000
  ),
  EVENT_REMINDER_MESSAGE_THRESHOLD: Math.max(
    1,
    parseIntWithFallback(process.env.EVENT_REMINDER_MESSAGE_THRESHOLD, 1)
  ),
  EVENT_REMINDER_GIF_URL:
    sanitizeEnvValue(process.env.EVENT_REMINDER_GIF_URL) ||
    'https://message.style/cdn/images/b6b34048e6b8e4f2d6931af81a6935dbeb06d1d1a619dcf353733ab75bbcca8c.gif',
  EVENT_REMINDER_JOIN_LABEL:
    sanitizeEnvValue(process.env.EVENT_REMINDER_JOIN_LABEL) || 'Ir al evento',
  EVENT_REMINDER_STOP_LABEL:
    sanitizeEnvValue(process.env.EVENT_REMINDER_STOP_LABEL) || 'No volver a recordar',
  LOG_LEVEL: sanitizeEnvValue(process.env.LOG_LEVEL) || 'info',
  LOG_FILE_LEVEL: sanitizeEnvValue(process.env.LOG_FILE_LEVEL) || 'debug',
  LOG_DIRECTORY: sanitizeEnvValue(process.env.LOG_DIRECTORY) || 'logs',
  LOG_MAX_FILES: sanitizeEnvValue(process.env.LOG_MAX_FILES) || '14d',
};

const LOG_DIRECTORY = CONFIG.LOG_DIRECTORY || 'logs';
const consoleLogLevel = CONFIG.SHOW_DEBUG ? 'debug' : CONFIG.LOG_LEVEL;

try {
  if (LOG_DIRECTORY && !fs.existsSync(LOG_DIRECTORY)) {
    fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
  }
} catch (error) {
  logger.error('[LOG] No se pudo preparar el directorio de logs:', error);
}

const loggerTransports = [
  new transports.Console({
    level: consoleLogLevel,
    format: format.combine(
      format.colorize(),
      format.timestamp({ format: 'HH:mm:ss' }),
      format.printf((info) => `${info.timestamp} [${info.level}] ${info.message}`)
    ),
  }),
];

if (LOG_DIRECTORY) {
  loggerTransports.push(
    new DailyRotateFile({
      level: CONFIG.LOG_FILE_LEVEL || CONFIG.LOG_LEVEL,
      dirname: LOG_DIRECTORY,
      filename: 'dedos-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: CONFIG.LOG_MAX_FILES || '14d',
      zippedArchive: false,
    })
  );
}

const logger = createLogger({
  level: consoleLogLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf((info) => `${info.timestamp} [${info.level}] ${info.message}`)
  ),
  transports: loggerTransports,
});



if (!process.env.TOKEN) {
  logger.error("[FATAL] Falta TOKEN en el entorno (.env)");
  process.exit(1);
}

let verificationMessageId = CONFIG.VERIFICATION_MESSAGE_ID || null; // Guardar ID del mensaje de verificación

// ======== Base de datos ========
const dbPool = createPool({
  host: sanitizeEnvValue(process.env.DB_HOST) || 'us-mia-11.vexyhost.com',
  port: parseIntWithFallback(process.env.DB_PORT, 3306),
  user: sanitizeEnvValue(process.env.DB_USER) || 'u8163_s5VWC1L7b3',
  password: sanitizeEnvValue(process.env.DB_PASSWORD),
  database: sanitizeEnvValue(process.env.DB_NAME) || 's8163_dedosshop',
  waitForConnections: true,
  connectionLimit: Math.max(1, parseIntWithFallback(process.env.DB_POOL_LIMIT, 10)),
  charset: 'utf8mb4_unicode_ci',
});

// ======== Cliente Discord ========
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers, // Para bienvenidas y verificación
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ======== Cola con limitación de tasa/concurrencia ========
class RateLimitedQueue {
  constructor({ intervalMs, concurrency, maxQueue }) {
    this.intervalMs = Math.max(250, Number(intervalMs) | 0);
    this.concurrency = Math.max(1, Number(concurrency) | 0);
    this.maxQueue = Math.max(1, Number(maxQueue) | 0);
    this.queue = [];
    this.active = 0;
    this.timer = null;
    this.lastReport = 0;
  }

  start() {
    if (this.timer) return;
    const t = setInterval(() => this.#tick(), this.intervalMs);
    if (typeof t.unref === "function") t.unref();
    this.timer = t;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  size() {
    return this.queue.length + this.active;
  }

  push(fn) {
    if (this.queue.length >= this.maxQueue) {
      logger.warn(
        `[QUEUE] Cola llena (${this.queue.length}/${this.maxQueue}). Se descarta para proteger recursos.`
      );
      return false;
    }
    this.queue.push(fn);
    this.#maybeReport();
    return true;
  }

  async #run(fn) {
    this.active++;
    try {
      await fn();
    } catch (err) {
      logger.error("[QUEUE] Tarea falló:", err?.stack || err);
    } finally {
      this.active--;
    }
  }

  #tick() {
    for (let i = 0; i < this.concurrency && this.queue.length > 0; i++) {
      const fn = this.queue.shift();
      this.#run(fn);
    }
  }

  #maybeReport() {
    const now = Date.now();
    if (now - this.lastReport > 10_000) {
      this.lastReport = now;
      logger.info(`[QUEUE] Pendientes: ${this.queue.length}, activos: ${this.active}`);
    }
  }
}

const welcomeQueue = new RateLimitedQueue({
  intervalMs: CONFIG.RATE_MS,
  concurrency: CONFIG.CONCURRENCY,
  maxQueue: CONFIG.MAX_QUEUE,
});

// ======== Utilidades ========
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ======== Función para detectar y obtener el GIF ========
let cachedGifPath = null;
let gifLookupAttempted = false;

function resolveGifPath() {
  if (!gifLookupAttempted) {
    const candidates = [];
    const envPath = sanitizeEnvValue(process.env.WELCOME_GIF);
    if (envPath) candidates.push(envPath);
    candidates.push(
      'dedosgif.gif',
      path.join(process.cwd(), 'dedosgif.gif'),
      path.join(process.cwd(), 'assets', 'dedosgif.gif'),
      'dedosgift.gif',
      path.join(process.cwd(), 'dedosgift.gif')
    );

    cachedGifPath = candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
    gifLookupAttempted = true;

    if (cachedGifPath) {
      logger.debug(`[GIF] Usando archivo ${cachedGifPath} para los embeds.`);
    } else {
      logger.warn('[GIF] No se encontro dedosgif.gif en el directorio actual. Se usara la URL remota configurada.');
    }
  }

  return cachedGifPath;
}

const COMMAND_PREFIX = CONFIG.COMMAND_PREFIX;

const MODERATOR_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
];

const hasModeratorAccess = (member) =>
  !!member &&
  MODERATOR_PERMISSIONS.some((perm) => member.permissions?.has?.(perm));

const hasAdminAccess = (member) =>
  !!member && member.permissions?.has?.(PermissionFlagsBits.Administrator);

const EVENT_JOIN_BUTTON_ID = "dedos_event_join";
const EVENT_REMINDER_STOP_BUTTON_ID = "dedos_event_reminder_stop";


const eventMessageState = new Map();
const eventReminderState = new Map();
let reminderRoleWarningLogged = false;
let reminderChannelWarningLogged = false;


function normalizeUserId(input) {
  if (typeof input !== "string") return null;
  const match = input.match(/\d{5,}/);
  return match ? match[0] : null;
}

async function resolveMemberFromArgs(message, args) {
  if (!message?.guild) {
    return { member: null, remaining: Array.isArray(args) ? [...args] : [] };
  }
  let remaining = Array.isArray(args) ? [...args] : [];
  if (message.mentions?.members?.size) {
    const member = message.mentions.members.first();
    const variants = new Set([`<@${member.id}>`, `<@!${member.id}>`]);
    remaining = remaining.filter((token) => !variants.has(token));
    return { member, remaining };
  }
  if (!remaining.length) {
    return { member: null, remaining };
  }
  const targetId = normalizeUserId(remaining[0]);
  if (!targetId) {
    return { member: null, remaining };
  }
  try {
    const member = await message.guild.members.fetch(targetId);
    remaining = remaining.slice(1);
    return { member, remaining };
  } catch {
    return { member: null, remaining: remaining.slice(1) };
  }
}

const SQL_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2} /;

function parseSqlDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === "string" && SQL_DATETIME_PATTERN.test(value)) {
    return new Date(value.replace(" ", "T") + "Z");
  }
  return new Date(value);
}

const toDiscordTimestamp = (date) =>
  Math.floor((date instanceof Date ? date : new Date(date)).getTime() / 1000);

const EMBED_GIF_FILENAME = 'dedosgif.gif';

const buildEmbedPayload = (embed, gifPath, fallbackUrl, extra = {}) => {
  const payload = { embeds: [embed], ...extra };
  if (gifPath) {
    embed.setImage(`attachment://${EMBED_GIF_FILENAME}`);
    payload.files = [{ attachment: gifPath, name: EMBED_GIF_FILENAME }];
  } else if (fallbackUrl) {
    embed.setImage(fallbackUrl);
  }
  return payload;
};

const WARN_REASON_MAX_LENGTH = 1900;
const WARN_CONTEXT_URL_MAX_LENGTH = 255;

async function ensureGuildMemberRecord(guildId, userId) {
  if (!guildId || !userId) return;
  await dbPool.execute(
    `INSERT INTO guild_members (guild_id, user_id, first_seen_at, last_warn_at)
     VALUES (?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE last_warn_at = VALUES(last_warn_at)`,
    [guildId, userId]
  );
}

async function insertWarnRecord({ guildId, userId, moderatorId, reason, points = 1, contextUrl }) {
  await ensureGuildMemberRecord(guildId, userId);
  const cleanReason = reason ? reason.slice(0, WARN_REASON_MAX_LENGTH) : null;
  const cleanContextUrl = contextUrl ? contextUrl.slice(0, WARN_CONTEXT_URL_MAX_LENGTH) : null;
  const [result] = await dbPool.execute(
    `INSERT INTO warns (guild_id, user_id, moderator_id, reason, points, context_message_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [guildId, userId, moderatorId, cleanReason, points, cleanContextUrl]
  );
  const [[totals]] = await dbPool.execute(
    `SELECT COUNT(*) AS total_warns, COALESCE(SUM(points), 0) AS total_points
     FROM warns
     WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId]
  );
  return {
    warnId: Number(result.insertId),
    totalWarns: Number(totals?.total_warns ?? 1),
    totalPoints: Number(totals?.total_points ?? points),
  };
}

async function fetchWarnTotals(guildId, userId) {
  const [[row]] = await dbPool.execute(
    `SELECT COUNT(*) AS total_warns, COALESCE(SUM(points), 0) AS total_points
     FROM warns
     WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId]
  );
  return {
    totalWarns: Number(row?.total_warns ?? 0),
    totalPoints: Number(row?.total_points ?? 0),
  };
}

async function fetchWarnHistory(guildId, userId, limit = CONFIG.WARN_HISTORY_PAGE_SIZE) {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || CONFIG.WARN_HISTORY_PAGE_SIZE, 20));
  const [rows] = await dbPool.execute(
    `SELECT id, moderator_id, reason, created_at, points
     FROM warns
     WHERE guild_id = ? AND user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [guildId, userId, cappedLimit]
  );
  return rows;
}

const SHOP_GIF_URL = "https://message.style/cdn/images/b6b34048e6b8e4f2d6931af81a6935dbeb06d1d1a619dcf353733ab75bbcca8c.gif";
const USD_FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const DEFAULT_MXN_TO_USD_RATE = 0.058;
let mxnToUsdRate = parseFloat(process.env.MXN_USD_RATE || "0");
let usingFallbackRate = true;
let mxnToUsdLastUpdated = null;

if (mxnToUsdRate > 0) {
  usingFallbackRate = false;
  mxnToUsdLastUpdated = Date.now();
} else {
  mxnToUsdRate = DEFAULT_MXN_TO_USD_RATE;
}

async function refreshMxnToUsdRate() {
  if (process.env.MXN_USD_DISABLE_FETCH === "1") return;
  if (typeof fetch !== "function") return;
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/MXN", {
      headers: { "User-Agent": "DedosShopBot/1.0 (+https://discord.gg/dedos)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const nextRate = Number(payload?.rates?.USD);
    if (Number.isFinite(nextRate) && nextRate > 0) {
      mxnToUsdRate = nextRate;
      usingFallbackRate = false;
      mxnToUsdLastUpdated = Date.now();
            if (CONFIG.SHOW_DEBUG) {
        logger.info(`[FX] Tasa MXN->USD actualizada: ${nextRate.toFixed(4)}`);
      }
    }
  } catch (error) {
    logger.warn(`[FX] No se pudo actualizar la tasa MXN->USD: ${error?.message || error}`);
  }
}

function formatUsdFromMxn(amountMxn) {
  const usdValue = amountMxn * mxnToUsdRate;
  return `~ ${USD_FORMATTER.format(usdValue)} USD`;
}


function buildUsdInfoField() {
  const rateText = mxnToUsdRate.toFixed(4);
  const detail = usingFallbackRate
    ? "Usamos una tasa predeterminada cuando no hay actualizacion automatica disponible."
    : "La tasa se actualiza de forma automatica cada 6 horas desde open.er-api.com.";
  const lastUpdateLine = mxnToUsdLastUpdated
    ? `Ultima actualizacion: ${new Date(mxnToUsdLastUpdated).toISOString()}.`
    : "Ultima actualizacion: no disponible (tasa predeterminada).";
  return {
    name: "Como calculamos el USD",
    value: [
      `Conversion MXN -> USD = ${rateText}.`,
      detail,
      lastUpdateLine,
    ].join("\n"),
  };
}


const fxInterval = setInterval(() => {
  refreshMxnToUsdRate().catch(() => {});
}, 6 * 60 * 60 * 1000);
if (typeof fxInterval.unref === "function") fxInterval.unref();
refreshMxnToUsdRate().catch(() => {});

function persistVerificationMessageId(id) {
  const safeId = id ? String(id) : "";
  verificationMessageId = safeId || null;
  CONFIG.VERIFICATION_MESSAGE_ID = safeId || null;

  const envPath = ".env";
  try {
    let envContent = "";
    let fileExists = true;

    try {
      envContent = fs.readFileSync(envPath, "utf8");
    } catch (readError) {
      if (readError.code === "ENOENT") {
        fileExists = false;
      } else {
        throw readError;
      }


    }

    const line = `VERIFICATION_MESSAGE_ID=${safeId}`;

    let updatedContent;
    if (fileExists) {
      if (/^VERIFICATION_MESSAGE_ID=.*$/m.test(envContent)) {
        updatedContent = envContent.replace(/^VERIFICATION_MESSAGE_ID=.*$/m, line);
      } else {
        const suffix = envContent.endsWith("\n") ? "" : "\n";
        updatedContent = `${envContent}${suffix}${line}\n`;
      }
    } else {
      updatedContent = `${line}\n`;
    }

    fs.writeFileSync(envPath, updatedContent, "utf8");
  } catch (error) {
    logger.warn(
      "[VERIFY] No se pudo guardar VERIFICATION_MESSAGE_ID en .env:",
      error?.message || error
    );
  }
}



// ======== Funciones de embeds ========
function buildWelcomeEmbed(member) {
  let authorName = CONFIG.GUILD_URL;
  try {
    authorName = new URL(CONFIG.GUILD_URL).host || CONFIG.GUILD_URL;
  } catch {}

  const title = "¡Bienvenido a dedos!";
  const verificationLink = `https://discord.com/channels/${member.guild.id}/${CONFIG.VERIFICATION_CHANNEL_ID}`;
  const inviteLink = `https://discord.com/channels/${member.guild.id}/${CONFIG.INVITE_CHANNEL_ID}`;
  const description = [
    `Hola <@${member.id}>, gracias por unirte ??`,
    `Ahora somos **${member.guild.memberCount}** miembros ??`,
    "\nPrimero verifica para obtener acceso a los canales:",
    `[#verificación](${verificationLink}) - [#invitación](${inviteLink})`,
    "\nAquí siempre tenemos eventos activos.",
    "Más info: consulta el canal de información del servidor.",
    "Soporte: usa el canal de ayuda.",
    "\nEste servidor es de **trades, middleman y ventas**.",
    "\n¡Disfruta tu estancia y no olvides invitar a tus amigos! ??",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(0x5000ab)
    .setTitle(title)
    .setAuthor({ name: authorName, iconURL: CONFIG.BRAND_ICON })
    .setDescription(description)
    .setFooter({ text: `Gracias por unirte a ${CONFIG.GUILD_URL}`, iconURL: CONFIG.BRAND_ICON });
}

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setTitle("?? Reglas del Servidor")
    .setColor(0x5000ab)
    .setDescription(
      "Antes de participar en nuestra comunidad, asegúrate de leer cuidadosamente estas reglas. El cumplimiento garantiza una convivencia sana y una experiencia divertida para todos. ?"
    )
    .addFields(
      {
        name: "?? Reglas Generales",
        value:
          "**1. Respeto básico**\n" +
          "- Insultos casuales permitidos dentro del contexto de broma.\n" +
          "- Prohibido el acoso persistente, amenazas graves o ataques personales.\n" +
          "- Estrictamente prohibido el doxxing o compartir datos personales.\n\n" +
          "**2. Convivencia**\n" +
          "- Usa cada canal según su propósito.\n" +
          "- Respeta a moderadores y sus decisiones.\n" +
          "- Si surge un conflicto, resuélvelo en privado o pide mediación a un mod.",
      },
      {
        name: "?? Trading e Intercambios",
        value:
          "- Puedes tradear **cualquier ítem, cuenta o servicio gaming** en el canal de trading.\n" +
          "- **Trading con MM oficial:** protegido y regulado.\n" +
          "- **Trading directo:** bajo tu propio riesgo. No nos hacemos responsables de estafas.\n" +
          "- Prohibido el comercio de cuentas robadas o contenido ilegal.\n" +
          "- Para usar el MM oficial, contacta a un moderador.",
      },
      {
        name: "?? Contenido Prohibido",
        value:
          "**4. NSFW**\n" +
          "- Prohibido cualquier contenido sexual explícito, incluyendo avatares y nombres.\n\n" +
          "**5. Spam y Flood**\n" +
          "- No repitas mensajes ni hagas menciones masivas.\n" +
          "- Evita flood de imágenes, stickers o emojis.\n" +
          "- Máximo **5 mensajes seguidos** sin respuesta de otros.\n\n" +
          "**6. Contenido Malicioso**\n" +
          "- Prohibido compartir virus, malware, IP grabbers o links peligrosos.\n" +
          "- No publiques phishing o estafas. Reporta cualquier link sospechoso.",
      },
      {
        name: "?? Sistema de Sanciones",
        value:
          "- **1ra vez:** Advertencia verbal.\n" +
          "- **2da vez:** Timeout temporal (1–24h).\n" +
          "- **3ra vez:** Expulsión (Kick).\n" +
          "- **Casos graves:** Ban inmediato (ej. doxxing, malware, amenazas serias).",
      }
    )
    .setFooter({
      text: "Básicamente: diviértete, comercia y sé respetuoso. No arruines la experiencia.",
    });
}

const SHOP_PAYMENT_METHODS_FIELD = {
  name: "Metodos de pago:",
  value: "<:emojigg_LTC:1417418373721096254>  -  **Litecoin**  -  <:20747paypal:1417021872889139283>  -  **PayPal**   -  <:oxxo:1417027814246449263>  -  **Oxxo**   -   ??  -  **Transferencia**\n",
};

const SHOP_CLAUSULAS_FIELD = {
  name: "Clausulas:",
  value: "Los pagos mediante transferencia bancaria y OXXO están disponibles únicamente en México ????. Los métodos PayPal <:20747paypal:1417021872889139283> y Litecoin <:emojigg_LTC:1417418373721096254> se encuentran habilitados a nivel global ??. En caso de utilizar PayPal, se aplicará un cargo adicional correspondiente a la comisión de la plataforma (aproximadamente 3%, variable según divisa y país de origen).",
};

const SHOP_STORE_PETS = [
  { name: " <:Discobee:1414419895348891689>  Disco Bee", mxn: 80 },
  { name: " <:gag_raccon:1417401527714320506> Raccon", mxn: 100 },
  { name: "<:Kitsune:1414434736880877650>  Kitsune", mxn: 260 },
  { name: "<:Butterfly:1417027669647949864>  Butterfly", mxn: 35 },
  { name: "<:DragonFly:1412701832311996499>  Dragonfly", mxn: 20 },
  { name: "<:Mimic_Octopus:1417027684751507476>  MImic", mxn: 20 },
];

const SHOP_PET_ROBUX_FIELDS = [
  {
    name: " <:Discobee:1414419895348891689>  Disco Bee",
    value: "    **500 Robux** <:9073robux:1417021867167846420>",
    inline: true,
  },
  {
    name: " <:gag_raccon:1417401527714320506> Raccon",
    value: "    **700 Robux** <:9073robux:1417021867167846420> ",
    inline: true,
  },
  {
    name: "<:Kitsune:1414434736880877650>  Kitsune",
    value: "    **1800 Robux** <:9073robux:1417021867167846420> ",
    inline: true,
  },
  {
    name: "<:Butterfly:1417027669647949864>  Butterfly",
    value: "    **300 Robux** <:9073robux:1417021867167846420> ",
    inline: true,
  },
  {
    name: "<:DragonFly:1412701832311996499>  Dragonfly",
    value: "     **80 Robux** <:9073robux:1417021867167846420>",
    inline: true,
  },
  {
    name: "<:Mimic_Octopus:1417027684751507476>  MImic",
    value: "      **80 Robux** <:9073robux:1417021867167846420> ",
    inline: true,
  },
  {
    name: " Clausulas",
    value: "No compramos ítems relacionados con Steal o Brainrot. Los precios no incluyen el 30% de tax que Roblox <:Roblox:1417027880080375929> descuenta en cada transacción. No realizamos pagos mediante in game gift (no se regalan pases dentro de ningún juego). Por seguridad, en el caso de los Raccoons <:gag_raccon:1417401527714320506> mantenemos un mínimo de 48 horas en nuestro inventario antes de liberar el pago, para evitar la compra de duplicados. **Esto aplica únicamente al Raccoon otras pets si son pago inmediato **<:gag_raccon:1417401527714320506>, ya que es el pet más duplicado del juego.",
  },
];

const TICKET_INFO_MENU_ID = "ticket_info_menu";
const TICKET_BUTTON_PREFIX = "ticket_open:";
const TICKET_CLOSE_BUTTON_ID = "ticket_close";

function applyShopBrand(embed) {
  return embed
    .setAuthor({ name: ".gg/dedos", iconURL: CONFIG.TICKET_BRAND_ICON })
    .setFooter({
      text: "En caso de dudas, en el canal de tickets puedes solicitar ayuda.",
      iconURL: CONFIG.TICKET_BRAND_ICON,
    })
    .setImage(SHOP_GIF_URL);
}

function buildTicketPanelEmbed() {
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("COMPRA | VENTA")
    .setDescription(
      "<a:27572sparkles:1417433396958728254>En ?????????? ???????? puedes pets de Grow a Garden, Robux <:9073robux:1417021867167846420>, N17r0 B005tz <a:7478evolvingbadgenitroascaling:1417021865893036093>, Decoraciones<a:6633kittypaw14:1416604699716751370>, Tambien ofrecemos otros servicios de streaming a cambio de dinero o pets (Para mas informacion abre un ticket de ayuda). \n?????????? ???????? tambien **te compra tus PETS de Grow a Garden por robux.**\n**?? Selecciona una opción en el menú de abajo para obtener más información.**"
    )
    .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());
  return applyShopBrand(embed);
}

function buildTicketSellPetsEmbed() {
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("PETS QUE COMPRAMOS")
    .setDescription(
      "En ?????????? ???????? compramos tus PETS de GAG por** ROBUX** <:9073robux:1417021867167846420>. <:50230exclamationpoint:1417021877829767168> La lista muestra precios promedio calculados según el valor real de robux y la demanda de cada pet, por lo que pueden subir o bajar según la popularidad del juego. <a:9062kittypaw04:1416604701847322685> ¿No estás conforme con el precio? Abre un ticket y haz tu** oferta**.\n"
    )
    .addFields(...SHOP_PET_ROBUX_FIELDS);
  return applyShopBrand(embed);
}

function buildTicketBuyPetsEmbed() {
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("PETS QUE VENDEMOS")
    .setDescription(
      "?????????? ???????? es tu mejor opción para adquirir pets de **Grow a Garden.**\nGarantizamos **precios más bajos** que la competencia y una experiencia de compra confiable."
    );

  for (const item of SHOP_STORE_PETS) {
    embed.addFields({
      name: item.name,
      value: `    **${item.mxn} MXN**\n${formatUsdFromMxn(item.mxn)}`,
      inline: true,
    });
  }

  embed.addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());
  return applyShopBrand(embed);
}

function buildTicketRobuxEmbed() {
  const priceByGroup = formatUsdFromMxn(125);
  const priceByGame = formatUsdFromMxn(125);
  const priceByGamepass = formatUsdFromMxn(135);

  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("COMPRAR ROBUX")
    .setDescription("?????????? ???????? vende robux a los mejores precios. Ofrecioendo pagos por grupo o por gamepass.")
    .addFields(
      {
        name: "1000 ROBUX | PAGO POR GRUPO ",
        value: [
          "La opción **más conveniente** para adquirir Robux <:9073robux:1417021867167846420> es mediante pago por grupo. Únicamente debes unirte y permanecer en el grupo un mínimo de **2 semanas** para habilitar los envíos.",
          "Una vez cumplida la antigüedad requerida, los pagos se realizan de forma inmediata y recibirás exactamente 1000 Robux.",
          `**El costo es de $125 MXN por cada 1000 Robux** (${priceByGroup}).`,
          "**Grupo:** https://www.roblox.com/es/communities/12082479/unnamed#!/about",
        ].join("\n"),
      },
      {
        name: "1000 ROBUX | PAGO POR JUEGO",
        value: [
          "Esta es una alternativa conveniente si deseas utilizar Robux <:9073robux:1417021867167846420> para adquirir objetos o gamepasses en tu juego favoo.",
          "Realizas la compra de los Robux y recibirás el equivalente en el objeto o gamepass de tu elección.",
          `**El costo es de $125 MXN por cada 1000 Robux** (${priceByGame}).`,
        ].join("\n"),
      },
      {
        name: "1000 ROBUX | PAGO POR GAMEPASS",
        value: [
          "Esta es la opción menos recomendable<:50230exclamationpoint:1417021877829767168>, ya que funciona mediante gamepass, similar a Pls Donate.",
          "Roblox aplica una deducción del 30%, por lo que es necesario enviar 1,429 Robux para que recibas 1,000 netos.",
          "Además, el monto se acredita como pendiente y tarda entre 6 y 8 días en reflejarse en tu cuenta.",
          `**El costo es de $135 MXN por cada 1,000 Robux** (${priceByGamepass}).`,
        ].join("\n"),
      }
    )
    .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());

  return applyShopBrand(embed);
}

function buildTicketNitroEmbed() {
  const priceNitro = formatUsdFromMxn(95);
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("COMPRAR N17r0 B005tz")
    .setDescription(
      "Dedos Shop vende **N17r0 B005tz** al mejor precio de la competencia: **95 MXN por 1 mes.** " +
        `${priceNitro} Al ser legal paid, este tipo de NB es dificil de conseguir, por lo que pedimos disculpas en caso de no contar con stock disponible. A diferencia de otros, aqui no corres riesgo de recibir advertencias en tu cuenta de Discord ni de que sea revocado antes de completar el mes contratado.`
    )
    .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());

  return applyShopBrand(embed);
}

function buildTicketDecorationsEmbed() {
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("COMPRAR DECORACIONES")
    .setDescription(
      "?????????? ???????? vende decoraciones y efectos legal paid por regalo de perfil\n$4.99 <a:51047animatedarrowwhite:1417021879411281992>    $3.1 \n$5.99  <a:51047animatedarrowwhite:1417021879411281992>    $3.3\n$6.99 <a:51047animatedarrowwhite:1417021879411281992>      $3.6 \n$7.99  <a:51047animatedarrowwhite:1417021879411281992>   $3.9\n$8.49 <a:51047animatedarrowwhite:1417021879411281992>      $4.05\n$9.99  <a:51047animatedarrowwhite:1417021879411281992>      $5\n$11.99 <a:51047animatedarrowwhite:1417021879411281992>    $5.5\nPrecio de la izquierda es a lo que discord los vende, el de la derecha es el precio que ?????????? ???????? lo vende."
    )
    .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());

  return applyShopBrand(embed);
}

const SHOP_TICKET_OPTIONS = [
  {
    id: "sell_pets",
    menuLabel: "Vender tus pets (Robux)",
    menuDescription: "Cotizamos tus mascotas de Grow a Garden por Robux.",
    embedBuilder: buildTicketSellPetsEmbed,
    channelPrefix: "venta",
    emoji: "??",
    introLines: [
      "Gracias por confiar en ?????????? ???????? para vender tus pets de Grow a Garden.",
      "Incluye la lista de pets que ofreces y la cantidad deseada en Robux.",
      "Adjunta capturas o pruebas de inventario si es posible.",
    ],
  },
  {
    id: "buy_pets",
    menuLabel: "Comprar pets (MXN / USD)",
    menuDescription: "Consulta precios actualizados en pesos y dólares.",
    embedBuilder: buildTicketBuyPetsEmbed,
    channelPrefix: "compra",
    emoji: "??",
    introLines: [
      "Cuéntanos qué pets deseas comprar y cuántas unidades necesitas.",
      "Indica tu método de pago favorito (PayPal, Litecoin, Oxxo, transferencia).",
      "El equipo te confirmará stock y proceso de pago en breve.",
    ],
  },
  {
    id: "buy_robux",
    menuLabel: "Comprar Robux",
    menuDescription: "Elige grupo, juego o gamepass y abre tu ticket.",
    embedBuilder: buildTicketRobuxEmbed,
    channelPrefix: "robux",
    emoji: "??",
    introLines: [
      "Indica si prefieres recibir Robux por grupo, juego o gamepass.",
      "Comparte tu usuario de Roblox y cualquier detalle adicional.",
      "Asegúrate de leer las condiciones y tiempos detallados en la información.",
    ],
  },
  {
    id: "buy_nitro",
    menuLabel: "Comprar N17r0 B005tz",
    menuDescription: "Reserva b005tz legales al mejor precio.",
    embedBuilder: buildTicketNitroEmbed,
    channelPrefix: "n17r0",
    emoji: "??",
    introLines: [
      "Dinos cuantos meses de N17r0 B005tz necesitas y para que servidor.",
      "Comparte el metodo de pago y, si aplica, la fecha en la que lo requieres.",
      "Recuerda que el stock es limitado y puede agotarse rapidamente.",
    ],
  },
  {
    id: "buy_decor",
    menuLabel: "Comprar decoraciones",
    menuDescription: "Obten efectos y regalos premium más baratos.",
    embedBuilder: buildTicketDecorationsEmbed,
    channelPrefix: "decor",
    emoji: "??",
    introLines: [
      "Enumera las decoraciones o efectos que te interesan y sus precios.",
      "Indica si necesitas el regalo para un perfil específico o para ti.",
      "Te confirmaremos disponibilidad y pasos a seguir para cerrar la compra.",
    ],
  },
];

const SHOP_TICKET_OPTION_MAP = new Map(SHOP_TICKET_OPTIONS.map((option) => [option.id, option]));

const ticketCooldowns = new Map();

function sanitizeTicketNameSegment(value) {
  return (
    (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cliente"
  );
}

function buildTicketChannelName(option, user) {
  const username = sanitizeTicketNameSegment(
    user.username || user.globalName || user.displayName || "cliente"
  );
  const suffixBase =
    user.discriminator && user.discriminator !== "0"
      ? user.discriminator
      : user.id.slice(-4);
  const raw = `${option.channelPrefix}-${username}-${suffixBase}`.replace(/-+/g, "-");
  return raw.length > 95 ? raw.slice(0, 95) : raw;
}

function parseTicketTopic(topic) {
  if (!topic || !topic.startsWith("TICKET:")) return null;
  const parts = topic.split(":");
  if (parts.length < 3) return null;
  const optionId = parts[1];
  const userPart = parts.slice(2).join(":").split("|")[0].trim();
  if (!optionId || !userPart) return null;
  return { optionId, userId: userPart };
}

async function findExistingTicketChannels(guild, userId) {
  const channels = await guild.channels.fetch();
  const matches = [];
  for (const channel of channels.values()) {
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    const info = parseTicketTopic(channel.topic);
    if (info?.userId === userId) {
      matches.push(channel);
    }
  }
  return matches;
}

async function resolveTicketParentChannelId(guild) {
  if (CONFIG.TICKET_CATEGORY_ID) {
    const category =
      guild.channels.cache.get(CONFIG.TICKET_CATEGORY_ID) ||
      (await guild.channels.fetch(CONFIG.TICKET_CATEGORY_ID).catch(() => null));
    if (category?.type === ChannelType.GuildCategory) {
      return category.id;
    }
  }

  if (CONFIG.TICKET_PANEL_CHANNEL_ID) {
    const panelChannel =
      guild.channels.cache.get(CONFIG.TICKET_PANEL_CHANNEL_ID) ||
      (await guild.channels.fetch(CONFIG.TICKET_PANEL_CHANNEL_ID).catch(() => null));
    if (panelChannel?.parentId) {
      return panelChannel.parentId;
    }
  }

  return null;
}

function buildTicketIntroEmbed(option, user) {
  const lines = [
    `Hola <@${user.id}> ??`,
    ...option.introLines,
    "",
    "Un miembro del staff te atenderá a la brevedad. Si necesitas cerrar el ticket, avisa cuando quedes conforme.",
  ];
  return applyShopBrand(
    new EmbedBuilder()
      .setColor(7602431)
      .setTitle(`Ticket abierto: ${option.menuLabel}`)
      .setDescription(lines.join("\n"))
      .setTimestamp()
  );
}

async function handleTicketOpen(interaction) {
  const optionId = interaction.customId.slice(TICKET_BUTTON_PREFIX.length);
  const option = SHOP_TICKET_OPTION_MAP.get(optionId);

  if (!option) {
    await interaction.reply({
      content: "Esta opción de ticket ya no está disponible.",
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.user.id;
  const now = Date.now();
  const lastUse = ticketCooldowns.get(userId) || 0;
  const remaining = CONFIG.TICKET_COOLDOWN_MS - (now - lastUse);

  if (remaining > 0) {
    const seconds = Math.ceil(remaining / 1000);
    await interaction.reply({
      content: `Espera ${seconds}s para abrir otro ticket.`,
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "No pude abrir el ticket en este servidor. Intenta de nuevo.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let existingChannels;
  try {
    existingChannels = await findExistingTicketChannels(guild, userId);
  } catch (error) {
    logger.error("[TICKETS] No se pudo listar tickets existentes:", error);
    await interaction.editReply({
      content: "No pude revisar tus tickets actuales. Inténtalo de nuevo más tarde.",
    });
    return;
  }

  const openChannels = existingChannels.filter((channel) => channel && !channel.deleted);
  if (openChannels.length >= CONFIG.TICKET_MAX_PER_USER) {
    const mentions = openChannels.map((channel) => `<#${channel.id}>`).join(", ");
    await interaction.editReply({
      content: `Ya tienes ${openChannels.length} ticket(s) abierto(s): ${mentions}. Cierra alguno antes de abrir otro.`,
    });
    return;
  }

  const staffRoleIds = CONFIG.TICKET_STAFF_ROLE_IDS.filter((roleId) =>
    guild.roles.cache.has(roleId)
  );

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.AddReactions,
      ],
    },
    ...staffRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];

  let parentId = null;
  try {
    parentId = await resolveTicketParentChannelId(guild);
  } catch (error) {
    logger.warn("[TICKETS] No se pudo resolver categoría de tickets:", error);
  }

  let ticketChannel;
  try {
    ticketChannel = await guild.channels.create({
      name: buildTicketChannelName(option, interaction.user),
      type: ChannelType.GuildText,
      parent: parentId ?? undefined,
      topic: `TICKET:${option.id}:${userId}`,
      permissionOverwrites: overwrites,
      reason: `Ticket (${option.menuLabel}) abierto por ${interaction.user.tag}`,
    });
  } catch (error) {
    logger.error("[TICKETS] Error creando el canal:", error);
    await interaction.editReply({
      content: "No pude crear el ticket. Contacta al staff para recibir ayuda.",
    });
    return;
  }

  const introEmbed = buildTicketIntroEmbed(option, interaction.user);
  const mentions = [`<@${userId}>`];
  if (staffRoleIds.length > 0) {
    mentions.push(...staffRoleIds.map((roleId) => `<@&${roleId}>`));
  }

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLOSE_BUTTON_ID)
      .setLabel("Cerrar ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("??")
  );

  try {
    await ticketChannel.send({
      content: mentions.join(" "),
      embeds: [introEmbed],
      components: [closeRow],
    });
  } catch (error) {
    logger.warn("[TICKETS] No se pudo enviar el mensaje inicial del ticket:", error);
  }

  ticketCooldowns.set(userId, now);

  await interaction.editReply({
    content: `Tu ticket se abrió en <#${ticketChannel.id}>. ¡Gracias por escribirnos!`,
  });
}
async function handleTicketClose(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;

  if (!channel || channel.type !== ChannelType.GuildText || !guild) {
    await interaction.reply({
      content: "Este boton solo funciona dentro de un ticket.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const info = parseTicketTopic(channel.topic);
  if (!info) {
    await interaction.reply({
      content: "No pude identificar los datos de este ticket. Contacta a un administrador.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  let member = interaction.member;
  if (!member) {
    try {
      member = await guild.members.fetch(interaction.user.id);
    } catch {
      member = null;
    }
  }

  const staffRoleIds = CONFIG.TICKET_STAFF_ROLE_IDS;
  const hasStaffRole = Boolean(member?.roles?.cache?.some((role) => staffRoleIds.includes(role.id)));
  const isAdmin = Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));

  if (!hasStaffRole && !isAdmin) {
    const embed = applyShopBrand(
      new EmbedBuilder()
        .setColor(0xff3366)
        .setTitle("Acceso denegado")
        .setDescription("Solo el staff de tickets o un administrador puede cerrar este ticket.")
    );
    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  try {
    const disabledRows = interaction.message.components.map((row) => {
      const actionRow = new ActionRowBuilder();
      for (const component of row.components) {
        const button = ButtonBuilder.from(component);
        if (button.data?.custom_id === TICKET_CLOSE_BUTTON_ID) {
          button.setDisabled(true).setLabel("Ticket cerrado");
        }
        actionRow.addComponents(button);
      }
      return actionRow;
    });
    if (disabledRows.length > 0) {
      await interaction.message.edit({ components: disabledRows });
    }
  } catch (error) {
    logger.warn("[TICKETS] No se pudo actualizar el mensaje del ticket:", error);
  }

  await interaction.reply({
    content: "Ticket cerrado. Este canal se eliminara en 10 segundos.",
    ephemeral: true,
  }).catch(() => {});

  await channel
    .send({
      content: "[LOCK] Ticket cerrado por " + interaction.user.toString() + ". El canal se eliminara en 10 segundos.",
    })
    .catch(() => {});

  setTimeout(() => {
    channel.delete(`Ticket cerrado por ${interaction.user.tag}`).catch(() => {});
  }, 10_000);
}

// ======== Event Listeners ========
bot.once("ready", () => {
  logger.info(`? Bot conectado como ${bot.user.tag}`);
  bot.user.setPresence({
    activities: [{ name: "nuevos miembros y reglas", type: ActivityType.Watching }],
    status: "online",
  });
  welcomeQueue.start();
});

// ======== Manejo de comandos con prefijo ========
bot.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const content = message.content?.trim();
  if (!content || !content.startsWith(COMMAND_PREFIX)) return;

  const withoutPrefix = content.slice(COMMAND_PREFIX.length).trim();
  if (!withoutPrefix) return;

  const [commandNameRaw, ...rawArgs] = withoutPrefix.split(/\s+/);
  if (!commandNameRaw) return;
  const commandName = commandNameRaw.toLowerCase();

  try {
    switch (commandName) {
      case "reglas":
        await handleReglasCommand(message);
        break;
      case "tickets":
        await handleTicketsCommand(message);
        break;
      case "warn":
        await handleWarnCommand(message, rawArgs);
        break;
      case "warns":
        await handleWarnsCommand(message, rawArgs);
        break;
      case "verbalwarn":
        await handleVerbalWarnCommand(message, rawArgs);
        break;
      case "evento":
        await handleEventoCommand(message, rawArgs);
        break;
      default:
        break;
    }
  } catch (error) {
    logger.error("[COMMAND] Error ejecutando comando:", error);
    try {
      await message.reply({
        content: "Ocurrió un error al ejecutar el comando. Intenta nuevamente.",
        allowedMentions: { repliedUser: false },
      });
    } catch {}
  }
}
);

async function handleReglasCommand(message) {
  if (!hasAdminAccess(message.member)) return;

  const reglasEmbed = buildRulesEmbed();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("menu_inquietudes")
    .setPlaceholder("Elige una pregunta de ayuda")
    .addOptions([
      { label: "¿Qué son los eventos?", value: "eventos" },
      { label: "¿Qué se puede hacer en el servidor?", value: "servidor" },
      { label: "¿Cómo verificarse?", value: "verificacion" },
    ]);

  const row = new ActionRowBuilder().addComponents(menu);

  const gifPath = resolveGifPath();
  const payload = buildEmbedPayload(reglasEmbed, gifPath, null, {
    components: [row],
  });

  const sent = await message.channel.send(payload);
  persistVerificationMessageId(sent.id);
  await sent.react("?");
}

async function handleTicketsCommand(message) {
  if (!hasAdminAccess(message.member)) return;

  const panelEmbed = buildTicketPanelEmbed();
  const menu = new StringSelectMenuBuilder()
    .setCustomId(TICKET_INFO_MENU_ID)
    .setPlaceholder("Selecciona el servicio que necesitas")
    .addOptions(
      SHOP_TICKET_OPTIONS.map((option) => {
        const optionData = {
          label: option.menuLabel,
          value: option.id,
        };
        if (option.menuDescription) {
          optionData.description = option.menuDescription.slice(0, 100);
        }
        if (option.emoji) {
          optionData.emoji = option.emoji;
        }
        return optionData;
      })
    );

  const row = new ActionRowBuilder().addComponents(menu);

  let targetChannel = message.channel;
  if (CONFIG.TICKET_PANEL_CHANNEL_ID) {
    const fetched = await message.guild.channels
      .fetch(CONFIG.TICKET_PANEL_CHANNEL_ID)
      .catch(() => null);

    if (fetched && typeof fetched.isTextBased === "function" && fetched.isTextBased()) {
      targetChannel = fetched;
    } else {
      await message.reply({
        content: "No pude encontrar el canal configurado para el panel de tickets.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
  }

  await targetChannel.send({ embeds: [panelEmbed], components: [row] });

  if (targetChannel.id !== message.channel.id) {
    await message.reply({
      content: `Panel de tickets publicado en <#${targetChannel.id}>.`,
      allowedMentions: { repliedUser: false },
    });
  }
}

async function handleWarnCommand(message, args) {
  if (!hasModeratorAccess(message.member)) {
    await message.reply({
      content: "Necesitas permisos de moderación para usar este comando.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const { member: targetMember, remaining } = await resolveMemberFromArgs(message, args);

  if (!targetMember) {
    await message.reply({
      content: "No pude identificar al usuario. Usa `!warn @usuario <razón>`.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (targetMember.id === message.author.id) {
    await message.reply({
      content: "No puedes advertirte a ti mismo.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (targetMember.user.bot) {
    await message.reply({
      content: "No puedes advertir a un bot.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const reasonText = Array.isArray(remaining) ? remaining.join(' ').trim() : '';
  if (!reasonText) {
    await message.reply({
      content: "Debes indicar una razón. Formato: `!warn @usuario <razón>`.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const cleanReason = reasonText.slice(0, WARN_REASON_MAX_LENGTH);

  let record;
  try {
    record = await insertWarnRecord({
      guildId: message.guild.id,
      userId: targetMember.id,
      moderatorId: message.author.id,
      reason: cleanReason,
      contextUrl: message.url,
    });
  } catch (error) {
    logger.error("[WARN] Error guardando warn:", error);
    await message.reply({
      content: "No pude registrar el warn en la base de datos. Intenta más tarde.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const warnEmbed = new EmbedBuilder()
    .setColor(CONFIG.WARN_EMBED_COLOR)
    .setTitle("Advertencia registrada")
    .setDescription(`Se registró un warn para ${targetMember}.`)
    .addFields(
      { name: "Usuario", value: `${targetMember} - ${targetMember.user.tag}`, inline: true },
      { name: "Moderador", value: `${message.author} - ${message.author.tag}`, inline: true },
      { name: "Razón", value: cleanReason.slice(0, 1024) },
      { name: "Warns totales", value: `${record.totalWarns}`, inline: true }
    )
    .setFooter({ text: `ID de warn: ${record.warnId}`, iconURL: CONFIG.BRAND_ICON })
    .setTimestamp();

  if (message.url) {
    warnEmbed.addFields({ name: "Contexto", value: `[Ver mensaje](${message.url})` });
  }

  const gifPath = resolveGifPath();
  const channelPayload = buildEmbedPayload(warnEmbed, gifPath, CONFIG.WARN_GIF_URL, {
    allowedMentions: { repliedUser: false },
  });
  await message.reply(channelPayload);

  const dmEmbed = new EmbedBuilder()
    .setColor(CONFIG.WARN_EMBED_COLOR)
    .setTitle("Has recibido una advertencia")
    .setDescription(
      [
        `Servidor: **${message.guild.name}**`,
        `Moderador: ${message.author.tag}`,
        `Warn #: ${record.totalWarns}`,
        '',
        `**Razón:** ${cleanReason}`,
      ].join('\n')
    )
    .setFooter({ text: message.guild.name, iconURL: CONFIG.BRAND_ICON })
    .setTimestamp();

  const dmPayload = buildEmbedPayload(dmEmbed, gifPath, CONFIG.WARN_GIF_URL);
  try {
    await targetMember.send(dmPayload);
  } catch (error) {
    logger.warn(`[WARN] No se pudo enviar el DM a ${targetMember.user.tag}:`, error?.message || error);
  }
}

async function handleWarnsCommand(message, args) {
  if (!hasModeratorAccess(message.member)) {
    await message.reply({
      content: "Necesitas permisos de moderación para usar este comando.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const { member: targetMember } = await resolveMemberFromArgs(message, args);
  if (!targetMember) {
    await message.reply({
      content: "No pude identificar al usuario. Usa `!warns @usuario`.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  let totals;
  let history;
  try {
    totals = await fetchWarnTotals(message.guild.id, targetMember.id);
    history = await fetchWarnHistory(message.guild.id, targetMember.id, CONFIG.WARN_HISTORY_PAGE_SIZE);
  } catch (error) {
    logger.error("[WARN] Error consultando historial:", error);
    await message.reply({
      content: "No pude consultar el historial de warns. Intenta nuevamente.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (!totals.totalWarns) {
    await message.reply({
      content: `${targetMember} no tiene warns registrados.`,
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const lines = history.map((warn, index) => {
    const number = totals.totalWarns - index;
    const timestamp = toDiscordTimestamp(parseSqlDate(warn.created_at));
    const reason = warn.reason?.slice(0, 1800) || 'Sin razón registrada.';
    const parts = [
      `**#${number}** - <t:${timestamp}:f>`,
      `Moderador: <@${warn.moderator_id}>`,
    ];
    if (warn.points && warn.points !== 1) {
      parts.push(`Puntos: ${warn.points}`);
    }
    parts.push(`Razón: ${reason}`);
    return parts.join('\n');
  });

  const historyEmbed = new EmbedBuilder()
    .setColor(CONFIG.WARN_EMBED_COLOR)
    .setAuthor({
      name: targetMember.user.tag,
      iconURL: targetMember.user.displayAvatarURL({ size: 128 }),
    })
    .setTitle(`Historial de warns (${totals.totalWarns})`)
    .setDescription(lines.join('\n\n'))
    .setFooter({
      text: `Puntos acumulados: ${totals.totalPoints} - Mostrando ${history.length} registro(s)`,
      iconURL: CONFIG.BRAND_ICON,
    })
    .setTimestamp();

  const gifPath = resolveGifPath();
  const payload = buildEmbedPayload(historyEmbed, gifPath, CONFIG.WARN_GIF_URL, {
    allowedMentions: { repliedUser: false },
  });
  await message.reply(payload);
}

async function handleVerbalWarnCommand(message, args) {
  if (!hasModeratorAccess(message.member)) {
    await message.reply({
      content: "Necesitas permisos de moderación para usar este comando.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const { member: targetMember, remaining } = await resolveMemberFromArgs(message, args);
  if (!targetMember) {
    await message.reply({
      content: "No pude identificar al usuario. Usa `!verbalwarn @usuario <mensaje>`.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  if (targetMember.user.bot) {
    await message.reply({
      content: "No puedes enviar advertencias a un bot.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const reasonText = Array.isArray(remaining) ? remaining.join(' ').trim() : '';
  if (!reasonText) {
    await message.reply({
      content: "Debes escribir el mensaje de la advertencia verbal.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const cleanReason = reasonText.slice(0, WARN_REASON_MAX_LENGTH);

  const verbalEmbed = new EmbedBuilder()
    .setColor(CONFIG.WARN_EMBED_COLOR)
    .setTitle("Advertencia verbal")
    .setDescription(`${targetMember}, has recibido una advertencia verbal.`)
    .addFields(
      { name: "Moderador", value: `${message.author} - ${message.author.tag}`, inline: true },
      { name: "Mensaje", value: cleanReason.slice(0, 1024) }
    )
    .setFooter({
      text: `${message.guild.name} - No se registró en historial`,
      iconURL: CONFIG.BRAND_ICON,
    })
    .setTimestamp();

  const gifPath = resolveGifPath();
  const payload = buildEmbedPayload(verbalEmbed, gifPath, CONFIG.VERBAL_WARN_GIF_URL, {
    allowedMentions: { repliedUser: false },
  });
  await message.reply(payload);

  const dmEmbed = new EmbedBuilder()
    .setColor(CONFIG.WARN_EMBED_COLOR)
    .setTitle("Advertencia verbal")
    .setDescription(
      [
        `Servidor: **${message.guild.name}**`,
        `Moderador: ${message.author.tag}`,
        '',
        `**Mensaje:** ${cleanReason}`,
      ].join('\n')
    )
    .setFooter({ text: message.guild.name, iconURL: CONFIG.BRAND_ICON })
    .setTimestamp();

  const dmPayload = buildEmbedPayload(dmEmbed, gifPath, CONFIG.VERBAL_WARN_GIF_URL);
  try {
    await targetMember.send(dmPayload);
  } catch (error) {
    logger.warn(`[WARN] No se pudo enviar el DM verbal a ${targetMember.user.tag}:`, error?.message || error);
  }
}

const EVENT_EMBED_TEMPLATE = {
  title: "EVENTO DE MENSAJES : <:79071starrymoon:1417433441825325147>",
  description: "El servidor está por cumplir 2 semanas desde su creación ?? ...",
  color: 7602431,
  footer: {
    text: "Es obligatorio que sigas las instrucciones...",
    iconURL: "https://cdn.discordapp.com/attachments/1415232274156228620/1417752136342573176/IMG_2716.jpg",
  },
  author: {
    name: ".gg/dedos",
    url: "https://discord.gg/dedos",
    iconURL: "https://cdn.discordapp.com/attachments/1415232274156228620/1417752136342573176/IMG_2716.jpg",
  },
  image: {
    url: "https://message.style/cdn/images/b6b34048e6b8e4f2d6931af81a6935dbeb06d1d1a619dcf353733ab75bbcca8c.gif",
  },
  fields: [
    { name: "Primer Lugar", value: "1000 Robux <:9073robux:1417021867167846420>", inline: true },
    { name: "Segundo Lugar", value: "500 Robux <:9073robux:1417021867167846420>", inline: true },
    { name: "Tercer Lugar", value: "200 Robux <:9073robux:1417021867167846420>", inline: true },
  ],
};

async function handleEventoCommand(message, _args) {
  const member = message.member;
  const hasPermission =
    hasAdminAccess(member) || member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);

  if (!hasPermission) {
    await message.reply({
      content: "Necesitas permisos de administración para publicar eventos.",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  let targetChannel = message.channel;
  if (CONFIG.EVENTS_CHANNEL_ID) {
    const fetched = await message.guild.channels
      .fetch(CONFIG.EVENTS_CHANNEL_ID)
      .catch(() => null);
    if (fetched && typeof fetched.isTextBased === "function" && fetched.isTextBased()) {
      targetChannel = fetched;
    } else {
      await message.reply({
        content: "No pude encontrar el canal configurado para eventos.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
  }

  const gifPath = resolveGifPath();
  const embed = buildEventoEmbed({ joinedUserIds: [], useAttachment: Boolean(gifPath) });
  const button = new ButtonBuilder()
    .setCustomId(EVENT_JOIN_BUTTON_ID)
    .setLabel(CONFIG.EVENT_BUTTON_LABEL || "Unirme al evento")
    .setStyle(ButtonStyle.Success);
  const row = new ActionRowBuilder().addComponents(button);

  const payload = buildEmbedPayload(embed, gifPath, EVENT_EMBED_TEMPLATE.image?.url, {
    components: [row],
  });

  const sent = await targetChannel.send(payload);

  eventMessageState.set(sent.id, {
    joinedIds: new Set(),
    useAttachment: Boolean(gifPath),
  });

  if (targetChannel.id !== message.channel.id) {
    await message.reply({
      content: `Evento publicado en <#${targetChannel.id}>.`,
      allowedMentions: { repliedUser: false },
    });
  }
}

function buildEventoEmbed({ joinedUserIds = [], useAttachment = false } = {}) {
  const embed = new EmbedBuilder()
    .setTitle(EVENT_EMBED_TEMPLATE.title)
    .setColor(EVENT_EMBED_TEMPLATE.color)
    .setDescription(EVENT_EMBED_TEMPLATE.description)
    .setFooter(EVENT_EMBED_TEMPLATE.footer)
    .setAuthor(EVENT_EMBED_TEMPLATE.author)
    .addFields(...EVENT_EMBED_TEMPLATE.fields)
    .setTimestamp();

  if (useAttachment) {
    embed.setImage(`attachment://${EMBED_GIF_FILENAME}`);
  } else if (EVENT_EMBED_TEMPLATE.image?.url) {
    embed.setImage(EVENT_EMBED_TEMPLATE.image.url);
  }

  const uniqueIds = Array.from(new Set(joinedUserIds));
  if (uniqueIds.length) {
    const mentions = uniqueIds.slice(0, 20).map((id) => `<@${id}>`);
    let value = mentions.join('\n');
    if (uniqueIds.length > mentions.length) {
      value += `\n... y ${uniqueIds.length - mentions.length} más`;
    }
    embed.addFields({ name: `Participantes (${uniqueIds.length})`, value });
  }

  return embed;
}

function extractParticipantIdsFromEmbed(embed) {
  if (!embed || !Array.isArray(embed.fields)) return [];
  const participantField = embed.fields.find((field) =>
    typeof field?.name === 'string' && field.name.startsWith('Participantes')
  );
  if (!participantField?.value) return [];
  return Array.from(participantField.value.matchAll(/<@!?(\d+)>/g)).map((match) => match[1]);
}

function getEventStateForMessage(message) {
  let state = eventMessageState.get(message.id);
  if (!state) {
    const embed = message.embeds?.[0];
    const joinedIds = new Set(extractParticipantIdsFromEmbed(embed));
    const usesAttachment =
      Boolean(
        embed?.image?.url && embed.image.url.startsWith(`attachment://${EMBED_GIF_FILENAME}`)
      ) || Boolean(message.attachments?.some?.((attachment) => attachment.name === EMBED_GIF_FILENAME));

    state = { joinedIds, useAttachment: usesAttachment };
    eventMessageState.set(message.id, state);
  }
  return state;
}

async function handleEventJoin(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: 'No pude procesar la acción fuera del servidor.',
      ephemeral: true,
    });
    return;
  }

const buildReminderKey = (guildId, userId) => `${guildId}:${userId}`;

async function getEventReminderState(guildId, userId) {
  const key = buildReminderKey(guildId, userId);
  let state = eventReminderState.get(key);

  if (!state) {
    state = {
      messageCount: 0,
      lastRemindedAt: null,
      optedOut: false,
      loaded: false,
      loading: null,
      sending: false,
    };
    eventReminderState.set(key, state);
  }

  if (!state.loaded) {
    if (!state.loading) {
      state.loading = (async () => {
        try {
          const [[row]] = await dbPool.execute(
            `SELECT last_reminded_at, opted_out_at FROM event_reminders WHERE guild_id = ? AND user_id = ?`,
            [guildId, userId]
          );
          if (row) {
            state.lastRemindedAt = row.last_reminded_at ? parseSqlDate(row.last_reminded_at) : null;
            state.optedOut = Boolean(row.opted_out_at);
          }
        } catch (error) {
          logger.error(`[REMINDER] Error cargando estado para ${guildId}/${userId}: ${error?.message || error}`);
        } finally {
          state.loaded = true;
          state.loading = null;
        }
      })();
    }

    if (state.loading) {
      await state.loading.catch(() => {});
    }
  }

  return state;
}

async function markEventReminderSent(guildId, userId) {
  try {
    await dbPool.execute(
      `INSERT INTO event_reminders (guild_id, user_id, last_reminded_at, opted_out_at)
       VALUES (?, ?, NOW(), NULL)
       ON DUPLICATE KEY UPDATE last_reminded_at = VALUES(last_reminded_at), opted_out_at = NULL`,
      [guildId, userId]
    );
  } catch (error) {
    logger.error(`[REMINDER] Error actualizando recordatorio en la base de datos para ${guildId}/${userId}: ${error?.message || error}`);
  }
}

async function markEventReminderOptOut(guildId, userId) {
  try {
    await dbPool.execute(
      `INSERT INTO event_reminders (guild_id, user_id, last_reminded_at, opted_out_at)
       VALUES (?, ?, NULL, NOW())
       ON DUPLICATE KEY UPDATE opted_out_at = VALUES(opted_out_at)`,
      [guildId, userId]
    );
  } catch (error) {
    logger.error(`[REMINDER] Error almacenando opt-out para ${guildId}/${userId}: ${error?.message || error}`);
    throw error;
  }
}

function buildEventReminderEmbed({ guild, member }) {
  const eventChannelMention = CONFIG.EVENTS_CHANNEL_ID ? `<#${CONFIG.EVENTS_CHANNEL_ID}>` : 'el canal de eventos';
  const descriptionLines = [
    `Hola, ${member}, te recordamos que ${guild.name} siempre tiene eventos activos donde puedes ganar premios.`,
    `Parece que aun no te has unido, que esperas para visitar ${eventChannelMention}?`,
    'Si no te interesa el evento puedes tocar el boton de abajo.',
  ];

  return new EmbedBuilder()
    .setTitle('Recordatorio')
    .setDescription(descriptionLines.join('\n\n'))
    .setColor(EVENT_EMBED_TEMPLATE.color || CONFIG.WARN_EMBED_COLOR || 0x5000ab)
    .setAuthor({
      name: '.gg/dedos',
      url: CONFIG.GUILD_URL,
      iconURL: CONFIG.EVENT_BRAND_ICON || CONFIG.BRAND_ICON,
    })
    .setFooter({
      text: 'No olvides unirte a los eventos e invitar a tus amigos',
      iconURL: CONFIG.EVENT_BRAND_ICON || CONFIG.BRAND_ICON,
    })
    .setTimestamp();
}

async function handleEventReminderMessage(message) {
  try {
    if (!message.guild || message.author.bot) return;
    if (!CONFIG.EVENT_REMINDER_CHANNEL_IDS.length) {
      if (!reminderChannelWarningLogged) {
        logger.warn('[REMINDER] EVENT_REMINDER_CHANNEL_IDS no esta configurado. El sistema de recordatorios esta inactivo.');
        reminderChannelWarningLogged = true;
      }
      return;
    }

    if (!CONFIG.EVENT_ROLE_ID) {
      if (!reminderRoleWarningLogged) {
        logger.warn('[REMINDER] EVENT_ROLE_ID no esta configurado. El sistema de recordatorios esta inactivo.');
        reminderRoleWarningLogged = true;
      }
      return;
    }

    if (!CONFIG.EVENT_REMINDER_CHANNEL_IDS.includes(message.channel.id)) {
      return;
    }

    const guildId = message.guild.id;
    const userId = message.author.id;

    let member = message.member;
    if (!member) {
      try {
        member = await message.guild.members.fetch(userId);
      } catch {
        logger.warn(`[REMINDER] No se pudo obtener al miembro ${userId} para procesar recordatorio.`);
        return;
      }
    }

    if (member.roles.cache.has(CONFIG.EVENT_ROLE_ID)) {
      eventReminderState.delete(buildReminderKey(guildId, userId));
      return;
    }

    const state = await getEventReminderState(guildId, userId);
    if (state.optedOut) {
      logger.info(`[REMINDER] ${member.user.tag} desactivo los recordatorios. Se omite.`);
      return;
    }

    state.messageCount += 1;
    logger.info(`[REMINDER] ${member.user.tag} mensaje ${state.messageCount}/${CONFIG.EVENT_REMINDER_MESSAGE_THRESHOLD} en #${message.channel.name || message.channel.id}.`);

    if (state.messageCount < CONFIG.EVENT_REMINDER_MESSAGE_THRESHOLD) {
      return;
    }

    const now = Date.now();
    const lastReminder = state.lastRemindedAt ? state.lastRemindedAt.getTime() : 0;
    const cooldownMs = CONFIG.EVENT_REMINDER_COOLDOWN_MS;

    if (cooldownMs > 0 && now - lastReminder < cooldownMs) {
      const remainingMs = cooldownMs - (now - lastReminder);
      logger.info(`[REMINDER] ${member.user.tag} aun esta en cooldown (${Math.ceil(remainingMs / 1000)}s).`);
      return;
    }

    if (state.sending) {
      logger.debug(`[REMINDER] ${member.user.tag} ya tiene un recordatorio en progreso. Se omite.`);
      return;
    }

    state.sending = true;

    try {
      state.messageCount = 0;
      state.lastRemindedAt = new Date(now);
      await markEventReminderSent(guildId, userId);

      const embed = buildEventReminderEmbed({ guild: message.guild, member });
      const gifPath = resolveGifPath();
      const joinButton = new ButtonBuilder()
        .setCustomId(EVENT_JOIN_BUTTON_ID)
        .setStyle(ButtonStyle.Success)
        .setLabel(CONFIG.EVENT_REMINDER_JOIN_LABEL || CONFIG.EVENT_BUTTON_LABEL || 'Ir al evento');
      const stopButton = new ButtonBuilder()
        .setCustomId(EVENT_REMINDER_STOP_BUTTON_ID)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(CONFIG.EVENT_REMINDER_STOP_LABEL || 'No volver a recordar');
      const row = new ActionRowBuilder().addComponents(joinButton, stopButton);

      const payload = buildEmbedPayload(embed, gifPath, CONFIG.EVENT_REMINDER_GIF_URL, {
        content: message.author.toString(),
        components: [row],
        allowedMentions: { users: [message.author.id], roles: [] },
      });

      await message.channel.send(payload);
      logger.info(`[REMINDER] Recordatorio enviado a ${member.user.tag} en #${message.channel.name || message.channel.id}.`);
    } catch (error) {
      logger.error(`[REMINDER] Error enviando recordatorio a ${member.user.tag}: ${error?.message || error}`);
    } finally {
      state.sending = false;
    }
  } catch (error) {
    logger.error(`[REMINDER] Error procesando mensaje para recordatorio: ${error?.message || error}`);
  }
}

async function handleEventReminderStop(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'No pude identificar el servidor.', ephemeral: true }).catch(() => {});
    return;
  }

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const key = buildReminderKey(guildId, userId);
  const state = await getEventReminderState(guildId, userId);

  if (state.optedOut) {
    const message = 'Ya no recibiras recordatorios de eventos.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
    return;
  }

  try {
    await markEventReminderOptOut(guildId, userId);
    state.optedOut = true;
    state.messageCount = 0;
    eventReminderState.set(key, state);
    logger.info(`[REMINDER] ${interaction.user.tag} desactivo los recordatorios de eventos.`);

    const message = 'Listo, no volveras a recibir recordatorios.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  } catch (error) {
    logger.error(`[REMINDER] Error al procesar opt-out para ${interaction.user.tag}: ${error?.message || error}`);
    const message = 'No pude actualizar tus recordatorios. Intenta mas tarde.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
}
  const roleId = CONFIG.EVENT_ROLE_ID;
  if (!roleId) {
    await interaction.reply({
      content: 'No hay un rol configurado para el evento.',
      ephemeral: true,
    });
    return;
  }

  let member = interaction.member;
  if (!member || typeof member.roles?.add !== 'function') {
    member = await guild.members.fetch(interaction.user.id).catch(() => null);
  }

  if (!member) {
    await interaction.reply({
      content: 'No pude obtener tu información de miembro.',
      ephemeral: true,
    });
    return;
  }

  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    await interaction.reply({
      content: 'El rol del evento no existe. Contacta a un administrador.',
      ephemeral: true,
    });
    return;
  }

  const alreadyHasRole = member.roles.cache.has(roleId);
  if (!alreadyHasRole) {
    try {
      await member.roles.add(roleId, `Evento: unión por botón (${interaction.user.tag})`);
    } catch (error) {
      logger.error('[EVENT] No se pudo asignar el rol del evento:', error);
      await interaction.reply({
        content: 'No pude asignarte el rol del evento. Intenta de nuevo más tarde.',
        ephemeral: true,
      });
      return;
    }
  }

  const state = getEventStateForMessage(interaction.message);
  state.joinedIds.add(interaction.user.id);

  const updatedEmbed = buildEventoEmbed({
    joinedUserIds: Array.from(state.joinedIds),
    useAttachment: state.useAttachment,
  });

  try {
    await interaction.message.edit({ embeds: [updatedEmbed] });
  } catch (error) {
    logger.warn('[EVENT] No se pudo actualizar el mensaje del evento:', error);
  }

  const response = alreadyHasRole
    ? 'Ya estabas inscrito en el evento. ¡Nos vemos ahí!'
    : 'Te uniste al evento y recibiste el rol.';

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: response, ephemeral: true });
  } else {
    await interaction.reply({ content: response, ephemeral: true });
  }
}


// ======== Verificación por reacción ========

bot.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (reaction.partial) {
      await reaction.fetch();
    }
  } catch (error) {
    logger.error("[VERIFY] No se pudo recuperar la reacción:", error);
    return;
  }

  if (user.bot) return;

  const emojiMatches = reaction.emoji?.name === "?";
  const channelMatches = reaction.message?.channel?.id === CONFIG.VERIFICATION_CHANNEL_ID;
  const messageMatches =
    !verificationMessageId || reaction.message.id === verificationMessageId;

  if (!emojiMatches || !channelMatches || !messageMatches) return;

  const guild = reaction.message.guild;
  if (!guild) return;

  let member;
  try {
    member = await guild.members.fetch(user.id);
  } catch (error) {
    logger.error(`[VERIFY] No se pudo obtener al miembro ${user.id}:`, error);
    return;
  }

  if (member.roles.cache.has(CONFIG.ROLE_ID)) {
    if (CONFIG.SHOW_DEBUG) {
      logger.info(`[VERIFY] ${user.tag} ya estaba verificado.`);
    }
    return;
  }

  try {
    await member.roles.add(CONFIG.ROLE_ID);
    logger.info(`[VERIFY] Rol asignado a ${user.tag}.`);
  } catch (error) {
    logger.error(`[VERIFY] Error asignando rol a ${user.tag}:`, error);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5000ab)
    .setTitle("? ¡Verificación completada!")
    .setDescription([
      `¡Gracias por verificarte, <@${member.id}>!`,
      "Ya tienes acceso completo al servidor.",
      `Si necesitas ayuda, visita ${CONFIG.HELP_URL}.`,
    ].join("\n"))
    .setFooter({ text: `Bienvenido a ${CONFIG.GUILD_URL}`, iconURL: CONFIG.BRAND_ICON })
    .setTimestamp();

  const gifPath = resolveGifPath();
  const payload = { embeds: [embed], content: CONFIG.GUILD_URL };

  if (gifPath) {
    embed.setImage("attachment://dedosgif.gif");
    payload.files = [{ attachment: gifPath, name: "dedosgif.gif" }];
  }

  try {
    await user.send(payload);
  } catch (error) {
    logger.warn(`[VERIFY] No pude enviar el DM a ${user.tag}:`, error?.message || error);
  }
});

// ======== Menú de ayuda ========
bot.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "menu_inquietudes") {
        const selection = interaction.values[0];
        let embed;

        if (selection === "eventos") {
          embed = new EmbedBuilder()
            .setTitle("Eventos y premios")
            .setDescription(
              "Los eventos son dinámicas especiales que premian a los usuarios más activos del servidor.\n\n" +
                "**Siempre hay eventos en curso.**\n\n" +
                "Para ver los eventos actuales:\n" +
                "- Revisa el canal de anuncios (desbloqueado tras verificarte).\n" +
                "- Encontrarás toda la información: reglas, fechas, cómo participar y premios."
            )
            .setColor(0x5000ab);
        }

        if (selection === "servidor") {
          embed = new EmbedBuilder()
            .setTitle("¿Qué puedo hacer en el servidor?")
            .setDescription(
              "Estas son las principales actividades dentro del servidor:\n\n" +
                "- Participa en eventos y gana recompensas por tu actividad.\n" +
                "- Usa nuestro middleman oficial sin propinas obligatorias.\n" +
                "- Compra en la tienda con los mejores precios del mercado.\n" +
                "- Convive, tradea y aporta sugerencias para seguir creciendo."
            )
            .setColor(0x5000ab);
        }

        if (selection === "verificacion") {
          const enlace = verificationMessageId
            ? `https://discord.com/channels/${interaction.guild?.id}/${CONFIG.VERIFICATION_CHANNEL_ID}/${verificationMessageId}`
            : "el mensaje de verificación (usa !reglas para volver a generarlo)";

          embed = new EmbedBuilder()
            .setTitle("Verificación")
            .setDescription(`Para verificarte, reacciona con la ? en ${enlace}.`)
            .setColor(0x5000ab);
        }

        if (!embed) {
          await interaction.reply({ content: "No pude encontrar información para esa opción.", ephemeral: true });
          return;
        }

        const gifPath = resolveGifPath();
        if (gifPath) {
          embed.setImage("attachment://dedosgif.gif");
        }

        const replyPayload = {
          embeds: [embed],
          content: "discord.gg/dedos",
          ephemeral: true,
        };
        if (gifPath) {
          replyPayload.files = [{ attachment: gifPath, name: "dedosgif.gif" }];
        }

        await interaction.reply(replyPayload);
        return;
      }

      if (interaction.customId === TICKET_INFO_MENU_ID) {
        const optionId = interaction.values[0];
        const option = SHOP_TICKET_OPTION_MAP.get(optionId);
        if (!option) {
          await interaction.reply({
            content: "Esta opción ya no está disponible.",
            ephemeral: true,
          });
          return;
        }

        const embed = option.embedBuilder();
        const button = new ButtonBuilder()
          .setCustomId(`${TICKET_BUTTON_PREFIX}${option.id}`)
          .setLabel("Abrir ticket")
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true,
        });
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === EVENT_JOIN_BUTTON_ID) {
        await handleEventJoin(interaction);
        return;
      }
      if (interaction.customId.startsWith(TICKET_BUTTON_PREFIX)) {
        await handleTicketOpen(interaction);
        return;
      }
      if (interaction.customId === TICKET_CLOSE_BUTTON_ID) {
        await handleTicketClose(interaction);
        return;
      }
    }
  } catch (error) {
    logger.error("[INTERACTION] Error manejando interacción:", error);
    if (interaction.isRepliable()) {
      try {
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({ content: "Ocurrió un error al procesar la interacción." });
        } else if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "Ocurrió un error al procesar la interacción.",
            ephemeral: true,
          });
        }
      } catch (replyError) {
        logger.warn("[INTERACTION] No se pudo responder al error:", replyError);
      }
    }
  }
});

// ======== Bienvenidas por DM ========
bot.on("guildMemberAdd", (member) => {
  const queued = welcomeQueue.push(async () => {
    const embed = buildWelcomeEmbed(member);

    // Botones con enlaces
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Servidor").setURL(CONFIG.GUILD_URL),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Verificación")
        .setURL(`https://discord.com/channels/${member.guild.id}/${CONFIG.VERIFICATION_CHANNEL_ID}`),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Invitación")
        .setURL(`https://discord.com/channels/${member.guild.id}/${CONFIG.INVITE_CHANNEL_ID}`),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Ayuda").setURL(CONFIG.HELP_URL)
    );

    // Detectar GIF
    const gifPath = resolveGifPath();
    if (gifPath) {
      embed.setImage("attachment://dedosgif.gif");
    }

    const payload = { content: CONFIG.GUILD_URL, embeds: [embed], components: [row] };
    if (gifPath) payload.files = [{ attachment: gifPath, name: "dedosgif.gif" }];

    try {
      await member.send(payload);
      if (CONFIG.SHOW_DEBUG) logger.info(`??  DM enviado a ${member.user.tag}`);
    } catch (err) {
      const code = err?.code || err?.name || "ERR";
      logger.warn(`??  No se pudo enviar DM a ${member.user.tag} [${code}]`);
    }
  });

  if (!queued) {
    // Si la cola está saturada, evitamos presión adicional.
    logger.warn(`? Cola saturada. DM omitido para ${member.user.tag}`);
  }
});

// ======== Manejo de errores ========
bot.on("error", (e) => logger.error("[CLIENT] Error:", e));
bot.on("warn", (m) => CONFIG.SHOW_DEBUG && logger.warn("[CLIENT] Warn:", m));
bot.on("shardError", (e, id) => logger.error(`[SHARD ${id}] Error:`, e));

// ======== Manejo global de errores (fail-fast + reinicio por supervisor) ========
let shuttingDown = false;
async function shutdown(code = 1) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    welcomeQueue.stop();
    await bot.destroy();
    await dbPool.end().catch(() => {});
  } catch {}
  finally {
    // Salimos para que el supervisor (PM2/NSSM) reinicie
    process.exit(code);
  }
}

process.on("unhandledRejection", (reason) => {
  logger.error("[FATAL] Promesa no manejada:", reason);
  shutdown(1);
});
process.on("uncaughtException", (err) => {
  logger.error("[FATAL] Excepción no capturada:", err);
  shutdown(1);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ======== Login con reintentos exponenciales ========
async function loginWithRetry(token) {
  const maxAttempts = Math.max(1, parseInt(process.env.LOGIN_MAX_ATTEMPTS || "6", 10));
  let delay = Math.max(1000, parseInt(process.env.LOGIN_RETRY_MS || "5000", 10));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await bot.login(token);
      return; // listo
    } catch (err) {
      const msg = String(err?.message || err);
      // Token inválido: terminar sin reintentos
      if (/invalid.*token/i.test(msg) || /401/.test(msg)) {
        logger.error("[FATAL] TOKEN inválido. Saliendo.");
        return shutdown(1);
      }
      logger.warn(`Login falló (intento ${attempt}/${maxAttempts}): ${msg}`);
      if (attempt === maxAttempts) {
        logger.error("[FATAL] No se pudo iniciar sesión tras múltiples intentos.");
        return shutdown(1);
      }
      await sleep(delay);
      delay = Math.min(delay * 2, 60_000); // tope 60s
    }
  }
}

loginWithRetry(process.env.TOKEN);













