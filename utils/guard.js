import { CONFIG } from '../config/config.js';
import { noPermissionEmbed } from './branding.js';
import { checkCooldown } from './cooldowns.js';
import { CooldownError, PermissionError, UserFacingError } from './errors.js';
import { logger } from './logger.js';
import { userIsAdmin } from './permissions.js';

async function resolveMember(ctx, userId) {
  if (ctx.member) return ctx.member;
  const guild = ctx.guild ?? ctx.client?.guilds?.cache?.get(ctx.guildId);
  if (!guild || !userId) return null;
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    logger.warn('No se pudo obtener miembro para permisos', error);
    return null;
  }
}

async function sendResponse(ctx, payload, { ephemeral } = {}) {
  if ('reply' in ctx && typeof ctx.reply === 'function') {
    return ctx.reply({ ...payload, ephemeral: ephemeral ?? true });
  }
  if ('followUp' in ctx && typeof ctx.followUp === 'function') {
    return ctx.followUp({ ...payload, ephemeral: ephemeral ?? true });
  }
  if ('channel' in ctx && typeof ctx.channel?.send === 'function') {
    return ctx.reply?.(payload) ?? ctx.channel.send(payload);
  }
  throw new Error('Contexto no soportado para respuesta');
}

async function sendError(ctx, error) {
  if (error instanceof PermissionError) {
    await sendResponse(ctx, noPermissionEmbed(ctx.user?.tag ?? ctx.author?.tag ?? 'usuario'), { ephemeral: true });
    return;
  }
  if (error instanceof CooldownError) {
    const embed = noPermissionEmbed(ctx.user?.tag ?? ctx.author?.tag ?? 'usuario');
    embed.embeds[0]
      .setTitle('⌛ Cooldown activo')
      .setDescription(error.publicMessage);
    await sendResponse(ctx, embed, { ephemeral: true });
    return;
  }
  if (error instanceof UserFacingError) {
    const embed = noPermissionEmbed(ctx.user?.tag ?? ctx.author?.tag ?? 'usuario');
    embed.embeds[0]
      .setTitle('⚠️ Aviso')
      .setDescription(error.publicMessage);
    await sendResponse(ctx, embed, { ephemeral: true });
    return;
  }
  logger.error('Error inesperado en guard:', error);
  const embed = noPermissionEmbed(ctx.user?.tag ?? ctx.author?.tag ?? 'usuario');
  embed.embeds[0]
    .setTitle('❌ Error')
    .setDescription('Ocurrió un error inesperado al procesar la acción.');
  await sendResponse(ctx, embed, { ephemeral: true });
}

export function guard(handler, options = {}) {
  const adminRoleId = options.adminRoleId ?? CONFIG.ADMIN_ROLE_ID;
  const cooldownMs = options.cooldownMs ?? 2_000;
  return async (ctx, ...rest) => {
    try {
      const userId = ctx.user?.id ?? ctx.author?.id;
      const member = await resolveMember(ctx, userId);
      if (!userIsAdmin(member, adminRoleId)) {
        throw new PermissionError();
      }
      if (cooldownMs > 0) {
        const { allowed, remainingMs } = checkCooldown(userId, handler.name, cooldownMs);
        if (!allowed) {
          throw new CooldownError(remainingMs);
        }
      }
      logger.flow('Ejecutando handler protegido', handler.name, 'para', userId);
      await handler(ctx, ...rest);
    } catch (error) {
      await sendError(ctx, error);
    }
  };
}
