import { pool } from './db.js';
import { normalizeSnowflake } from '../utils/snowflake.js';

export async function incrementMemberTrade({
  discordUserId,
  robloxUsername = null,
  robloxUserId = null,
  partnerRobloxUsername = null,
  partnerRobloxUserId = null,
}) {
  const normalized = normalizeSnowflake(discordUserId, { label: 'discordUserId' });
  await pool.query(
    `INSERT INTO member_trade_stats (
       discord_user_id,
       roblox_username,
       roblox_user_id,
       partner_roblox_username,
       partner_roblox_user_id,
       trades_completed,
       last_trade_at
     ) VALUES (?, ?, ?, ?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE
       trades_completed = trades_completed + 1,
       roblox_username = VALUES(roblox_username),
       roblox_user_id = VALUES(roblox_user_id),
       partner_roblox_username = VALUES(partner_roblox_username),
       partner_roblox_user_id = VALUES(partner_roblox_user_id),
       last_trade_at = NOW()
    `,
    [
      normalized,
      robloxUsername ?? null,
      robloxUserId ?? null,
      partnerRobloxUsername ?? null,
      partnerRobloxUserId ?? null,
    ]
  );
}

export async function getMemberStats(discordUserId) {
  const normalized = normalizeSnowflake(discordUserId, { label: 'discordUserId' });
  const [rows] = await pool.query('SELECT * FROM member_trade_stats WHERE discord_user_id = ? LIMIT 1', [normalized]);
  const record = rows[0] ?? null;
  if (!record) return null;
  return {
    ...record,
    discord_user_id: normalized,
  };
}
