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

       user_id,
       trades_completed,
       last_trade_at
     ) VALUES (?, 1, NOW())
     ON DUPLICATE KEY UPDATE
       trades_completed = trades_completed + 1,
       last_trade_at = NOW()
    `,
    [normalized]
  );
  if (robloxUserId) {
    await pool.query('UPDATE users SET roblox_id = ? WHERE id = ?', [robloxUserId, normalized]);
  }

}

export async function getMemberStats(discordUserId) {
  const normalized = normalizeSnowflake(discordUserId, { label: 'discordUserId' });

  const [rows] = await pool.query(
    `SELECT mts.user_id, mts.trades_completed, mts.last_trade_at, mts.updated_at, u.roblox_id
       FROM member_trade_stats mts
       LEFT JOIN users u ON u.id = mts.user_id
      WHERE mts.user_id = ?
      LIMIT 1`,
    [normalized]
  );
  const record = rows[0] ?? null;
  if (!record) return null;
  const [tradeRows] = await pool.query(
    `SELECT t.roblox_username,
            t.roblox_user_id,
            partner.roblox_username AS partner_username,
            partner.roblox_user_id AS partner_user_id
       FROM mm_trades t
       LEFT JOIN mm_trades partner ON partner.ticket_id = t.ticket_id AND partner.user_id <> t.user_id
      WHERE t.user_id = ?
      ORDER BY t.updated_at DESC
      LIMIT 1`,
    [normalized]
  );
  const trade = tradeRows[0] ?? null;
  return {
    ...record,
    discord_user_id: normalized,
    roblox_username: trade?.roblox_username ?? null,
    roblox_user_id: trade?.roblox_user_id ?? record.roblox_id ?? null,
    partner_roblox_username: trade?.partner_username ?? null,
    partner_roblox_user_id: trade?.partner_user_id ?? null,

  };
}
