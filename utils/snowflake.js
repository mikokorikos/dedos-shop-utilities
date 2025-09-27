import { logger } from './logger.js';

const SNOWFLAKE_REGEX = /^\d{1,20}$/;

function formatLabel(label) {
  return label ?? 'snowflake';
}

export function normalizeSnowflake(value, { label, allowEmpty = false } = {}) {
  if (value === null || value === undefined) {
    if (allowEmpty) {
      return null;
    }
    throw new TypeError(`Se requiere el ${formatLabel(label)}.`);
  }
  const text = String(value).trim();
  if (!text && allowEmpty) {
    return null;
  }
  if (!SNOWFLAKE_REGEX.test(text)) {
    logger.warn('Snowflake inesperado para', formatLabel(label), text);
  }
  return text;
}

export function normalizeSnowflakeArray(values, options) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }
  const unique = new Set();
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }
    try {
      unique.add(normalizeSnowflake(value, options));
    } catch (error) {
      logger.warn('No se pudo normalizar snowflake', value, error.message);
    }
  }
  return Array.from(unique);
}
