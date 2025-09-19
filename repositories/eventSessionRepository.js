export class EventSessionRepository {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.db);
  }

  async findActiveSession(guildId) {
    if (!this.enabled) return null;
    this.logger.debug(`[EVENT][DB] Buscando sesión activa para guild ${guildId}.`);
    const [[row]] = await this.db.execute(
      `SELECT id, guild_id, name, created_at, finished_at, status, message_id, channel_id
       FROM event_sessions
       WHERE guild_id = ? AND status = 'active'
       ORDER BY id DESC
       LIMIT 1`,
      [guildId]
    );
    return row || null;
  }

  async createSession({ guildId, name, createdBy, messageId, channelId }) {
    if (!this.enabled) return null;
    this.logger.info(
      `[EVENT][DB] Creando sesión para guild ${guildId} con mensaje ${messageId || 'N/A'}.`
    );
    const [result] = await this.db.execute(
      `INSERT INTO event_sessions (guild_id, name, created_by, message_id, channel_id)
       VALUES (?, ?, ?, ?, ?)`,
      [guildId, name, createdBy, messageId, channelId]
    );
    return { id: Number(result.insertId) };
  }

  async attachMessage({ sessionId, messageId, channelId }) {
    if (!this.enabled) return;
    this.logger.debug(
      `[EVENT][DB] Actualizando mensaje de sesión ${sessionId} -> ${messageId}.`
    );
    await this.db.execute(
      `UPDATE event_sessions SET message_id = ?, channel_id = ? WHERE id = ?`,
      [messageId, channelId, sessionId]
    );
  }

  async finishSession({ sessionId, finishedBy, reason }) {
    if (!this.enabled) return;
    this.logger.info(`[EVENT][DB] Finalizando sesión ${sessionId}.`);
    await this.db.execute(
      `UPDATE event_sessions
       SET status = 'finished', finished_at = NOW(), finished_by = ?, finish_reason = ?
       WHERE id = ?`,
      [finishedBy || null, reason || null, sessionId]
    );
  }

  async listActiveSessions() {
    if (!this.enabled) return [];
    this.logger.debug('[EVENT][DB] Listando sesiones activas.');
    const [rows] = await this.db.execute(
      `SELECT id, guild_id, name, created_at, message_id, channel_id
       FROM event_sessions
       WHERE status = 'active'`
    );
    return rows;
  }
}
