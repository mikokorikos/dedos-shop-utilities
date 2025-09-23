import { pool } from './db.js';

export async function createClaim({ ticketId, middlemanUserId }) {
  await pool.query(
    'INSERT INTO mm_claims (ticket_id, middleman_user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE middleman_user_id = VALUES(middleman_user_id), claimed_at = CURRENT_TIMESTAMP',
    [ticketId, middlemanUserId]
  );
}

export async function getClaimByTicket(ticketId) {
  const [rows] = await pool.query('SELECT * FROM mm_claims WHERE ticket_id = ? LIMIT 1', [ticketId]);
  return rows[0] ?? null;
}

export async function markReviewRequested(ticketId) {
  await pool.query('UPDATE mm_claims SET review_requested_at = CURRENT_TIMESTAMP WHERE ticket_id = ?', [ticketId]);
}

export async function markClaimClosed(ticketId, { forced = false } = {}) {
  await pool.query(
    'UPDATE mm_claims SET closed_at = IFNULL(closed_at, CURRENT_TIMESTAMP), forced_close = CASE WHEN ? THEN 1 ELSE forced_close END WHERE ticket_id = ?',
    [forced ? 1 : 0, ticketId]
  );
}

export async function markClaimVouched(ticketId) {
  await pool.query('UPDATE mm_claims SET vouched = 1 WHERE ticket_id = ?', [ticketId]);
}
