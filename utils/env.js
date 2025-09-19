import fs from 'node:fs';

export const sanitizeEnvValue = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const parseIntEnv = (value, fallback) => {
  const raw = sanitizeEnvValue(value);
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const parseFloatEnv = (value, fallback) => {
  const raw = sanitizeEnvValue(value);
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const parseBooleanEnv = (value, fallback = false) => {
  const raw = sanitizeEnvValue(value);
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw === 'boolean') return raw;
  return /^(1|true|on|yes)$/i.test(raw);
};

export const parseColorEnv = (value, fallback) => {
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

export const parseIdListEnv = (value) => {
  const raw = sanitizeEnvValue(value);
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
};

export const ensureDirectory = (dirPath) => {
  if (!dirPath) return;
  if (fs.existsSync(dirPath)) return;
  fs.mkdirSync(dirPath, { recursive: true });
};
