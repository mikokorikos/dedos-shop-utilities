import dayjs from 'dayjs';
import { ENTITY_CONFIG, DEFAULT_PAGE_SIZE, deleteRecord, isSupportedEntity, listRecords, searchRecords } from '../../services/admin.repo.js';
import { parseUser } from '../../utils/helpers.js';
import { logger } from '../../utils/logger.js';
import {
  buildDbDeleteNotFound,
  buildDbDeleteSuccess,
  buildDbErrorEmbed,
  buildDbListEmbed,
  buildDbPageOutOfRangeEmbed,
  buildDbSearchEmbed,
  buildDbUsageEmbed,
} from './ui.js';

function isSlashCommand(ctx) {
  return typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand();
}

async function sendReply(ctx, payload, { ephemeral } = {}) {
  const defaultEphemeral = isSlashCommand(ctx);
  if ('reply' in ctx && typeof ctx.reply === 'function') {
    return ctx.reply({ ...payload, ephemeral: ephemeral ?? defaultEphemeral });
  }
  if ('followUp' in ctx && typeof ctx.followUp === 'function') {
    return ctx.followUp({ ...payload, ephemeral: ephemeral ?? defaultEphemeral });
  }
  if ('channel' in ctx && typeof ctx.channel?.send === 'function') {
    if (typeof ctx.reply === 'function') {
      return ctx.reply(payload);
    }
    return ctx.channel.send(payload);
  }
  throw new Error('Contexto no soportado para respuesta');
}

function formatDate(value) {
  if (!value) return 'N/A';
  return dayjs(value).format('DD/MM/YYYY HH:mm');
}

