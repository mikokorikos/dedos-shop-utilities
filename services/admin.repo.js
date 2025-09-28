import { pool } from './db.js';

export const DEFAULT_PAGE_SIZE = 10;

export const ENTITY_CONFIG = {
  users: {
    table: 'users',
    label: 'Usuarios',
    idColumn: 'id',
    orderBy: 'created_at DESC',
    select: 'id, roblox_id, created_at',
    searchColumns: ['id', 'roblox_id'],
  },
  middlemen: {
    table: 'middlemen',
    label: 'Middlemans',
    idColumn: 'user_id',
    orderBy: 'updated_at DESC',
    select:
      `user_id, roblox_username, roblox_user_id, created_at, updated_at,
       (SELECT COUNT(*) FROM mm_claims c WHERE c.middleman_id = middlemen.user_id AND c.vouched = 1) AS vouches_count,
       (SELECT COALESCE(SUM(r.stars), 0) FROM mm_reviews r WHERE r.middleman_id = middlemen.user_id) AS rating_sum,
       (SELECT COUNT(*) FROM mm_reviews r WHERE r.middleman_id = middlemen.user_id) AS rating_count`,
    searchColumns: ['user_id', 'roblox_username', 'roblox_user_id'],
  },
  warns: {
    table: 'warns',
    label: 'Warns',
    idColumn: 'id',
    orderBy: 'created_at DESC',
    select:
      `id, user_id, moderator_id, severity_id, reason, created_at,
       (SELECT name FROM warn_severities ws WHERE ws.id = warns.severity_id) AS severity_name`,
    searchColumns: ['id', 'user_id', 'moderator_id', 'reason', 'severity_id'],
  },
  tickets: {
    table: 'tickets',
    label: 'Tickets',
    idColumn: 'id',
    orderBy: 'created_at DESC',
    select:
      `id, owner_id, guild_id, channel_id, type_id, status_id, created_at, closed_at,
       (SELECT name FROM ticket_types tt WHERE tt.id = tickets.type_id) AS type,
       (SELECT name FROM ticket_statuses ts WHERE ts.id = tickets.status_id) AS status`,
    searchColumns: ['id', 'owner_id', 'channel_id', 'type_id', 'status_id'],
  },
};

function getEntityConfig(entity) {
  return ENTITY_CONFIG[entity] ?? null;
}

function sanitizePageSize(pageSize) {
  const parsed = Number.parseInt(pageSize, 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(25, parsed);
}

export function sanitizePage(page) {
  const parsed = Number.parseInt(page, 10);
  if (Number.isNaN(parsed) || parsed < 1) return 1;
  return parsed;
}

function buildSearchClause(columns, term) {
  const likeTerm = `%${term}%`;
  const clauses = columns.map((column) => `CAST(${column} AS CHAR) LIKE ?`);
  return {
    clause: clauses.length ? `WHERE ${clauses.join(' OR ')}` : '',
    params: columns.map(() => likeTerm),
  };
}

export function isSupportedEntity(entity) {
  return Boolean(getEntityConfig(entity));
}

export async function listRecords(entity, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const config = getEntityConfig(entity);
  if (!config) {
    throw new Error(`Entidad no soportada: ${entity}`);
  }
  const safePage = sanitizePage(page);
  const safePageSize = sanitizePageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const [rows] = await pool.query(
    `SELECT ${config.select}
       FROM ${config.table}
       ORDER BY ${config.orderBy}
       LIMIT ? OFFSET ?`,
    [safePageSize, offset]
  );
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ${config.table}`);
  return { rows, total, page: safePage, pageSize: safePageSize };
}

export async function searchRecords(entity, term, { page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const config = getEntityConfig(entity);
  if (!config) {
    throw new Error(`Entidad no soportada: ${entity}`);
  }
  const sanitizedTerm = term.trim();
  if (!sanitizedTerm) {
    return { rows: [], total: 0, page: 1, pageSize: sanitizePageSize(pageSize) };
  }
  const safePage = sanitizePage(page);
  const safePageSize = sanitizePageSize(pageSize);
  const offset = (safePage - 1) * safePageSize;
  const { clause, params } = buildSearchClause(config.searchColumns, sanitizedTerm);
  const [rows] = await pool.query(
    `SELECT ${config.select}
       FROM ${config.table}
       ${clause}
       ORDER BY ${config.orderBy}
       LIMIT ? OFFSET ?`,
    [...params, safePageSize, offset]
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${config.table} ${clause}`,
    params
  );
  return { rows, total, page: safePage, pageSize: safePageSize };
}

export async function deleteRecord(entity, identifier) {
  const config = getEntityConfig(entity);
  if (!config) {
    throw new Error(`Entidad no soportada: ${entity}`);
  }
  const [result] = await pool.query(
    `DELETE FROM ${config.table} WHERE ${config.idColumn} = ? LIMIT 1`,
    [identifier]
  );
  return result.affectedRows;
}
