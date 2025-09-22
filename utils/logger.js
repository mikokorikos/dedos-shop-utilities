import { CONFIG } from '../config/config.js';

const LEVELS = ['error', 'warn', 'info', 'debug'];
const levelIndex = Math.max(0, LEVELS.indexOf(CONFIG.LOG_LEVEL));

const logAt = (targetLevel, prefix, args) => {
  if (LEVELS.indexOf(targetLevel) <= levelIndex) {
    // eslint-disable-next-line no-console
    console[targetLevel === 'debug' ? 'log' : targetLevel](prefix, ...args);
  }
};

export const logger = {
  flow: (...args) => logAt('info', '[FLOW]', args),
  info: (...args) => logAt('info', '[INFO]', args),
  warn: (...args) => logAt('warn', '[WARN]', args),
  error: (...args) => logAt('error', '[ERROR]', args),
  debug: (...args) => logAt('debug', '[DEBUG]', args),
};
