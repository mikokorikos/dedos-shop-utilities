import { EmbedBuilder } from 'discord.js';
import { resolveGifPath } from '../utils/media.js';
import { buildEmbedPayload } from '../utils/embed.js';

export class HelpService {
  constructor({ config }) {
    this.config = config;
  }

  buildHelpMenu() {
    return [
      { label: '¿Cómo verificarse?', value: 'verificacion' },
      { label: '¿Qué se puede hacer en el servidor?', value: 'servidor' },
      { label: '¿Cómo comprar?', value: 'compras' },
    ];
  }

  buildResponse(option, verificationMessageId, guildId) {
    let embed;
    if (option === 'servidor') {
      embed = new EmbedBuilder()
        .setTitle('¿Qué puedo hacer en el servidor?')
        .setDescription(
          'Estas son las principales actividades dentro del servidor:\n\n' +
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

    if (option === 'compras') {
      embed = new EmbedBuilder()
        .setTitle('Compras y soporte')
        .setDescription(
          'Nuestro equipo administra compras seguras dentro del servidor.\n\n' +
            '- Abre un ticket para iniciar una compra o solicitar soporte.\n' +
            '- Sigue las indicaciones del staff para completar tu pedido.\n' +
            '- Revisa los canales fijados para conocer precios y promociones vigentes.'
        )
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
