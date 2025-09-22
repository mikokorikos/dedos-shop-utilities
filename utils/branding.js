import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { CONFIG } from '../config/config.js';
import { DEDOS_BRAND } from '../config/constants.js';

export function applyDedosBrand(embed) {
  return embed
    .setColor(DEDOS_BRAND.COLOR)
    .setAuthor(DEDOS_BRAND.AUTHOR)
    .setFooter({ text: DEDOS_BRAND.FOOTER_TEXT })
    .setImage(`attachment://${DEDOS_BRAND.GIF_NAME}`);
}

export function createBrandedEmbed(data = {}) {
  const embed = new EmbedBuilder(data);
  return applyDedosBrand(embed);
}

export function createDedosAttachment() {
  return new AttachmentBuilder(CONFIG.DEDOS_GIF_PATH, { name: DEDOS_BRAND.GIF_NAME });
}

export function withBranding(embed, options = {}) {
  const brandedEmbed = applyDedosBrand(embed instanceof EmbedBuilder ? embed : new EmbedBuilder(embed));
  return {
    embeds: [brandedEmbed],
    files: [createDedosAttachment()],
    ...options,
  };
}

export function noPermissionEmbed(userTag) {
  const embed = new EmbedBuilder()
    .setTitle('⛔ Permisos insuficientes')
    .setDescription(`Hola ${userTag}, no tienes permisos para usar este comando.`);
  return withBranding(embed);
}
