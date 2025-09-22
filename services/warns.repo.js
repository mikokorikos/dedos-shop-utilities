import { pool } from './db.js';

export async function addWarn({ userId, moderatorId, reason, severity }) {
  const [result] = await pool.query(
    'INSERT INTO warns (user_id, moderator_id, reason, severity) VALUES (?, ?, ?, ?)',
    [userId, moderatorId, reason, severity ?? 'minor']
  );
  return result.insertId;
}

export async function removeWarns(userId, amount) {
  const [rows] = await pool.query(
    'SELECT id FROM warns WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, amount]
  );
  if (rows.length === 0) return 0;
  const ids = rows.map((row) => row.id);
  await pool.query('DELETE FROM warns WHERE id IN (?)', [ids]);
  return ids.length;
}

export async function countWarns(userId) {
  const [rows] = await pool.query('SELECT COUNT(*) as total FROM warns WHERE user_id = ?', [userId]);
  return rows[0]?.total ?? 0;
}

export async function listWarns(userId) {
  const [rows] = await pool.query('SELECT * FROM warns WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return rows;
}
