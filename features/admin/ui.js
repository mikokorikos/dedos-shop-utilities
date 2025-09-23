import { EmbedBuilder } from 'discord.js';
import { applyDedosBrand, createDedosAttachment } from '../../utils/branding.js';

function withBrand(embed) {
  return { embeds: [applyDedosBrand(embed)], files: [createDedosAttachment()] };
}

export function buildDbUsageEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🛠️ Herramientas administrativas')
    .setDescription(
      [
        'Comandos disponibles:',
        '• `/db list <entidad> [página]` — Lista registros paginados.',
        '• `/db search <entidad> <texto>` — Busca coincidencias.',
        '• `/db delete <entidad> <id>` — Elimina un registro.',
        '• También puedes usar el prefijo `;db` con los mismos argumentos.',
        '',
        'Entidades soportadas: `users`, `middlemen`, `warns`, `tickets`.',
      ].join('\n')
    );
  return withBrand(embed);
}

export function buildDbListEmbed({ entityLabel, page, pageCount, total, entries }) {
  const embed = new EmbedBuilder()
    .setTitle(`📂 ${entityLabel} — página ${page}/${Math.max(pageCount, 1)}`)
    .setDescription(entries.length ? entries.join('\n') : 'No hay registros para mostrar.')
    .addFields({ name: 'Total', value: String(total), inline: true });
  return withBrand(embed);
}

export function buildDbSearchEmbed({ entityLabel, query, page, pageCount, total, entries }) {
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${entityLabel} — búsqueda: ${query}`)
    .setDescription(entries.length ? entries.join('\n') : 'No se encontraron coincidencias.')
    .addFields(
      { name: 'Resultados', value: String(total), inline: true },
      { name: 'Página', value: `${page}/${Math.max(pageCount, 1)}`, inline: true }
    );
  return withBrand(embed);
}

export function buildDbDeleteSuccess({ entityLabel, identifier }) {
  const embed = new EmbedBuilder()
    .setTitle('✅ Registro eliminado')
    .setDescription(`Se eliminó el registro **${identifier}** de ${entityLabel.toLowerCase()}.`);
  return withBrand(embed);
}

export function buildDbDeleteNotFound({ entityLabel, identifier }) {
  const embed = new EmbedBuilder()
    .setTitle('ℹ️ Nada que eliminar')
    .setDescription(`No se encontró el registro **${identifier}** en ${entityLabel.toLowerCase()}.`);
  return withBrand(embed);
}

export function buildDbErrorEmbed(message) {
  const embed = new EmbedBuilder().setTitle('❌ Error').setDescription(message);
  return withBrand(embed);
}

export function buildDbPageOutOfRangeEmbed({ entityLabel, page, pageCount }) {
  const embed = new EmbedBuilder()
    .setTitle('⚠️ Página no disponible')
    .setDescription(
      `Solo hay ${pageCount} página${pageCount === 1 ? '' : 's'} de ${entityLabel.toLowerCase()}. Intenta con un número menor.`
    )
    .addFields({ name: 'Página solicitada', value: String(page), inline: true });
  return withBrand(embed);
}
