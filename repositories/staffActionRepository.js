export class StaffActionRepository {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.db);
  }

  async logAmnesty({ guildId, moderatorId, userId, action, reason, reference }) {
    if (!this.enabled) return;
    this.logger.info(
      `[AMNESTY][DB] Registrando acción ${action} de ${moderatorId} sobre ${userId}.`
    );
    await this.db.execute(
      `INSERT INTO staff_amnesties (guild_id, moderator_id, user_id, action, reason, target_reference)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [guildId, moderatorId, userId, action, reason || null, reference || null]
    );
  }
}
