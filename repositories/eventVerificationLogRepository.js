export class EventVerificationLogRepository {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.db);
  }

  async recordCheck({ sessionId, guildId, userId, tagOk, bioOk, action, details }) {
    if (!this.enabled) return;
    this.logger.debug(`[#CHECK][DB] Guardando chequeo para ${userId} acción ${action || 'none'}.`);
    await this.db.execute(
      `INSERT INTO event_verification_checks
       (session_id, guild_id, user_id, tag_ok, bio_ok, action_taken, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, guildId, userId, tagOk ? 1 : 0, bioOk ? 1 : 0, action || 'none', details || null]
    );
  }
}
