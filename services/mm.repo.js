import { pool } from './db.js';

export async function upsertTradeData({ ticketId, userId, robloxUsername, robloxUserId, items }) {
  await pool.query(
    `INSERT INTO mm_trades (ticket_id, user_id, roblox_username, roblox_user_id, items, confirmed)
     VALUES (?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE roblox_username = VALUES(roblox_username), roblox_user_id = VALUES(roblox_user_id), items = VALUES(items), confirmed = 0, updated_at = CURRENT_TIMESTAMP`,
    [ticketId, userId, robloxUsername, robloxUserId ?? null, items]
  );
}

export async function setTradeConfirmed(ticketId, userId) {
  await pool.query('UPDATE mm_trades SET confirmed = 1 WHERE ticket_id = ? AND user_id = ?', [ticketId, userId]);
}

export async function resetTradeConfirmation(ticketId, userId) {
  await pool.query('UPDATE mm_trades SET confirmed = 0 WHERE ticket_id = ? AND user_id = ?', [ticketId, userId]);
}

export async function getTradesByTicket(ticketId) {
  const [rows] = await pool.query('SELECT * FROM mm_trades WHERE ticket_id = ?', [ticketId]);
  return rows;
}

export async function getTrade(ticketId, userId) {
  const [rows] = await pool.query('SELECT * FROM mm_trades WHERE ticket_id = ? AND user_id = ? LIMIT 1', [ticketId, userId]);
  return rows[0] ?? null;
}
