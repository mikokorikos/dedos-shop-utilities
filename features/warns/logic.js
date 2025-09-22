import { Collection } from 'discord.js';
import { WARN_THRESHOLDS } from '../../config/constants.js';
import { addWarn, countWarns, listWarns, removeWarns } from '../../services/warns.repo.js';
import { ensureUser } from '../../services/users.repo.js';
import { RateLimitedQueue } from '../../utils/queue.js';
import { logger } from '../../utils/logger.js';
import { buildWarnAppliedEmbed, buildWarnDMEmbed, buildWarnListEmbed, buildWarnRemovedEmbed } from './ui.js';

const dmQueue = new RateLimitedQueue({ intervalMs: 1_000, concurrency: 1, maxSize: 100 });
dmQueue.start();

const getExecutorId = (interaction) => interaction.user?.id ?? interaction.author?.id;
const getExecutorMember = (interaction) => interaction.member ?? interaction.guild?.members?.cache?.get(getExecutorId(interaction));

function parseSeverity(reason) {
  if (!reason) return 'minor';
  const lowered = reason.toLowerCase();
  if (lowered.includes('#critical') || lowered.includes('!ban')) return 'critical';
  if (lowered.includes('#major')) return 'major';
  return 'minor';
}

function determineSanction(totalWarns, severity) {
  if (severity === 'critical') {
    return { action: 'ban' };
  }
  if (totalWarns > 18) {
    const extraDays = totalWarns - 18;
    return { action: 'timeout', durationMs: extraDays * 24 * 60 * 60 * 1000 };
  }
  const thresholds = [...WARN_THRESHOLDS].reverse();
  return thresholds.find((threshold) => totalWarns >= threshold.count) ?? null;
}

async function applySanction(member, sanction, reason) {
  if (!sanction) return null;
  try {
    if (sanction.action === 'timeout') {
      await member.timeout(sanction.durationMs, `Acumulación de warns: ${reason}`);
      return `Timeout aplicado por ${Math.round(sanction.durationMs / (60 * 60 * 1000))} horas.`;
    }
    if (sanction.action === 'ban') {
      await member.ban({ deleteMessageSeconds: 0, reason: `Warn crítico: ${reason}` });
      return 'Usuario baneado por caso crítico.';
    }
  } catch (error) {
    logger.error('No se pudo aplicar sanción automática', error);
    return 'No se pudo aplicar la sanción automática. Revisa permisos.';
  }
  return null;
}

async function sendWarnDM(user, payload) {
  dmQueue.push(async () => {
    try {
      await user.send({ ...payload, allowedMentions: { parse: [] } });
    } catch (error) {
      logger.warn('No se pudo enviar DM de warn', error.message);
    }
  });
}

export async function applyWarn({ interaction, targetMember, reason }) {
  const executorId = getExecutorId(interaction);
  await ensureUser(targetMember.id);
  await ensureUser(executorId);
  const severity = parseSeverity(reason);
  await addWarn({ userId: targetMember.id, moderatorId: executorId, reason, severity });
  const total = await countWarns(targetMember.id);
  const sanction = await applySanction(targetMember, determineSanction(total, severity), reason);
  const executorMember =
    getExecutorMember(interaction) ?? (targetMember.guild ? await targetMember.guild.members.fetch(executorId).catch(() => null) : null);
  const response = buildWarnAppliedEmbed({
    target: targetMember,
    moderator: executorMember ?? interaction.member ?? interaction.user,
    reason,
    total,
    thresholds: WARN_THRESHOLDS,
  });
  if (sanction) {
    response.embeds[0].addFields({ name: 'Sanción automática', value: sanction, inline: false });
  }
  await interaction.reply({ ...response, allowedMentions: { users: [targetMember.id] } });
  await sendWarnDM(targetMember.user, buildWarnDMEmbed({
    guildName: interaction.guild.name,
    reason,
    total,
    thresholds: WARN_THRESHOLDS,
  }));
  logger.info('Warn aplicado', targetMember.id, 'total', total);
}

export async function removeWarn({ interaction, targetMember, amount }) {
  const removed = await removeWarns(targetMember.id, amount);
  const embed = buildWarnRemovedEmbed({ target: targetMember, removed });
  await interaction.reply({ ...embed, allowedMentions: { users: [targetMember.id] } });
  logger.info('Warns removidos', targetMember.id, removed);
}

export async function showWarns({ interaction, targetMember }) {
  const warns = await listWarns(targetMember.id);
  const embed = buildWarnListEmbed({ target: targetMember, warns });
  await interaction.reply({ ...embed, ephemeral: true });
}
