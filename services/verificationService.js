import fs from 'node:fs/promises';
import path from 'node:path';
import { EmbedBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { resolveGifPath } from '../utils/media.js';
import { buildEmbedPayload } from '../utils/embed.js';

const STATE_FILE = path.join(process.cwd(), 'config', 'state.json');

export class VerificationService {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.state = { verificationMessageId: config.VERIFICATION_MESSAGE_ID || null };
  }

  async init() {
    try {
      const raw = await fs.readFile(STATE_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data?.verificationMessageId) {
        this.state.verificationMessageId = data.verificationMessageId;
        this.logger.debug(`[VERIFY] Estado cargado desde ${STATE_FILE}.`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.warn(`[VERIFY] No se pudo leer ${STATE_FILE}: ${error.message}`);
      }
    }
  }

  get verificationMessageId() {
    return this.state.verificationMessageId || null;
  }

  async persistMessageId(messageId) {
    this.state.verificationMessageId = messageId || null;
    const payload = JSON.stringify(this.state, null, 2);
    try {
      await fs.writeFile(STATE_FILE, payload, 'utf8');
      this.logger.info(`[VERIFY] Mensaje de verificación actualizado (${messageId}).`);
    } catch (error) {
      this.logger.warn(`[VERIFY] No se pudo guardar ${STATE_FILE}: ${error.message}`);
    }
  }

  buildRulesEmbed() {
    return new EmbedBuilder()
      .setTitle('?? Reglas del Servidor')
      .setColor(0x5000ab)
      .setDescription(
        'Antes de participar en nuestra comunidad, asegúrate de leer cuidadosamente estas reglas. ' +
          'El cumplimiento garantiza una convivencia sana y una experiencia divertida para todos. ?'
      )
      .addFields(
        {
          name: '?? Reglas Generales',
          value:
            '**1. Respeto básico**\n' +
            '- Insultos casuales permitidos dentro del contexto de broma.\n' +
            '- Prohibido el acoso persistente, amenazas graves o ataques personales.\n' +
            '- Estrictamente prohibido el doxxing o compartir datos personales.\n\n' +
            '**2. Convivencia**\n' +
            '- Usa cada canal según su propósito.\n' +
            '- Respeta a moderadores y sus decisiones.\n' +
            '- Si surge un conflicto, resuélvelo en privado o pide mediación a un mod.',
        },
        {
          name: '?? Trading e Intercambios',
          value:
            '- Puedes tradear **cualquier ítem, cuenta o servicio gaming** en el canal de trading.\n' +
            '- **Trading con MM oficial:** protegido y regulado.\n' +
            '- **Trading directo:** bajo tu propio riesgo. No nos hacemos responsables de estafas.\n' +
            '- Prohibido el comercio de cuentas robadas o contenido ilegal.\n' +
            '- Para usar el MM oficial, contacta a un moderador.',
        },
        {
          name: '?? Contenido Prohibido',
          value:
            '**4. NSFW**\n' +
            '- Prohibido cualquier contenido sexual explícito, incluyendo avatares y nombres.\n\n' +
            '**5. Spam y Flood**\n' +
            '- No repitas mensajes ni hagas menciones masivas.\n' +
            '- Evita flood de imágenes, stickers o emojis.\n' +
            '- Máximo **5 mensajes seguidos** sin respuesta de otros.\n\n' +
            '**6. Contenido Malicioso**\n' +
            '- Prohibido compartir virus, malware, IP grabbers o links peligrosos.\n' +
            '- No publiques phishing o estafas. Reporta cualquier link sospechoso.',
        },
        {
          name: '?? Sistema de Sanciones',
          value:
            '- **1ra vez:** Advertencia verbal.\n' +
            '- **2da vez:** Timeout temporal (1–24h).\n' +
            '- **3ra vez:** Expulsión (Kick).\n' +
            '- **Casos graves:** Ban inmediato (ej. doxxing, malware, amenazas serias).',
        }
      )
      .setFooter({
        text: 'Básicamente: diviértete, comercia y sé respetuoso. No arruines la experiencia.',
      });
  }

  createVerifyButton() {
    return new ButtonBuilder()
      .setCustomId(this.config.VERIFY_BUTTON_ID || 'dedos_verify_me')
      .setLabel('Verificarme')
      .setStyle(ButtonStyle.Success);
  }

  async verify(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: 'Esta acción solo funciona dentro del servidor.',
        ephemeral: true,
      });
      return;
    }

    const roleId = this.config.VERIFIED_ROLE_ID;
    if (!roleId) {
      await interaction.reply({
        content: 'No hay un rol de verificación configurado. Contacta a un administrador.',
        ephemeral: true,
      });
      return;
    }

    let member = interaction.member;
    if (!member || !member.roles) {
      try {
        member = await guild.members.fetch(interaction.user.id);
      } catch (error) {
        this.logger.error(`[VERIFY] No se pudo obtener al miembro ${interaction.user.id}:`, error);
        await interaction.reply({
          content: 'No pude obtener tu información de miembro.',
          ephemeral: true,
        });
        return;
      }
    }

    if (member.roles.cache.has(roleId)) {
      await interaction.reply({
        content: 'Ya estás verificado. ¡Disfruta del servidor!',
        ephemeral: true,
      });
      return;
    }

    try {
      await member.roles.add(roleId, 'Verificación por botón');
      this.logger.info(`[VERIFY] Rol asignado a ${interaction.user.tag}.`);
    } catch (error) {
      this.logger.error(`[VERIFY] Error asignando rol a ${interaction.user.tag}:`, error);
      await interaction.reply({
        content: 'No pude asignarte el rol. Intenta nuevamente o contacta a un moderador.',
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5000ab)
      .setTitle('? ¡Verificación completada!')
      .setDescription(
        [`¡Gracias por verificarte, <@${member.id}>!`, 'Ya tienes acceso completo al servidor.', `Si necesitas ayuda, visita ${this.config.HELP_URL}.`].join('\n')
      )
      .setFooter({ text: `Bienvenido a ${this.config.GUILD_URL}`, iconURL: this.config.BRAND_ICON })
      .setTimestamp();

    const gifPath = resolveGifPath(this.config.WELCOME_GIF);
    const payload = buildEmbedPayload(embed, gifPath, this.config.WARN_GIF_URL, {
      content: this.config.GUILD_URL,
    });

    try {
      await interaction.user.send(payload);
    } catch (error) {
      this.logger.warn(
        `[VERIFY] No pude enviar el DM a ${interaction.user.tag}: ${error?.message || error}`
      );
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '¡Listo! Ya estás verificado. Revisa los canales desbloqueados.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '¡Listo! Ya estás verificado. Revisa los canales desbloqueados.',
        ephemeral: true,
      });
    }
  }
}