function truncate(text, max = 100) {
  if (!text) return 'Sin información';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

const ENTITY_FORMATTERS = {
  users: (row) =>
    `• <@${row.id}> — Roblox: ${row.roblox_id ?? 'N/A'} — Creado: ${formatDate(row.created_at)}`,
  middlemen: (row) => {
    const ratingCount = Number(row.rating_count ?? 0);
    const ratingSum = Number(row.rating_sum ?? 0);
    const ratingLabel = ratingCount > 0 ? `${(ratingSum / ratingCount).toFixed(2)}⭐ (${ratingCount})` : 'Sin reseñas';
    return `• <@${row.user_id}> — Roblox: ${row.roblox_username ?? 'N/A'} — Vouches: ${row.vouches_count ?? 0} — Rating: ${ratingLabel}`;
  },
  warns: (row) => {
    const moderator = row.moderator_id ? `<@${row.moderator_id}>` : 'N/A';
    const reason = truncate(row.reason ?? 'Sin motivo');
    return `• #${row.id} — Usuario: <@${row.user_id}> — Severidad: ${row.severity_name ?? 'sin dato'} — Moderador: ${moderator} — ${formatDate(row.created_at)} — Motivo: ${reason}`;
  },
  tickets: (row) => {
    const closed = row.closed_at ? ` — Cerrado: ${formatDate(row.closed_at)}` : '';
    const owner = row.owner_id ? `<@${row.owner_id}>` : 'N/A';
    const channel = row.channel_id ? `<#${row.channel_id}>` : 'N/A';
    return `• #${row.id} — Tipo: ${row.type} — Estado: ${row.status} — Dueño: ${owner} — Canal: ${channel} — Creado: ${formatDate(row.created_at)}${closed}`;
  },
};

function formatEntries(entity, rows) {
  const formatter = ENTITY_FORMATTERS[entity];
  if (!formatter) {
    return rows.map((row) => `• ${JSON.stringify(row)}`);
  }
  return rows.map((row) => formatter(row));
}

function normalizeEntity(value) {
  return value?.toLowerCase?.() ?? '';
}

function normalizeIdentifier(entity, value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (entity === 'users' || entity === 'middlemen') {
    return parseUser(trimmed) ?? trimmed;
  }
  return trimmed;
}

function computePageCount(total, pageSize = DEFAULT_PAGE_SIZE) {
  if (!total) return 0;
  return Math.ceil(total / pageSize);
}

function parseSlashInput(interaction) {
  if (!isSlashCommand(interaction)) {
    return { ok: false };
  }
  const sub = interaction.options.getSubcommand(false);
  const entity = normalizeEntity(interaction.options.getString('entidad'));
  if (!sub || !entity) {
    return { ok: false };
  }
  switch (sub) {
    case 'list': {
      const page = interaction.options.getInteger('pagina') ?? 1;
      return { ok: true, action: 'list', entity, page };
    }
    case 'search': {
      const query = interaction.options.getString('texto', true);
      const page = interaction.options.getInteger('pagina') ?? 1;
      return { ok: true, action: 'search', entity, query, page };
    }
    case 'delete': {
      const identifier = interaction.options.getString('identificador', true);
      return { ok: true, action: 'delete', entity, identifier };
    }
    default:
      return { ok: false };
  }
}

function parsePrefixInput(message) {
  const parts = message.content.trim().split(/\s+/);
  parts.shift();
  const [actionRaw, entityRaw, ...rest] = parts;
  const action = actionRaw?.toLowerCase?.();
  const entity = normalizeEntity(entityRaw);
  if (!action || !entity) {
    return { ok: false };
  }
  if (action === 'list') {
    const pageCandidate = rest[0];
    const page = pageCandidate && /^\d+$/.test(pageCandidate) ? Number.parseInt(pageCandidate, 10) : 1;
    return { ok: true, action, entity, page };
  }
  if (action === 'search') {
    if (!rest.length) {
      return { ok: false };
    }
    let page = 1;
    if (rest.length > 1 && /^\d+$/.test(rest[rest.length - 1])) {
      page = Number.parseInt(rest.pop(), 10);
    }
    const query = rest.join(' ');
    if (!query) {
      return { ok: false };
    }
    return { ok: true, action, entity, query, page };
  }
  if (action === 'delete') {
    const identifier = rest.join(' ');
    if (!identifier) {
      return { ok: false };
    }
    return { ok: true, action, entity, identifier };
  }
  return { ok: false };
}

function ensureValidQuery(query) {
  const sanitized = query.trim();
  if (sanitized.length < 2) {
    return { ok: false, error: 'La búsqueda debe tener al menos 2 caracteres.' };
  }
  if (sanitized.length > 100) {
    return { ok: false, error: 'La búsqueda es demasiado larga (máximo 100 caracteres).' };
  }
  return { ok: true, value: sanitized };
}

async function handleList(ctx, { entity, page }) {
  const config = ENTITY_CONFIG[entity];
  const result = await listRecords(entity, { page });
  const pageCount = computePageCount(result.total, result.pageSize);
  if ((pageCount > 0 && result.page > pageCount) || (pageCount === 0 && result.page > 1)) {
    const embed = buildDbPageOutOfRangeEmbed({ entityLabel: config.label, page: result.page, pageCount });
    await sendReply(ctx, embed);
    return;
  }
  const entries = formatEntries(entity, result.rows);
  const embed = buildDbListEmbed({
    entityLabel: config.label,
    page: result.page,
    pageCount,
    total: result.total,
    entries,
  });
  await sendReply(ctx, embed);
  logger.flow('Admin DB list', entity, 'page', result.page, 'executor', ctx.user?.id ?? ctx.author?.id);
}

async function handleSearch(ctx, { entity, query, page }) {
  const config = ENTITY_CONFIG[entity];
  const result = await searchRecords(entity, query, { page });
  const pageCount = computePageCount(result.total, result.pageSize);
  if ((pageCount > 0 && result.page > pageCount) || (pageCount === 0 && result.page > 1)) {
    const embed = buildDbPageOutOfRangeEmbed({ entityLabel: config.label, page: result.page, pageCount });
    await sendReply(ctx, embed);
    return;
  }
  const entries = formatEntries(entity, result.rows);
  const embed = buildDbSearchEmbed({
    entityLabel: config.label,
    query,
    page: result.page,
    pageCount,
    total: result.total,
    entries,
  });
  await sendReply(ctx, embed);
  logger.flow('Admin DB search', entity, 'query', query, 'page', result.page, 'executor', ctx.user?.id ?? ctx.author?.id);
}

async function handleDelete(ctx, { entity, identifier }) {
  const config = ENTITY_CONFIG[entity];
  const normalized = normalizeIdentifier(entity, identifier);
  if (!normalized) {
    const embed = buildDbErrorEmbed('No se pudo interpretar el identificador indicado.');
    await sendReply(ctx, embed);
    return;
  }
  const affected = await deleteRecord(entity, normalized);
  if (affected > 0) {
    const embed = buildDbDeleteSuccess({ entityLabel: config.label, identifier: normalized });
    await sendReply(ctx, embed, { ephemeral: true });
    logger.flow('Admin DB delete', entity, 'id', normalized, 'executor', ctx.user?.id ?? ctx.author?.id);
    return;
  }
  const embed = buildDbDeleteNotFound({ entityLabel: config.label, identifier: normalized });
  await sendReply(ctx, embed);
}

export async function handleDbCommand(ctx) {
  try {
    const parsed = isSlashCommand(ctx) ? parseSlashInput(ctx) : parsePrefixInput(ctx);
    if (!parsed.ok) {
      await sendReply(ctx, buildDbUsageEmbed());
      return;
    }
    if (!isSupportedEntity(parsed.entity)) {
      await sendReply(ctx, buildDbErrorEmbed('Entidad no soportada. Usa `users`, `middlemen`, `warns` o `tickets`.'));
      return;
    }
    if (parsed.action === 'list') {
      await handleList(ctx, parsed);
      return;
    }
    if (parsed.action === 'search') {
      const validation = ensureValidQuery(parsed.query);
      if (!validation.ok) {
        await sendReply(ctx, buildDbErrorEmbed(validation.error));
        return;
      }
      await handleSearch(ctx, { ...parsed, query: validation.value });
      return;
    }
    if (parsed.action === 'delete') {
      await handleDelete(ctx, parsed);
      return;
    }
    await sendReply(ctx, buildDbUsageEmbed());
  } catch (error) {
    logger.error('Error ejecutando comando admin DB', error);
    await sendReply(ctx, buildDbErrorEmbed('Ocurrió un error al procesar el comando. Inténtalo nuevamente.'));
  }
}
