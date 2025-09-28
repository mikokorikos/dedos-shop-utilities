export async function sendCommandReply(ctx, payload, { ephemeral = false } = {}) {
  if ('reply' in ctx && typeof ctx.reply === 'function') {
    return ctx.reply({ ...payload, ephemeral });
  }
  if ('followUp' in ctx && typeof ctx.followUp === 'function') {
    return ctx.followUp({ ...payload, ephemeral });
  }
  if ('channel' in ctx && typeof ctx.channel?.send === 'function') {
    if (typeof ctx.reply === 'function') {
      return ctx.reply(payload);
    }
    return ctx.channel.send(payload);
  }
  throw new Error('No se pudo responder al comando');
}
