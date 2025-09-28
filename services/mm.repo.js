import { pool } from './db.js';
import { normalizeSnowflake } from '../utils/snowflake.js';

function mapTradeRow(row) {
  let metadata = null;
  if (row.metadata) {
    try {
      metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    } catch (error) {
      metadata = null;
    }
  }
  const details = metadata?.details ?? row.item_name ?? null;
  return {
    ...row,
    user_id: normalizeSnowflake(row.user_id, { label: 'tradeUserId' }),
    metadata,
    items: details,
  };
}

export async function upsertTradeData({ ticketId, userId, robloxUsername, robloxUserId, items }) {
  const discordId = normalizeSnowflake(userId, { label: 'tradeUserId' });
  await pool.query(
    `INSERT INTO mm_trades (ticket_id, user_id, roblox_username, roblox_user_id, confirmed)
     VALUES (?, ?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE roblox_username = VALUES(roblox_username), roblox_user_id = VALUES(roblox_user_id), confirmed = 0, updated_at = CURRENT_TIMESTAMP`,
    [ticketId, discordId, robloxUsername, robloxUserId ?? null]
  );
  const [tradeRows] = await pool.query(
    'SELECT id FROM mm_trades WHERE ticket_id = ? AND user_id = ? LIMIT 1',
    [ticketId, discordId]
  );
  const tradeId = tradeRows[0]?.id;
  if (!tradeId) {
    return;
  }
  await pool.query('DELETE FROM mm_trade_items WHERE trade_id = ?', [tradeId]);
  if (items && items.trim()) {
    const trimmed = items.trim();
    const itemName = trimmed.length > 255 ? `${trimmed.slice(0, 252)}...` : trimmed;
    const metadata = JSON.stringify({ details: trimmed });
    await pool.query(
      'INSERT INTO mm_trade_items (trade_id, item_name, quantity, metadata) VALUES (?, ?, 1, ?)',
      [tradeId, itemName, metadata]
    );
  }
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
  const [rows] = await pool.query(
    `SELECT t.*, ti.item_name, ti.quantity, ti.metadata
       FROM mm_trades t
       LEFT JOIN mm_trade_items ti ON ti.trade_id = t.id
      WHERE t.ticket_id = ?`,
    [ticketId]
  );
  return rows.map(mapTradeRow);
}

export async function getTrade(ticketId, userId) {
  const discordId = normalizeSnowflake(userId, { label: 'tradeUserId' });
  const [rows] = await pool.query(
    `SELECT t.*, ti.item_name, ti.quantity, ti.metadata
       FROM mm_trades t
       LEFT JOIN mm_trade_items ti ON ti.trade_id = t.id
      WHERE t.ticket_id = ? AND t.user_id = ?
      LIMIT 1`,
    [ticketId, discordId]
  );
  const trade = rows[0] ?? null;
  return trade ? mapTradeRow(trade) : null;
}
