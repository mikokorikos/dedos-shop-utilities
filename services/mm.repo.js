import { pool } from './db.js';
import { normalizeSnowflake } from '../utils/snowflake.js';

export async function upsertTradeData({ ticketId, userId, robloxUsername, robloxUserId, items }) {
  const discordId = normalizeSnowflake(userId, { label: 'tradeUserId' });
  await pool.query(
    `INSERT INTO mm_trades (ticket_id, user_id, roblox_username, roblox_user_id, items, confirmed)
     VALUES (?, ?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE roblox_username = VALUES(roblox_username), roblox_user_id = VALUES(roblox_user_id), items = VALUES(items), confirmed = 0, updated_at = CURRENT_TIMESTAMP`,
    [ticketId, discordId, robloxUsername, robloxUserId ?? null, items]
  );
}

export async function setTradeConfirmed(ticketId, userId) {
  const discordId = normalizeSnowflake(userId, { label: 'tradeUserId' });
  await pool.query('UPDATE mm_trades SET confirmed = 1 WHERE ticket_id = ? AND user_id = ?', [ticketId, discordId]);
}

export async function resetTradeConfirmation(ticketId, userId) {
  const discordId = normalizeSnowflake(userId, { label: 'tradeUserId' });
  await pool.query('UPDATE mm_trades SET confirmed = 0 WHERE ticket_id = ? AND user_id = ?', [ticketId, discordId]);
}

export async function getTradesByTicket(ticketId) {
  const [rows] = await pool.query('SELECT * FROM mm_trades WHERE ticket_id = ?', [ticketId]);
  return rows.map((row) => ({
    ...row,
    user_id: normalizeSnowflake(row.user_id, { label: 'tradeUserId' }),
  }));
}

export async function getTrade(ticketId, userId) {
  const discordId = normalizeSnowflake(userId, { label: 'tradeUserId' });
  const [rows] = await pool.query('SELECT * FROM mm_trades WHERE ticket_id = ? AND user_id = ? LIMIT 1', [ticketId, discordId]);
  const trade = rows[0] ?? null;
  if (trade) {
    trade.user_id = normalizeSnowflake(trade.user_id, { label: 'tradeUserId' });
  }
  return trade;
}
