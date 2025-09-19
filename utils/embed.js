import { EmbedBuilder } from 'discord.js';

export const EMBED_GIF_FILENAME = 'dedosgif.gif';

export const buildEmbedPayload = (embed, gifPath, fallbackUrl, extra = {}) => {
  const payload = { embeds: [embed], ...extra };
  if (gifPath) {
    embed.setImage(`attachment://${EMBED_GIF_FILENAME}`);
    payload.files = [{ attachment: gifPath, name: EMBED_GIF_FILENAME }];
  } else if (fallbackUrl) {
    embed.setImage(fallbackUrl);
  }
  return payload;
};

export const safeEmbedDescription = (text, fallback = 'Sin información.') => {
  if (!text) return fallback;
  if (text.length <= 4096) return text;
  return `${text.slice(0, 4093)}...`;
};
