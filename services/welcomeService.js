import { EmbedBuilder } from 'discord.js';
import { RateLimitedQueue } from './rateLimitedQueue.js';
import { resolveGifPath } from '../utils/media.js';
import { buildEmbedPayload } from '../utils/embed.js';

export class WelcomeService {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.queue = new RateLimitedQueue({
      intervalMs: config.WELCOME_RATE_MS,
      concurrency: config.WELCOME_CONCURRENCY,
      maxQueue: config.WELCOME_MAX_QUEUE,
      logger,
    });
  }

  start() {
    this.queue.start();
  }

  stop() {
    this.queue.stop();
  }

  enqueue(member) {
    if (!member) return false;
    return this.queue.push(() => this.#sendWelcome(member));
  }

  #buildWelcomeEmbed(member) {
    let authorName = this.config.GUILD_URL;
    try {
      authorName = new URL(this.config.GUILD_URL).host || this.config.GUILD_URL;
    } catch {
      // ignore invalid URL
    }

    const verificationLink = this.config.VERIFICATION_CHANNEL_ID
      ? `https://discord.com/channels/${member.guild.id}/${this.config.VERIFICATION_CHANNEL_ID}`
      : this.config.GUILD_URL;
    const inviteLink = this.config.INVITE_CHANNEL_ID
      ? `https://discord.com/channels/${member.guild.id}/${this.config.INVITE_CHANNEL_ID}`
      : this.config.GUILD_URL;

    const description = [
      `Hola <@${member.id}>, gracias por unirte ??`,
      `Ahora somos **${member.guild.memberCount}** miembros ??`,
      '',
      'Primero verifica para obtener acceso a los canales:',
      `[#verificación](${verificationLink}) - [#invitación](${inviteLink})`,
      '',
      'Revisa los canales fijados para conocer reglas y anuncios importantes.',
      'Más info: consulta el canal de información del servidor.',
      'Soporte: usa el canal de ayuda.',
      '',
      'Este servidor es de **trades, middleman y ventas**.',
      '',
      '¡Disfruta tu estancia y no olvides invitar a tus amigos! ??',
    ].join('\n');

    return new EmbedBuilder()
      .setColor(0x5000ab)
      .setTitle('¡Bienvenido a dedos!')
      .setAuthor({ name: authorName, iconURL: this.config.BRAND_ICON })
      .setDescription(description)
      .setFooter({
        text: `Gracias por unirte a ${this.config.GUILD_URL}`,
        iconURL: this.config.BRAND_ICON,
      });
  }

  async #sendWelcome(member) {
    try {
      const embed = this.#buildWelcomeEmbed(member);
      const gifPath = resolveGifPath(this.config.WELCOME_GIF);
      const payload = buildEmbedPayload(embed, gifPath, this.config.BRAND_ICON, {
        content: this.config.GUILD_URL,
      });
      await member.send(payload);
      this.logger.info(`[WELCOME] DM enviado a ${member.user?.tag || member.id}`);
    } catch (error) {
      this.logger.warn(
        `[WELCOME] No se pudo enviar el mensaje de bienvenida a ${member.user?.tag || member.id}: ${error?.message || error}`
      );
    }
  }
}
