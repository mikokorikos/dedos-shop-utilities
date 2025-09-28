import { EmbedBuilder } from 'discord.js';
import { applyDedosBrand, createDedosAttachment } from '../../utils/branding.js';

function formatRelativeTime(timestamp) {
  if (!timestamp) return null;
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const seconds = Math.floor(date.getTime() / 1000);
  return `<t:${seconds}:R>`;
}

export function buildMemberStatsMessage({ userTag, tradesCompleted, robloxUsername, partnerRobloxUsername, lastTradeAt }) {
  const lines = [
    `Miembro: ${userTag}`,
    `Trades completados: **${Math.max(0, tradesCompleted ?? 0)}**`,
    `Roblox registrado: \`${robloxUsername ?? 'Sin registro'}\``,
    `Último trade con: ${partnerRobloxUsername ? `\`${partnerRobloxUsername}\`` : 'Sin registro'}`,
  ];
  const relative = formatRelativeTime(lastTradeAt);
  if (relative) {
    lines.push(`Último cierre: ${relative}`);
  }
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('👥 Estadísticas del miembro')
      .setDescription(lines.join('\n'))
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}

export function buildMemberStatsEmpty({ userTag }) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('👥 Estadísticas del miembro')
      .setDescription(`${userTag} aún no registra trades completados con middleman.`)
  );
  return { embeds: [embed], files: [createDedosAttachment()], components: [] };
}
