import { pool } from './db.js';

export async function ensureUser(userId) {
  await pool.query('INSERT IGNORE INTO users (id) VALUES (?)', [userId]);
  return userId;
}

export async function updateRobloxId(userId, robloxId) {
  await pool.query('UPDATE users SET roblox_id = ? WHERE id = ?', [robloxId, userId]);
}

export async function getUser(userId) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
  return rows[0] ?? null;
}
