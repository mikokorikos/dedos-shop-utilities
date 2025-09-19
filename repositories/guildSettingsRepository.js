export class GuildSettingsRepository {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.db);
  }

  async getAllForGuild(guildId) {
    if (!this.enabled) return new Map();
    this.logger.debug(`[SETTINGS][DB] Cargando configuración para guild ${guildId}.`);
    const [rows] = await this.db.execute(
      `SELECT setting_key, setting_value FROM guild_settings WHERE guild_id = ?`,
      [guildId]
    );
    return new Map(rows.map((row) => [row.setting_key, row.setting_value]));
  }

  async upsertSetting({ guildId, key, value, updatedBy }) {
    if (!this.enabled) return;
    this.logger.info(
      `[SETTINGS][DB] Guardando configuración ${key}=${value} para guild ${guildId}.`
    );
    await this.db.execute(
      `INSERT INTO guild_settings (guild_id, setting_key, setting_value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [guildId, key, value, updatedBy || null]
    );
  }
}
