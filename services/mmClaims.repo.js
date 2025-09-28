import { pool } from './db.js';
import { normalizeSnowflake } from '../utils/snowflake.js';

export async function createClaim({ ticketId, middlemanUserId }) {
  const normalized = normalizeSnowflake(middlemanUserId, { label: 'middlemanUserId' });
  await pool.query(

    `INSERT INTO mm_claims (ticket_id, middleman_id, panel_message_id, finalization_message_id)
     VALUES (?, ?, NULL, NULL)
     ON DUPLICATE KEY UPDATE middleman_id = VALUES(middleman_id), claimed_at = CURRENT_TIMESTAMP`,

    [ticketId, normalized]
  );
}

export async function getClaimByTicket(ticketId) {
  const [rows] = await pool.query('SELECT * FROM mm_claims WHERE ticket_id = ? LIMIT 1', [ticketId]);
  const claim = rows[0] ?? null;
  if (claim) {
    claim.middleman_id = normalizeSnowflake(claim.middleman_id, { label: 'middlemanUserId' });
  }
  return claim;
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

export async function setClaimPanelMessageId(ticketId, messageId) {
  const normalized = normalizeSnowflake(messageId, { label: 'panelMessageId' });
  await pool.query('UPDATE mm_claims SET panel_message_id = ? WHERE ticket_id = ?', [normalized, ticketId]);
}

export async function setClaimFinalizationMessageId(ticketId, messageId) {
  const normalized = normalizeSnowflake(messageId, { label: 'finalizationMessageId' });
  await pool.query('UPDATE mm_claims SET finalization_message_id = ? WHERE ticket_id = ?', [normalized, ticketId]);
}
