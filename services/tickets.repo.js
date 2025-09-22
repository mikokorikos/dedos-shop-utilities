import { pool } from './db.js';

export async function createTicket({ guildId, channelId, ownerId, type, status = 'open' }) {
  const [result] = await pool.query(
    'INSERT INTO tickets (guild_id, channel_id, owner_id, type, status) VALUES (?, ?, ?, ?, ?)',
    [guildId, channelId, ownerId, type, status]
  );
  return result.insertId;
}

export async function setTicketStatus(ticketId, status) {
  await pool.query('UPDATE tickets SET status = ?, closed_at = CASE WHEN ? = "closed" THEN CURRENT_TIMESTAMP ELSE closed_at END WHERE id = ?', [
    status,
    status,
    ticketId,
  ]);
}

export async function countOpenTicketsByUser(userId, type) {
  const [rows] = await pool.query(
    'SELECT COUNT(*) as total FROM tickets WHERE owner_id = ? AND status = "open" AND type = ?',
    [userId, type]
  );
  return rows[0]?.total ?? 0;
}

export async function registerParticipant(ticketId, userId) {
  await pool.query('INSERT IGNORE INTO ticket_participants (ticket_id, user_id) VALUES (?, ?)', [ticketId, userId]);
}

export async function getTicketByChannel(channelId) {
  const [rows] = await pool.query('SELECT * FROM tickets WHERE channel_id = ? LIMIT 1', [channelId]);
  return rows[0] ?? null;
}

export async function getTicket(ticketId) {
  const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
  return rows[0] ?? null;
}

export async function listParticipants(ticketId) {
  const [rows] = await pool.query('SELECT user_id FROM ticket_participants WHERE ticket_id = ?', [ticketId]);
  return rows.map((row) => String(row.user_id));
}
