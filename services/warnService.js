import { EmbedBuilder } from 'discord.js';
import { parseSqlDate, toDiscordTimestamp } from '../utils/time.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';

const WARN_REASON_MAX_LENGTH = 1900;
const WARN_CONTEXT_URL_MAX_LENGTH = 255;

export class WarnService {
  constructor({ db, config, logger }) {
    this.db = db;
    this.config = config;
    this.logger = logger;
  }

  get enabled() {
    return Boolean(this.db);
  }

  async #ensureGuildMemberRecord(guildId, userId) {
    if (!this.enabled) return;
    await this.db.execute(
      `INSERT INTO guild_members (guild_id, user_id, first_seen_at, last_warn_at)
       VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE last_warn_at = VALUES(last_warn_at)`,
      [guildId, userId]
    );
  }

  async addWarn({ guildId, userId, moderatorId, reason, points = 1, contextUrl }) {
    if (!this.enabled) {
      throw new Error('El sistema de warns no está configurado.');
    }
    await this.#ensureGuildMemberRecord(guildId, userId);
    const cleanReason = reason ? reason.slice(0, WARN_REASON_MAX_LENGTH) : null;
    const cleanContextUrl = contextUrl ? contextUrl.slice(0, WARN_CONTEXT_URL_MAX_LENGTH) : null;
    const [result] = await this.db.execute(
      `INSERT INTO warns (guild_id, user_id, moderator_id, reason, points, context_message_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [guildId, userId, moderatorId, cleanReason, points, cleanContextUrl]
    );

    const [[totals]] = await this.db.execute(
      `SELECT COUNT(*) AS total_warns, COALESCE(SUM(points), 0) AS total_points
       FROM warns
       WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    return {
      warnId: Number(result.insertId),
      totalWarns: Number(totals?.total_warns ?? 1),
      totalPoints: Number(totals?.total_points ?? points),
    };
  }

  async getTotals(guildId, userId) {
    if (!this.enabled) return { totalWarns: 0, totalPoints: 0 };
    const [[row]] = await this.db.execute(
      `SELECT COUNT(*) AS total_warns, COALESCE(SUM(points), 0) AS total_points
       FROM warns
       WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    return {
      totalWarns: Number(row?.total_warns ?? 0),
      totalPoints: Number(row?.total_points ?? 0),
    };
  }

  async getHistory(guildId, userId, limit = this.config.WARN_HISTORY_PAGE_SIZE) {
    if (!this.enabled) return [];
    const cappedLimit = Math.max(1, Math.min(Number(limit) || this.config.WARN_HISTORY_PAGE_SIZE, 20));
    const [rows] = await this.db.execute(
      `SELECT id, moderator_id, reason, created_at, points
       FROM warns
       WHERE guild_id = ? AND user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [guildId, userId, cappedLimit]
    );
    return rows;
  }

  buildWarnEmbed({ targetMember, moderator, reason, totals, points = 1 }) {
    const embed = new EmbedBuilder()
      .setColor(this.config.WARN_EMBED_COLOR)
      .setAuthor({
        name: targetMember.user.tag,
        iconURL: targetMember.user.displayAvatarURL({ size: 128 }),
      })
      .setTitle('Advertencia registrada')
      .setDescription(reason || 'Sin razón registrada.')
      .addFields(
        { name: 'Moderador', value: `<@${moderator.id}>`, inline: true },
        { name: 'Puntos', value: String(points), inline: true },
        { name: 'Total warns', value: String(totals?.totalWarns ?? 1), inline: true }
      )
      .setFooter({ text: `Puntos acumulados: ${totals?.totalPoints ?? points}` })
      .setTimestamp();

    return embed;
  }

  buildHistoryEmbed({ targetMember, history, totals }) {
    const lines = history.map((warn, index) => {
      const number = totals.totalWarns - index;
      const timestamp = toDiscordTimestamp(parseSqlDate(warn.created_at));
      const parts = [`**#${number}** - <t:${timestamp}:f>`, `Moderador: <@${warn.moderator_id}>`];
      if (warn.points && warn.points !== 1) {
        parts.push(`Puntos: ${warn.points}`);
      }
      const reason = warn.reason?.slice(0, WARN_REASON_MAX_LENGTH) || 'Sin razón registrada.';
      parts.push(`Razón: ${reason}`);
      return parts.join('\n');
    });

    return new EmbedBuilder()
      .setColor(this.config.WARN_EMBED_COLOR)
      .setAuthor({
        name: targetMember.user.tag,
        iconURL: targetMember.user.displayAvatarURL({ size: 128 }),
      })
      .setTitle(`Historial de warns (${totals.totalWarns})`)
      .setDescription(lines.join('\n\n'))
      .setFooter({
        text: `Puntos acumulados: ${totals.totalPoints} - Mostrando ${history.length} registro(s)`,
        iconURL: this.config.BRAND_ICON,
      })
      .setTimestamp();
  }

  async sendWarnDm({ member, reason, moderator, points = 1, isVerbal = false }) {
    const embed = new EmbedBuilder()
      .setColor(this.config.WARN_EMBED_COLOR)
      .setTitle(isVerbal ? 'Advertencia verbal' : 'Has recibido una advertencia')
      .setDescription(reason || 'Sin razón registrada.')
      .setFooter({
        text: `Moderador: ${moderator.user?.tag || moderator.tag}`,
        iconURL: this.config.BRAND_ICON,
      })
      .setTimestamp();

    const gifPath = resolveGifPath(this.config.WELCOME_GIF);
    const payload = buildEmbedPayload(
      embed,
      gifPath,
      isVerbal ? this.config.VERBAL_WARN_GIF_URL : this.config.WARN_GIF_URL
    );

    try {
      await member.send(payload);
      this.logger.info(`[WARN] DM enviado a ${member.user?.tag || member.id}.`);
    } catch (error) {
      this.logger.warn(
        `[WARN] No se pudo enviar el DM a ${member.user?.tag || member.id}: ${error?.message || error}`
      );
    }
  }
}
