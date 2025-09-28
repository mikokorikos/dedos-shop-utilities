import { EmbedBuilder } from 'discord.js';
import { COMMAND_PREFIX } from '../../config/constants.js';
import { getRuntimeConfig, updateRuntimeConfig, getRuntimeConfigPath } from '../../config/runtimeConfig.js';
import { applyDedosBrand, createDedosAttachment } from '../../utils/branding.js';
import { logger } from '../../utils/logger.js';

function buildSummaryPayload(config) {
  const reviewsValue = config.reviewsChannel ? `<#${config.reviewsChannel}>` : 'No configurado';
  const description = [
    `• Canal de reseñas: ${reviewsValue}`,
    `• Archivo: \`${getRuntimeConfigPath()}\``,
  ].join('\n');
  const embed = applyDedosBrand(
    new EmbedBuilder().setTitle('⚙️ Configuración actual').setDescription(description)
  );
  return { embeds: [embed], files: [createDedosAttachment()] };
}

function buildSuccessPayload(message, config) {
  const header = applyDedosBrand(
    new EmbedBuilder().setTitle('✅ Configuración actualizada').setDescription(message)
  );
  const summary = buildSummaryPayload(config);
  return {
    embeds: [header, ...summary.embeds],
    files: [createDedosAttachment()],
  };
}

async function reply(ctx, payload, { ephemeral } = {}) {
  if ('reply' in ctx && typeof ctx.reply === 'function') {
    return ctx.reply({ ...payload, ephemeral: ephemeral ?? true });
  }
  if ('followUp' in ctx && typeof ctx.followUp === 'function') {
    return ctx.followUp({ ...payload, ephemeral: ephemeral ?? true });
  }
  if ('channel' in ctx && typeof ctx.channel?.send === 'function') {
    return ctx.reply?.(payload) ?? ctx.channel.send(payload);
  }
  throw new Error('Contexto de respuesta no soportado para comandos de configuración');
}

function parsePrefixArgs(message) {
  const parts = message.content.trim().split(/\s+/);
  const [, sub = null, key = null, ...rest] = parts;
  const value = rest.join(' ').trim();
  return { sub: sub?.toLowerCase() ?? null, key: key?.toLowerCase() ?? null, value };
}

function extractChannelId(value) {
  if (!value) return null;
  const mentionMatch = value.match(/<#(\d{17,20})>/);
  if (mentionMatch) {
    return mentionMatch[1];
  }
  const numericMatch = value.match(/^(\d{17,20})$/);
  if (numericMatch) {
    return numericMatch[1];
  }
  return null;
}

export async function handleConfigCommand(ctx) {
  const isSlash = 'isChatInputCommand' in ctx && typeof ctx.isChatInputCommand === 'function' && ctx.isChatInputCommand();
  if (isSlash) {
    const sub = ctx.options.getSubcommand();
    if (sub === 'get') {
      const config = await getRuntimeConfig();
      await reply(ctx, buildSummaryPayload(config), { ephemeral: true });
      return;
    }
    if (sub === 'set') {
      const channel = ctx.options.getChannel('reviews_channel');
      if (channel && !channel.isTextBased?.()) {
        const embed = applyDedosBrand(
          new EmbedBuilder().setTitle('❌ Canal inválido').setDescription('Selecciona un canal de texto para las reseñas.')
        );
        await reply(ctx, { embeds: [embed], files: [createDedosAttachment()] }, { ephemeral: true });
        return;
      }
      const updated = await updateRuntimeConfig({ reviewsChannel: channel?.id ?? null });
      logger.info('Configuración actualizada vía /config set', {
        executor: ctx.user?.id,
        reviewsChannel: updated.reviewsChannel,
      });
      const message = channel
        ? `El canal de reseñas ahora es ${channel}.`
        : 'Se eliminó la configuración de canal de reseñas.';
      await reply(ctx, buildSuccessPayload(message, updated), { ephemeral: true });
      return;
    }
    const usage = applyDedosBrand(
      new EmbedBuilder()
        .setTitle('Uso de /config')
        .setDescription('Subcomandos disponibles: `get`, `set reviews_channel:#canal`.')
    );
    await reply(ctx, { embeds: [usage], files: [createDedosAttachment()] }, { ephemeral: true });
    return;
  }

  const args = parsePrefixArgs(ctx);
  if (!args.sub || args.sub === 'help') {
    const embed = applyDedosBrand(
      new EmbedBuilder()
        .setTitle('ℹ️ Uso de configuración')
        .setDescription(
          [
            `\`${COMMAND_PREFIX}config get\``,
            `\`${COMMAND_PREFIX}config set reviewsChannel #canal\``,
          ].join('\n')
        )
    );
    await reply(ctx, { embeds: [embed], files: [createDedosAttachment()] }, { ephemeral: false });
    return;
  }

  if (args.sub === 'get') {
    const config = await getRuntimeConfig();
    await reply(ctx, buildSummaryPayload(config), { ephemeral: false });
    return;
  }

  if (args.sub === 'set') {
    if (!args.key || args.key !== 'reviewschannel') {
      const embed = applyDedosBrand(
        new EmbedBuilder()
          .setTitle('❌ Clave inválida')
          .setDescription('Solo puedes modificar `reviewsChannel`.')
      );
      await reply(ctx, { embeds: [embed], files: [createDedosAttachment()] }, { ephemeral: false });
      return;
    }
    const channelId = extractChannelId(args.value);
    if (args.value && !channelId) {
      const embed = applyDedosBrand(
        new EmbedBuilder()
          .setTitle('❌ Valor inválido')
          .setDescription('Debes mencionar un canal o proporcionar su ID.')
      );
      await reply(ctx, { embeds: [embed], files: [createDedosAttachment()] }, { ephemeral: false });
      return;
    }
    const updated = await updateRuntimeConfig({ reviewsChannel: channelId });
    logger.info('Configuración actualizada vía prefijo', {
      executor: ctx.author?.id,
      reviewsChannel: updated.reviewsChannel,
    });
    const channelMention = channelId ? `<#${channelId}>` : 'sin configurar';
    const message = channelId
      ? `El canal de reseñas ahora es ${channelMention}.`
      : 'Se eliminó la configuración de canal de reseñas.';
    await reply(ctx, buildSuccessPayload(message, updated), { ephemeral: false });
    return;
  }

  const embed = applyDedosBrand(
    new EmbedBuilder()
      .setTitle('❌ Subcomando desconocido')
      .setDescription(`Usa \`${COMMAND_PREFIX}config get\` o \`${COMMAND_PREFIX}config set reviewsChannel #canal\`.`)
  );
  await reply(ctx, { embeds: [embed], files: [createDedosAttachment()] }, { ephemeral: false });
}
