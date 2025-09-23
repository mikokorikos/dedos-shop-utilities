import { pool } from './db.js';

export async function upsertMiddleman({ discordUserId, robloxUsername, robloxUserId = null }) {
  await pool.query(
    `INSERT INTO middlemen (discord_user_id, roblox_username, roblox_user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE roblox_username = VALUES(roblox_username), roblox_user_id = VALUES(roblox_user_id), updated_at = CURRENT_TIMESTAMP`,
    [discordUserId, robloxUsername, robloxUserId]
  );
}

export async function updateMiddleman({ discordUserId, robloxUsername, robloxUserId = null }) {
  await pool.query(
    `UPDATE middlemen
     SET roblox_username = COALESCE(?, roblox_username),
         roblox_user_id = COALESCE(?, roblox_user_id),
         updated_at = CURRENT_TIMESTAMP
     WHERE discord_user_id = ?`,
    [robloxUsername ?? null, robloxUserId ?? null, discordUserId]
  );
}

export async function getMiddlemanByDiscordId(discordUserId) {
  const [rows] = await pool.query('SELECT * FROM middlemen WHERE discord_user_id = ? LIMIT 1', [discordUserId]);
  return rows[0] ?? null;
}

export async function listTopMiddlemen(limit = 10) {
  const safeLimit = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 10));
  const [rows] = await pool.query(
    `SELECT *,
            CASE WHEN rating_count > 0 THEN rating_sum / rating_count ELSE NULL END AS rating_avg
       FROM middlemen
       ORDER BY vouches_count DESC, rating_avg DESC, rating_count DESC, updated_at DESC
       LIMIT ?`,
    [safeLimit]
  );
  return rows;
}

export async function addMiddlemanRating(discordUserId, stars) {
  await pool.query(
    'UPDATE middlemen SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE discord_user_id = ?',
    [stars, discordUserId]
  );
}

export async function incrementMiddlemanVouch(discordUserId) {
  await pool.query('UPDATE middlemen SET vouches_count = vouches_count + 1 WHERE discord_user_id = ?', [discordUserId]);
}

export async function getMiddlemenByDiscordIds(discordIds) {
  if (!Array.isArray(discordIds) || discordIds.length === 0) {
    return [];
  }
  const placeholders = discordIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT *, CASE WHEN rating_count > 0 THEN rating_sum / rating_count ELSE NULL END AS rating_avg
       FROM middlemen
       WHERE discord_user_id IN (${placeholders})`,
    discordIds
  );
  return rows;
}
