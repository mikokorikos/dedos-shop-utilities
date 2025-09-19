const ACTION_COLUMNS = {
  reminder: 'reminders',
  warning: 'warnings',
  expulsion: 'expulsions',
};

export class EventSanctionRepository {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.db);
  }

  async getCounter({ guildId, userId, reason }) {
    if (!this.enabled) return null;
    this.logger.debug(`[#SANC][DB] Obteniendo contador ${reason} para ${userId}.`);
    const [[row]] = await this.db.execute(
      `SELECT guild_id, user_id, reason, reminders, warnings, expulsions, permanent_ban_at
       FROM event_sanction_counters
       WHERE guild_id = ? AND user_id = ? AND reason = ?`,
      [guildId, userId, reason]
    );
    return row || null;
  }

  async increment({ guildId, userId, reason, action }) {
    if (!this.enabled) return;
    const column = ACTION_COLUMNS[action];
    if (!column) {
      throw new Error(`Acción de sanción desconocida: ${action}`);
    }
    this.logger.info(
      `[#SANC][DB] Incrementando ${action} para ${userId} (${reason}) en guild ${guildId}.`
    );
    await this.db.execute(
      `INSERT INTO event_sanction_counters (guild_id, user_id, reason, ${column}, last_action, last_action_at)
       VALUES (?, ?, ?, 1, ?, NOW())
       ON DUPLICATE KEY UPDATE ${column} = ${column} + 1, last_action = VALUES(last_action), last_action_at = VALUES(last_action_at)`,
      [guildId, userId, reason, action]
    );
  }

  async markPermanentBan({ guildId, userId, reason }) {
    if (!this.enabled) return;
    this.logger.warn(
      `[#SANC][DB] Estableciendo baneo permanente para ${userId} (${reason}) en guild ${guildId}.`
    );
    await this.db.execute(
      `UPDATE event_sanction_counters
       SET permanent_ban_at = NOW(), last_action = 'permanent_ban', last_action_at = NOW()
       WHERE guild_id = ? AND user_id = ? AND reason = ?`,
      [guildId, userId, reason]
    );
  }

  async clearCounters({ guildId, userId, reason }) {
    if (!this.enabled) return;
    this.logger.info(
      `[#SANC][DB] Reiniciando contadores para ${userId} (${reason || 'todos'}) en guild ${guildId}.`
    );
    if (reason) {
      await this.db.execute(
        `UPDATE event_sanction_counters
         SET reminders = 0, warnings = 0, expulsions = 0, permanent_ban_at = NULL, last_action = 'amnesty', last_action_at = NOW()
         WHERE guild_id = ? AND user_id = ? AND reason = ?`,
        [guildId, userId, reason]
      );
      return;
    }
    await this.db.execute(
      `UPDATE event_sanction_counters
       SET reminders = 0, warnings = 0, expulsions = 0, permanent_ban_at = NULL, last_action = 'amnesty', last_action_at = NOW()
       WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
  }

  async isPermanentlyBanned({ guildId, userId }) {
    if (!this.enabled) return false;
    const [[row]] = await this.db.execute(
      `SELECT 1
       FROM event_sanction_counters
       WHERE guild_id = ? AND user_id = ? AND permanent_ban_at IS NOT NULL
       LIMIT 1`,
      [guildId, userId]
    );
    return Boolean(row);
  }
}
