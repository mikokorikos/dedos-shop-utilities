import { pool } from './db.js';
import { normalizeSnowflake, normalizeSnowflakeArray } from '../utils/snowflake.js';
import { logger } from '../utils/logger.js';

function buildStatsSelect(alias = 'm') {
  return `
    COALESCE((
      SELECT COUNT(*)
        FROM mm_claims c
       WHERE c.middleman_id = ${alias}.user_id AND c.vouched = 1
    ), 0) AS vouches_count,
    COALESCE((
      SELECT SUM(r.stars)
        FROM mm_reviews r
       WHERE r.middleman_id = ${alias}.user_id
    ), 0) AS rating_sum,
    COALESCE((
      SELECT COUNT(*)
        FROM mm_reviews r
       WHERE r.middleman_id = ${alias}.user_id
    ), 0) AS rating_count
  `;
}

export async function upsertMiddleman({ discordUserId, robloxUsername, robloxUserId = null }) {
  const discordId = normalizeSnowflake(discordUserId, { label: 'discordUserId' });
  await pool.query(
    `INSERT INTO middlemen (user_id, roblox_username, roblox_user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE roblox_username = VALUES(roblox_username), roblox_user_id = VALUES(roblox_user_id), updated_at = CURRENT_TIMESTAMP`,
    [discordId, robloxUsername, robloxUserId ?? null]
  );
}

export async function updateMiddleman({ discordUserId, robloxUsername, robloxUserId = null }) {
  const discordId = normalizeSnowflake(discordUserId, { label: 'discordUserId' });
  await pool.query(
    `UPDATE middlemen
     SET roblox_username = COALESCE(?, roblox_username),
         roblox_user_id = COALESCE(?, roblox_user_id),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ?`,
    [robloxUsername ?? null, robloxUserId ?? null, discordId]
  );
}

export async function getMiddlemanByDiscordId(discordUserId) {
  const discordId = normalizeSnowflake(discordUserId, { label: 'discordUserId' });
  const [rows] = await pool.query(
    `SELECT m.*, ${buildStatsSelect('m')}
       FROM middlemen m
      WHERE m.user_id = ?
      LIMIT 1`,
    [discordId]
  );
  return rows[0] ?? null;
}

export async function listTopMiddlemen(limit = 10) {
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 10));
  const [rows] = await pool.query(
    `SELECT stats.*, CASE WHEN stats.rating_count > 0 THEN stats.rating_sum / stats.rating_count ELSE NULL END AS rating_avg
       FROM (
         SELECT m.*, ${buildStatsSelect('m')}
           FROM middlemen m
       ) stats
       ORDER BY stats.vouches_count DESC, rating_avg DESC, stats.rating_count DESC, stats.updated_at DESC
       LIMIT ?`,
    [safeLimit]
  );
  return rows;
}

export async function addMiddlemanRating(discordUserId, stars) {
  logger.debug('addMiddlemanRating invoked - métricas se calculan dinámicamente', {
    middleman: discordUserId,
    stars,
  });
}

export async function incrementMiddlemanVouch(discordUserId) {
  logger.debug('incrementMiddlemanVouch invocado - vouches calculados vía claims', {
    middleman: discordUserId,
  });
}

export async function getMiddlemenByDiscordIds(discordIds) {
  if (!Array.isArray(discordIds) || discordIds.length === 0) {
    return [];
  }
  const normalized = normalizeSnowflakeArray(discordIds, { label: 'discordUserId' });
  if (normalized.length === 0) {
    return [];
  }
  const placeholders = normalized.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT m.*, ${buildStatsSelect('m')}
       FROM middlemen m
       WHERE m.user_id IN (${placeholders})`,
    normalized
  );
  return rows;
}
