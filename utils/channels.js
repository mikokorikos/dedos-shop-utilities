const sanitizeId = (value = '') => value.replace(/[^\d]/g, '');

export const resolveTextChannel = async (guild, reference) => {
  if (!guild || !reference) {
    return null;
  }

  const channelId = sanitizeId(reference);
  if (!channelId) {
    return null;
  }

  const cached = guild.channels.cache.get(channelId);
  const channel = cached || (await guild.channels.fetch(channelId).catch(() => null));

  if (!channel || typeof channel.isTextBased !== 'function' || !channel.isTextBased()) {
    return null;
  }

  return channel;
};

export const sanitizeChannelReference = sanitizeId;
