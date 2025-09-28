import { pool } from './db.js';
import { normalizeSnowflake } from '../utils/snowflake.js';

export async function setFinalizationConfirmed(ticketId, userId) {
  const normalized = normalizeSnowflake(userId, { label: 'finalizationUserId' });
  await pool.query(
    'INSERT INTO mm_trade_finalizations (ticket_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE confirmed_at = CURRENT_TIMESTAMP',
    [ticketId, normalized]
  );
}

export async function resetFinalizations(ticketId) {
  await pool.query('DELETE FROM mm_trade_finalizations WHERE ticket_id = ?', [ticketId]);
}

export async function listFinalizations(ticketId) {
  const [rows] = await pool.query('SELECT user_id FROM mm_trade_finalizations WHERE ticket_id = ?', [ticketId]);
  return rows.map((row) => normalizeSnowflake(row.user_id, { label: 'finalizationUserId' }));
}
