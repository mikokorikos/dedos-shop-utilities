export class SettingsService {
  constructor({ repository, logger }) {
    this.repository = repository;
    this.logger = logger;
    this.cache = new Map();
  }

  async #loadGuild(guildId) {
    if (this.cache.has(guildId)) {
      return this.cache.get(guildId);
    }
    const map = await this.repository.getAllForGuild(guildId);
    this.cache.set(guildId, map);
    return map;
  }

  async get(guildId, key, fallback) {
    const settings = await this.#loadGuild(guildId);
    if (!settings) return fallback;
    return settings.get(key) ?? fallback;
  }

  async set(guildId, key, value, updatedBy) {
    await this.repository.upsertSetting({ guildId, key, value, updatedBy });
    if (!this.cache.has(guildId)) {
      this.cache.set(guildId, new Map());
    }
    const map = this.cache.get(guildId);
    map.set(key, value);
    this.logger.debug(`[SETTINGS] Cache actualizada para ${guildId} -> ${key}=${value}.`);
    return value;
  }
}
