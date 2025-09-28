import { getMemberStats } from '../../services/memberStats.repo.js';
import { generateMemberCard } from '../../services/canvasCard.js';
import { parseUser } from '../../utils/helpers.js';
import { sendCommandReply } from '../../utils/respond.js';
import { logger } from '../../utils/logger.js';
import { buildMemberStatsEmpty, buildMemberStatsMessage } from './ui.js';

async function resolveUserTag(client, userId) {
  if (!userId) return 'Usuario desconocido';
  try {
    const user = await client.users.fetch(String(userId));
    return `${user}`;
  } catch (error) {
    return `<@${userId}>`;
  }
}

export async function handleMemberStatsCommand(ctx) {
  const isSlash = 'isChatInputCommand' in ctx && typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand();
  let targetId = null;
  if (isSlash) {
    const option =
      ctx.options.getUser?.('usuario') ??
      ctx.options.getUser?.('user') ??
      ctx.options.getUser?.('target');
    targetId = option?.id ?? ctx.user?.id ?? null;
  } else {
    const content = ctx.content ?? '';
    const [, maybeTarget] = content.trim().split(/\s+/, 2);
    targetId = parseUser(maybeTarget) ?? ctx.author?.id ?? null;
  }
  if (!targetId) {
    await sendCommandReply(
      ctx,
      buildMemberStatsEmpty({ userTag: 'Usuario desconocido' }),
      { ephemeral: isSlash }
    );
    return;
  }

  const stats = await getMemberStats(targetId);
  const tag = await resolveUserTag(ctx.client, targetId);
  if (!stats) {
    await sendCommandReply(ctx, buildMemberStatsEmpty({ userTag: tag }), { ephemeral: isSlash });
    return;
  }

  let card = null;
  if (stats.roblox_username || stats.roblox_user_id) {
    card = await generateMemberCard({
      robloxUsername: stats.roblox_username,
      robloxUserId: stats.roblox_user_id,
      tradesCompleted: stats.trades_completed,
      partnerRobloxUsername: stats.partner_roblox_username,
    }).catch((error) => {
      logger.warn('No se pudo generar tarjeta de miembro', {
        userId: targetId,
        reason: error?.message ?? error,
      });
      return null;
    });
  }

  const payload = buildMemberStatsMessage({
    userTag: tag,
    tradesCompleted: stats.trades_completed,
    robloxUsername: stats.roblox_username,
    partnerRobloxUsername: stats.partner_roblox_username,
    lastTradeAt: stats.last_trade_at,
  });
  const files = [...payload.files];
  if (card) {
    files.push(card);
  }
  const allowedMentions = { users: [String(targetId)] };
  await sendCommandReply(ctx, { ...payload, files, allowedMentions }, { ephemeral: false });
}
