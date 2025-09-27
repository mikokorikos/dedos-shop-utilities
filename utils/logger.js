import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from '../config/config.js';

const LEVELS = ['error', 'warn', 'info', 'debug'];
const levelIndex = Math.max(0, LEVELS.indexOf(CONFIG.LOG_LEVEL));

const logFilePath = CONFIG.LOG_FILE_PATH ? resolve(process.cwd(), CONFIG.LOG_FILE_PATH) : null;
let fileStream = null;

if (logFilePath) {
  try {
    fileStream = createWriteStream(logFilePath, { flags: 'a' });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[LOGGER] No se pudo inicializar archivo de logs', error);
  }
}

if (fileStream) {
  process.on('exit', () => {
    try {
      fileStream?.end();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LOGGER] No se pudo cerrar archivo de logs', error);
    }
  });
}

function formatArg(arg) {
  if (arg instanceof Error) {
    const stack = arg.stack ? `\n${arg.stack}` : '';
    return `${arg.name}: ${arg.message}${stack}`;
  }
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch (error) {
      return `[object error serializing: ${error.message}]`;
    }
  }
  if (arg === undefined) {
    return 'undefined';
  }
  return String(arg);
}

function appendToFile(level, prefix, args) {
  if (!fileStream) {
    return;
  }
  const formatted = args.map(formatArg).join(' ');
  const line = `${new Date().toISOString()} ${prefix} ${formatted}`.trimEnd();
  try {
    fileStream.write(`${line}\n`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[LOGGER] No se pudo escribir en archivo de logs', error);
  }
}

const logAt = (targetLevel, prefix, args) => {
  if (LEVELS.indexOf(targetLevel) <= levelIndex) {
    // eslint-disable-next-line no-console
    console[targetLevel === 'debug' ? 'log' : targetLevel](prefix, ...args);
    appendToFile(targetLevel, prefix, args);
  }
};

export const logger = {
  flow: (...args) => logAt('info', '[FLOW]', args),
  info: (...args) => logAt('info', '[INFO]', args),
  warn: (...args) => logAt('warn', '[WARN]', args),
  error: (...args) => logAt('error', '[ERROR]', args),
  debug: (...args) => logAt('debug', '[DEBUG]', args),
};
