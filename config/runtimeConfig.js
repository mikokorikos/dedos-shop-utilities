import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const RUNTIME_PATH = resolve(process.cwd(), 'config/runtime.json');
const DEFAULT_CONFIG = {
  reviewsChannel: null,
};

let cachedConfig = null;
let loadingPromise = null;

function applyDefaults(raw) {
  const base = { ...DEFAULT_CONFIG };
  if (!raw || typeof raw !== 'object') {
    return base;
  }
  if (Object.prototype.hasOwnProperty.call(raw, 'reviewsChannel')) {
    if (raw.reviewsChannel === null) {
      base.reviewsChannel = null;
    } else {
      const channelId = String(raw.reviewsChannel).trim();
      base.reviewsChannel = channelId.length > 0 ? channelId : null;
    }
  }
  return base;
}

async function ensureFile() {
  if (existsSync(RUNTIME_PATH)) {
    return;
  }
  const dir = dirname(RUNTIME_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await writeFile(RUNTIME_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
}

async function loadFromDisk() {
  await ensureFile();
  const buffer = await readFile(RUNTIME_PATH, 'utf8');
  if (!buffer.length) {
    return applyDefaults({});
  }
  try {
    const parsed = JSON.parse(buffer);
    return applyDefaults(parsed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[runtimeConfig] Archivo inválido, restaurando configuración predeterminada', error);
    return applyDefaults({});
  }
}

export async function getRuntimeConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }
  if (!loadingPromise) {
    loadingPromise = loadFromDisk()
      .then((config) => {
        cachedConfig = config;
        return cachedConfig;
      })
      .finally(() => {
        loadingPromise = null;
      });
  }
  return loadingPromise;
}

export async function updateRuntimeConfig(partial) {
  const current = await getRuntimeConfig();
  const next = applyDefaults({ ...current, ...partial });
  cachedConfig = next;
  await ensureFile();
  await writeFile(RUNTIME_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return cachedConfig;
}

export function getRuntimeConfigPath() {
  return RUNTIME_PATH;
}
