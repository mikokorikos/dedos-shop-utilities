import { pool } from './db.js';
import { normalizeSnowflake, normalizeSnowflakeArray } from '../utils/snowflake.js';
import { getTicketStatusIdByName, getTicketStatusNameById, getTicketTypeIdByName } from './catalogs.repo.js';

export async function createTicket({ guildId, channelId, ownerId, type, status = 'OPEN' }) {
  const normalizedGuild = normalizeSnowflake(guildId, { label: 'guildId' });
  const normalizedChannel = normalizeSnowflake(channelId, { label: 'channelId' });
  const normalizedOwner = normalizeSnowflake(ownerId, { label: 'ownerId' });

  const typeId = await getTicketTypeIdByName(type ?? 'mm');
  const statusId = await getTicketStatusIdByName(status ?? 'OPEN');
  const [result] = await pool.query(
    'INSERT INTO tickets (guild_id, channel_id, owner_id, type_id, status_id) VALUES (?, ?, ?, ?, ?)',
    [normalizedGuild, normalizedChannel, normalizedOwner, typeId, statusId]

  );
  return result.insertId;
}

function normalizeStatus(status) {
  const allowed = new Set(['OPEN', 'CONFIRMED', 'CLAIMED', 'CLOSED']);
  const value = typeof status === 'string' ? status.toUpperCase() : 'OPEN';
  return allowed.has(value) ? value : 'OPEN';
}

export async function setTicketStatus(ticketId, status) {

  const statusId = await getTicketStatusIdByName(status ?? 'OPEN');
  const statusName = await getTicketStatusNameById(statusId);
  await pool.query(
    'UPDATE tickets SET status_id = ?, closed_at = CASE WHEN ? = "CLOSED" THEN CURRENT_TIMESTAMP ELSE closed_at END WHERE id = ?',
    [statusId, statusName, ticketId]

  );
}

export async function countOpenTicketsByUser(userId, type) {
  const normalizedUser = normalizeSnowflake(userId, { label: 'ownerId' });
  const typeId = await getTicketTypeIdByName(type ?? 'mm');
  const openStatusId = await getTicketStatusIdByName('OPEN');
  const [rows] = await pool.query(

    'SELECT COUNT(*) as total FROM tickets WHERE owner_id = ? AND status_id = ? AND type_id = ?',
    [normalizedUser, openStatusId, typeId]

  );
  return rows[0]?.total ?? 0;
}

export async function registerParticipant(ticketId, userId) {
  const normalizedUser = normalizeSnowflake(userId, { label: 'participantId' });
  await pool.query('INSERT IGNORE INTO ticket_participants (ticket_id, user_id) VALUES (?, ?)', [ticketId, normalizedUser]);
}

export async function getTicketByChannel(channelId) {
  const normalizedChannel = normalizeSnowflake(channelId, { label: 'channelId' });
  const [rows] = await pool.query(
    `SELECT t.*, tt.name AS type_name, ts.name AS status_name
       FROM tickets t
       LEFT JOIN ticket_types tt ON tt.id = t.type_id
       LEFT JOIN ticket_statuses ts ON ts.id = t.status_id
      WHERE t.channel_id = ?
      LIMIT 1`,
    [normalizedChannel]
  );
  return rows[0] ? mapTicketRow(rows[0]) : null;
}

export async function getTicket(ticketId) {
  const [rows] = await pool.query(
    `SELECT t.*, tt.name AS type_name, ts.name AS status_name
       FROM tickets t
       LEFT JOIN ticket_types tt ON tt.id = t.type_id
       LEFT JOIN ticket_statuses ts ON ts.id = t.status_id
      WHERE t.id = ?
      LIMIT 1`,
    [ticketId]
  );
  return rows[0] ? mapTicketRow(rows[0]) : null;
}

export async function listParticipants(ticketId) {
  const [rows] = await pool.query('SELECT user_id FROM ticket_participants WHERE ticket_id = ?', [ticketId]);
  return normalizeSnowflakeArray(rows.map((row) => row.user_id), { label: 'participantId' });
}

function mapTicketRow(row) {
  return {
    ...row,
    type: row.type_name ?? row.type ?? null,
    status: row.status_name ?? row.status ?? null,
  };
}
