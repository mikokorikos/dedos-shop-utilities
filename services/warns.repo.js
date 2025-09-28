import { pool } from './db.js';
import { normalizeSnowflake } from '../utils/snowflake.js';
import { getWarnSeverityIdByName, getWarnSeverityNameById } from './catalogs.repo.js';

export async function addWarn({ userId, moderatorId, reason, severity }) {
  const user = normalizeSnowflake(userId, { label: 'warnUserId' });
  const moderator =
    moderatorId == null ? null : normalizeSnowflake(moderatorId, { label: 'moderatorId', allowEmpty: true });
  const severityId = await getWarnSeverityIdByName(severity ?? 'minor');
  const [result] = await pool.query(
    'INSERT INTO warns (user_id, moderator_id, reason, severity_id) VALUES (?, ?, ?, ?)',
    [user, moderator, reason, severityId]
  );
  return result.insertId;
}

export async function removeWarns(userId, amount) {
  const user = normalizeSnowflake(userId, { label: 'warnUserId' });
  const [rows] = await pool.query(
    'SELECT id FROM warns WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [user, amount]
  );
  if (rows.length === 0) return 0;
  const ids = rows.map((row) => row.id);
  await pool.query('DELETE FROM warns WHERE id IN (?)', [ids]);
  return ids.length;
}

export async function countWarns(userId) {
  const user = normalizeSnowflake(userId, { label: 'warnUserId' });
  const [rows] = await pool.query('SELECT COUNT(*) as total FROM warns WHERE user_id = ?', [user]);
  return rows[0]?.total ?? 0;
}

export async function listWarns(userId) {
  const user = normalizeSnowflake(userId, { label: 'warnUserId' });
  const [rows] = await pool.query('SELECT * FROM warns WHERE user_id = ? ORDER BY created_at DESC', [user]);
  const mapped = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      severity: await getWarnSeverityNameById(row.severity_id),
      user_id: normalizeSnowflake(row.user_id, { label: 'warnUserId' }),
      moderator_id:
        row.moderator_id == null
          ? null
          : normalizeSnowflake(row.moderator_id, { label: 'moderatorId', allowEmpty: true }),
    }))
  );
  return mapped;
}
