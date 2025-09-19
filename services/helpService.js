import { EmbedBuilder } from 'discord.js';
import { resolveGifPath } from '../utils/media.js';
import { buildEmbedPayload } from '../utils/embed.js';

export class HelpService {
  constructor({ config }) {
    this.config = config;
  }

  buildHelpMenu() {
    return [
      { label: '¿Qué son los eventos?', value: 'eventos' },
      { label: '¿Qué se puede hacer en el servidor?', value: 'servidor' },
      { label: '¿Cómo verificarse?', value: 'verificacion' },
    ];
  }

  buildResponse(option, verificationMessageId, guildId) {
    let embed;
    if (option === 'eventos') {
      embed = new EmbedBuilder()
        .setTitle('Eventos y premios')
        .setDescription(
          'Los eventos son dinámicas especiales que premian a los usuarios más activos del servidor.\n\n' +
            '**Siempre hay eventos en curso.**\n\n' +
            'Para ver los eventos actuales:\n' +
            '- Revisa el canal de anuncios (desbloqueado tras verificarte).\n' +
            '- Encontrarás toda la información: reglas, fechas, cómo participar y premios.'
        )
        .setColor(0x5000ab);
    }

    if (option === 'servidor') {
      embed = new EmbedBuilder()
        .setTitle('¿Qué puedo hacer en el servidor?')
        .setDescription(
          'Estas son las principales actividades dentro del servidor:\n\n' +
            '- Participa en eventos y gana recompensas por tu actividad.\n' +
            '- Usa nuestro middleman oficial sin propinas obligatorias.\n' +
            '- Compra en la tienda con los mejores precios del mercado.\n' +
            '- Convive, tradea y aporta sugerencias para seguir creciendo.'
        )
        .setColor(0x5000ab);
    }

    if (option === 'verificacion') {
      const channelId = this.config.VERIFICATION_CHANNEL_ID;
      const enlace = verificationMessageId && channelId
        ? `https://discord.com/channels/${guildId}/${channelId}/${verificationMessageId}`
        : 'el mensaje de verificación (usa /reglas para volver a generarlo)';
      embed = new EmbedBuilder()
        .setTitle('Verificación')
        .setDescription(`Para verificarte, usa el botón del mensaje en ${enlace}.`)
        .setColor(0x5000ab);
    }

    if (!embed) return null;

    const gifPath = resolveGifPath(this.config.WELCOME_GIF);
    const payload = buildEmbedPayload(embed, gifPath, this.config.BRAND_ICON, {
      content: this.config.GUILD_URL,
      ephemeral: true,
    });
    return payload;
  }
}
