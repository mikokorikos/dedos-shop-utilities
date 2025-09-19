export class EventParticipantRepository {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.db);
  }

  async upsertParticipant({ sessionId, guildId, userId }) {
    if (!this.enabled) return null;
    this.logger.debug(`[#PART][DB] Registrando participante ${userId} en sesión ${sessionId}.`);
    await this.db.execute(
      `INSERT INTO event_participants (session_id, guild_id, user_id, state, joined_at)
       VALUES (?, ?, ?, 'active', NOW())
       ON DUPLICATE KEY UPDATE state = 'active', joined_at = COALESCE(joined_at, NOW()), last_state_change_at = NOW()`,
      [sessionId, guildId, userId]
    );
  }

  async markReminder({ sessionId, userId, reason }) {
    if (!this.enabled) return;
    this.logger.info(`[#PART][DB] Registrando recordatorio para ${userId} en sesión ${sessionId}.`);
    await this.db.execute(
      `UPDATE event_participants
       SET reminders_sent = reminders_sent + 1,
           state = 'reminded',
           last_state_reason = ?,
           last_state_change_at = NOW()
       WHERE session_id = ? AND user_id = ?`,
      [reason || null, sessionId, userId]
    );
  }

  async markWarning({ sessionId, userId, reason }) {
    if (!this.enabled) return;
    this.logger.info(`[#PART][DB] Registrando advertencia para ${userId} en sesión ${sessionId}.`);
    await this.db.execute(
      `UPDATE event_participants
       SET warnings_sent = warnings_sent + 1,
           state = 'warned',
           last_state_reason = ?,
           last_state_change_at = NOW()
       WHERE session_id = ? AND user_id = ?`,
      [reason || null, sessionId, userId]
    );
  }

  async markExpulsion({ sessionId, userId, reason }) {
    if (!this.enabled) return;
    this.logger.warn(`[#PART][DB] Registrando expulsión para ${userId} en sesión ${sessionId}.`);
    await this.db.execute(
      `UPDATE event_participants
       SET expulsions_count = expulsions_count + 1,
           state = 'expelled',
           last_state_reason = ?,
           last_state_change_at = NOW()
       WHERE session_id = ? AND user_id = ?`,
      [reason || null, sessionId, userId]
    );
  }

  async markPermanentBan({ sessionId, userId, reason }) {
    if (!this.enabled) return;
    this.logger.warn(
      `[#PART][DB] Marcando baneo permanente para ${userId} en sesión ${sessionId}.`
    );
    await this.db.execute(
      `UPDATE event_participants
       SET state = 'banned',
           last_state_reason = ?,
           last_state_change_at = NOW()
       WHERE session_id = ? AND user_id = ?`,
      [reason || null, sessionId, userId]
    );
  }

  async clearState({ sessionId, userId }) {
    if (!this.enabled) return;
    this.logger.info(`[#PART][DB] Restableciendo estado para ${userId} en sesión ${sessionId}.`);
    await this.db.execute(
      `UPDATE event_participants
       SET state = 'active',
           last_state_reason = NULL,
           reminders_sent = 0,
           warnings_sent = 0,
           expulsions_count = 0,
           last_state_change_at = NOW()
       WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    );
  }

  async updateLastCheck({ sessionId, userId }) {
    if (!this.enabled) return;
    await this.db.execute(
      `UPDATE event_participants SET last_check_at = NOW() WHERE session_id = ? AND user_id = ?`,
      [sessionId, userId]
    );
  }

  async listForVerification(sessionId) {
    if (!this.enabled) return [];
    this.logger.debug(`[#PART][DB] Obteniendo participantes a verificar para sesión ${sessionId}.`);
    const [rows] = await this.db.execute(
      `SELECT session_id, guild_id, user_id, state, reminders_sent, warnings_sent, expulsions_count
       FROM event_participants
       WHERE session_id = ? AND state IN ('active', 'reminded', 'warned')`,
      [sessionId]
    );
    return rows;
  }

  async listCurrentParticipants(sessionId) {
    if (!this.enabled) return [];
    const [rows] = await this.db.execute(
      `SELECT user_id
       FROM event_participants
       WHERE session_id = ? AND state IN ('active', 'reminded', 'warned')
       ORDER BY joined_at ASC`,
      [sessionId]
    );
    return rows.map((row) => row.user_id);
  }
}
