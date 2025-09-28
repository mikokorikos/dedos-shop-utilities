import { pool } from './db.js';
import { logger } from '../utils/logger.js';

function createCatalogLoader({ table, normalizeName = (value) => value, normalizeId = (value) => Number(value) }) {
  let cache = null;
  let loading = null;

  async function load() {
    const [rows] = await pool.query(`SELECT id, name FROM ${table}`);
    const byName = new Map();
    const byId = new Map();
    for (const row of rows) {
      const id = normalizeId(row.id);
      const name = row.name;
      byName.set(normalizeName(name), id);
      byId.set(id, name);
    }
    cache = { byName, byId };
    return cache;
  }

  return async function getCatalog() {
    if (cache) {
      return cache;
    }
    if (!loading) {
      loading = load().finally(() => {
        loading = null;
      });
    }
    return loading;
  };
}

const getWarnSeverityCatalog = createCatalogLoader({
  table: 'warn_severities',
  normalizeName: (name) => String(name ?? '').toLowerCase(),
});

const getTicketTypeCatalog = createCatalogLoader({
  table: 'ticket_types',
  normalizeName: (name) => String(name ?? '').toLowerCase(),
});

const getTicketStatusCatalog = createCatalogLoader({
  table: 'ticket_statuses',
  normalizeName: (name) => String(name ?? '').toUpperCase(),
});

function ensureDefault(map, key, fallbackKey) {
  if (map.byName.has(key)) {
    return map.byName.get(key);
  }
  return map.byName.get(fallbackKey);
}

export async function getWarnSeverityIdByName(name) {
  const catalog = await getWarnSeverityCatalog();
  const normalized = String(name ?? 'minor').toLowerCase();
  if (!catalog.byName.has(normalized)) {
    logger.warn('Severidad desconocida, usando "minor"', name);
  }
  return ensureDefault(catalog, normalized, 'minor');
}

export async function getWarnSeverityNameById(id) {
  const catalog = await getWarnSeverityCatalog();
  const numericId = Number(id);
  return catalog.byId.get(numericId) ?? catalog.byId.get(catalog.byName.get('minor')) ?? 'minor';
}

export async function getTicketTypeIdByName(name) {
  const catalog = await getTicketTypeCatalog();
  const normalized = String(name ?? '').toLowerCase();
  if (!catalog.byName.has(normalized)) {
    logger.warn('Tipo de ticket desconocido, usando "mm"', name);
    return ensureDefault(catalog, 'mm', 'mm');
  }
  return catalog.byName.get(normalized);
}

export async function getTicketTypeNameById(id) {
  const catalog = await getTicketTypeCatalog();
  const numericId = Number(id);
  return catalog.byId.get(numericId) ?? catalog.byId.get(catalog.byName.get('mm')) ?? 'mm';
}

export async function getTicketStatusIdByName(name) {
  const catalog = await getTicketStatusCatalog();
  const normalized = String(name ?? '').toUpperCase();
  if (!catalog.byName.has(normalized)) {
    logger.warn('Estado de ticket desconocido, usando "OPEN"', name);
  }
  return ensureDefault(catalog, normalized, 'OPEN');
}

export async function getTicketStatusNameById(id) {
  const catalog = await getTicketStatusCatalog();
  const numericId = Number(id);
  return catalog.byId.get(numericId) ?? catalog.byId.get(catalog.byName.get('OPEN')) ?? 'OPEN';
}
