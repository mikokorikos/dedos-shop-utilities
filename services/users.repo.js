import { pool } from './db.js';
import { normalizeSnowflake } from '../utils/snowflake.js';

export async function ensureUser(userId) {
  const normalized = normalizeSnowflake(userId, { label: 'userId' });
  await pool.query('INSERT IGNORE INTO users (id) VALUES (?)', [normalized]);
  return normalized;
}

export async function updateRobloxId(userId, robloxId) {
  const normalized = normalizeSnowflake(userId, { label: 'userId' });
  await pool.query('UPDATE users SET roblox_id = ? WHERE id = ?', [robloxId, normalized]);
}

export async function getUser(userId) {
  const normalized = normalizeSnowflake(userId, { label: 'userId' });
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [normalized]);
  return rows[0] ?? null;
}
