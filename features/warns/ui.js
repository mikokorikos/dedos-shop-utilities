import { EmbedBuilder } from 'discord.js';
import dayjs from 'dayjs';
import { applyDedosBrand, createDedosAttachment } from '../../utils/branding.js';

function nextThresholdInfo(total, thresholds) {
  const upcoming = thresholds.find((threshold) => threshold.count > total);
  if (!upcoming) {
    const extra = total - thresholds[thresholds.length - 1].count;
    const duration = Math.max(1, extra) * 24;
    return `Sanción prevista: timeout de ${duration}h.`;
  }
  if (upcoming.action === 'timeout') {
    return `Próxima sanción: timeout de ${Math.round(upcoming.durationMs / (60 * 60 * 1000))}h al llegar a ${upcoming.count} warns.`;
  }
  if (upcoming.action === 'ban') {
    return `Próxima sanción: ban al llegar a ${upcoming.count} warns.`;
  }
  return 'Mantente atento a las reglas para evitar sanciones mayores.';
}

export function buildWarnAppliedEmbed({ target, moderator, reason, total, thresholds }) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('⚠️ Warn aplicado')
      .setDescription(`${target} recibió un warn.`)
      .addFields(
        { name: 'Moderador', value: moderator.toString(), inline: true },
        { name: 'Razón', value: reason, inline: false },
        { name: 'Total warns', value: String(total), inline: true },
        { name: 'Siguiente sanción', value: nextThresholdInfo(total, thresholds), inline: false }
      )
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildWarnDMEmbed({ guildName, reason, total, thresholds }) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle(`⚠️ Has recibido un warn en ${guildName}`)
      .setDescription(reason)
      .addFields(
        { name: 'Warns actuales', value: String(total), inline: true },
        { name: 'Próxima sanción', value: nextThresholdInfo(total, thresholds), inline: false }
      )
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildWarnListEmbed({ target, warns }) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle(`📋 Warns de ${target.displayName || target.user?.tag || target.tag}`)
      .setDescription(warns.length ? 'Listado de warns activos:' : 'No tiene warns registrados.')
  );
  if (warns.length) {
    for (const warn of warns.slice(0, 10)) {
      embed.addFields({
        name: `#${warn.id} — ${dayjs(warn.created_at).format('DD/MM/YYYY HH:mm')}`,
        value: warn.reason || 'Sin motivo especificado',
      });
    }
    if (warns.length > 10) {
      embed.addFields({ name: '...', value: `Hay ${warns.length - 10} warns adicionales.` });
    }
  }
  return { embeds: [embed], files: [createDedosAttachment()] };
}

export function buildWarnRemovedEmbed({ target, removed }) {
  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('✅ Warns removidos')
      .setDescription(`Se removieron ${removed} warn(s) de ${target}.`)
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}
