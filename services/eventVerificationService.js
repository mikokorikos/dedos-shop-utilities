import { EmbedBuilder } from 'discord.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';

export const VERIFICATION_ACTIONS = {
  NONE: 'none',
  REMINDER: 'reminder',
  WARNING: 'warning',
  EXPULSION: 'expulsion',
  PERMANENT_BAN: 'permanent_ban',
};

export const VERIFICATION_REASONS = {
  MISSING_TAG: 'missing_tag',
  MISSING_BIO: 'missing_bio',
};

export class EventVerificationService {
  constructor({
    config,
    logger,
    sessionRepository,
    participantRepository,
    sanctionRepository,
    verificationLogRepository,
    settingsService,
    eventService,
  }) {
    this.config = config;
    this.logger = logger;
    this.sessionRepository = sessionRepository;
    this.participantRepository = participantRepository;
    this.sanctionRepository = sanctionRepository;
    this.verificationLogRepository = verificationLogRepository;
    this.settingsService = settingsService;
    this.eventService = eventService;

    this.client = null;
    this.intervalHandle = null;
    this.gifPath = null;
  }

  attachClient(client) {
    this.client = client;
    this.gifPath = resolveGifPath(this.config.WELCOME_GIF);
    const intervalMinutes = Math.max(1, this.config.EVENT_VERIFICATION_INTERVAL_MINUTES || 60);
    this.#schedule(intervalMinutes);
  }

  async reloadInterval(minutes) {
    const value = Math.max(1, Number(minutes) || this.config.EVENT_VERIFICATION_INTERVAL_MINUTES || 60);
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
    this.#schedule(value);
    this.logger.info(`[VERIFY] Intervalo de chequeo actualizado a ${value} minuto(s).`);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  #schedule(minutes) {
    if (!this.client) return;
    const intervalMs = minutes * 60 * 1000;
    this.logger.info(`[VERIFY] Iniciando monitoreo cada ${minutes} minuto(s).`);
    this.intervalHandle = setInterval(() => {
      this.runChecks().catch((error) => {
        this.logger.error('[VERIFY] Error ejecutando chequeos periódicos:', error);
      });
    }, intervalMs);
    // Ejecutar la primera vez inmediatamente
    this.runChecks().catch((error) => {
      this.logger.error('[VERIFY] Error en chequeo inicial:', error);
    });
  }

  async runChecks() {
    if (!this.client) {
      this.logger.warn('[VERIFY] No hay cliente conectado para ejecutar chequeos.');
      return;
    }
    const sessions = await this.sessionRepository.listActiveSessions();
    if (!sessions.length) {
      this.logger.debug('[VERIFY] No hay sesiones activas para verificar.');
      return;
    }

    for (const session of sessions) {
      await this.#verifySession(session).catch((error) => {
        this.logger.error(`[#VERIFY] Error verificando sesión ${session.id}:`, error);
      });
    }
  }

  async #verifySession(sessionRow) {
    const guild = await this.client.guilds.fetch(sessionRow.guild_id).catch(() => null);
    if (!guild) {
      this.logger.warn(`[VERIFY] No se encontró el guild ${sessionRow.guild_id}.`);
      return;
    }

    const participants = await this.participantRepository.listForVerification(sessionRow.id);
    if (!participants.length) {
      this.logger.debug(`[VERIFY] Sin participantes activos en sesión ${sessionRow.id}.`);
      return;
    }

    const requiredTag = await this.settingsService.get(
      sessionRow.guild_id,
      'event.required_tag',
      this.config.EVENT_REQUIRED_TAG
    );
    const controlChannelId = await this.settingsService.get(
      sessionRow.guild_id,
      'event.control_channel_id',
      this.config.EVENT_VERIFICATION_CONTROL_CHANNEL_ID
    );

    for (const participant of participants) {
      await this.#verifyParticipant({
        guild,
        sessionId: sessionRow.id,
        participant,
        requiredTag,
        controlChannelId,
      }).catch((error) => {
      this.logger.error(`[#VERIFY] Error verificando ${participant.user_id}:`, error);
    });
  }
  }

  async #verifyParticipant({ guild, sessionId, participant, requiredTag, controlChannelId }) {
    const member = await guild.members.fetch(participant.user_id).catch(() => null);
    if (!member) {
      this.logger.warn(`[VERIFY] Usuario ${participant.user_id} ya no está en el servidor. Expulsando del evento.`);
      await this.participantRepository.markExpulsion({
        sessionId,
        userId: participant.user_id,
        reason: 'left_guild',
      });
      await this.verificationLogRepository.recordCheck({
        sessionId,
        guildId: guild.id,
        userId: participant.user_id,
        tagOk: false,
        bioOk: false,
        action: ACTIONS.EXPULSION,
        details: 'Miembro ya no pertenece al servidor',
      });
      await this.eventService.removeParticipantByUserId({ sessionId, userId: participant.user_id });
      return;
    }

    const check = await this.#evaluateMember(member, requiredTag);
    const action = await this.#decideAction({
      guildId: guild.id,
      participant,
      check,
    });

    await this.verificationLogRepository.recordCheck({
      sessionId,
      guildId: guild.id,
      userId: member.id,
      tagOk: check.tagOk,
      bioOk: check.bioOk,
      action: action.type,
      details: action.reason,
    });

    if (this.participantRepository?.enabled) {
      await this.participantRepository.updateLastCheck({ sessionId, userId: member.id });
    }

    if (action.type === VERIFICATION_ACTIONS.NONE) {
      this.logger.debug(`[VERIFY] ${member.user.tag} cumple con los requisitos.`);
      return;
    }

    await this.#applyAction({
      guild,
      member,
      sessionId,
      participant,
      action,
      controlChannelId,
    });
  }

  async #evaluateMember(member, requiredTag) {
    const nickname = member.nickname || member.user.globalName || member.user.username || '';
    const tagOk = requiredTag ? nickname.includes(requiredTag) : true;

    let bioText = '';
    try {
      const user = await member.user.fetch(true);
      bioText = user?.bio || '';
    } catch (error) {
      this.logger.warn(`[VERIFY] No se pudo obtener la biografía de ${member.id}: ${error?.message || error}`);
    }
    const bioOk = bioText.includes('https://discord.gg/dedos');

    return { tagOk, bioOk, bioText, nickname };
  }

  async #decideAction({ guildId, participant, check }) {
    const missingTag = !check.tagOk;
    const missingBio = !check.bioOk;

    if (!missingTag && !missingBio) {
      return { type: VERIFICATION_ACTIONS.NONE, reason: null };
    }

    const reason = missingTag ? VERIFICATION_REASONS.MISSING_TAG : VERIFICATION_REASONS.MISSING_BIO;
    const counter = this.sanctionRepository?.enabled
      ? await this.sanctionRepository.getCounter({
          guildId,
          userId: participant.user_id,
          reason,
        })
      : null;

    const reminders = Math.max(Number(counter?.reminders ?? 0), Number(participant.reminders_sent ?? 0));
    const warnings = Math.max(Number(counter?.warnings ?? 0), Number(participant.warnings_sent ?? 0));
    const expulsions = Math.max(Number(counter?.expulsions ?? 0), Number(participant.expulsions_count ?? 0));
    const isBanned = Boolean(counter?.permanent_ban_at);

    if (isBanned || expulsions >= 3) {
      return { type: VERIFICATION_ACTIONS.PERMANENT_BAN, reason };
    }

    if (reminders < 1) {
      return { type: VERIFICATION_ACTIONS.REMINDER, reason };
    }
    if (warnings < 1) {
      return { type: VERIFICATION_ACTIONS.WARNING, reason };
    }
    if (expulsions < 3) {
      return { type: VERIFICATION_ACTIONS.EXPULSION, reason };
    }

    return { type: VERIFICATION_ACTIONS.PERMANENT_BAN, reason };
  }

  async #applyAction({ guild, member, sessionId, participant, action, controlChannelId }) {
    const roleId = this.config.EVENT_ROLE_ID;
    const reason = action.reason;

    switch (action.type) {
      case VERIFICATION_ACTIONS.REMINDER:
        if (this.participantRepository?.enabled) {
          await this.participantRepository.markReminder({ sessionId, userId: member.id, reason });
        }
        if (this.sanctionRepository?.enabled) {
          await this.sanctionRepository.increment({
            guildId: guild.id,
            userId: member.id,
            reason,
            action: 'reminder',
          });
        }
        await this.#notify({
          guild,
          member,
          action: VERIFICATION_ACTIONS.REMINDER,
          reason,
          controlChannelId,
        });
        break;
      case VERIFICATION_ACTIONS.WARNING:
        if (this.participantRepository?.enabled) {
          await this.participantRepository.markWarning({ sessionId, userId: member.id, reason });
        }
        if (this.sanctionRepository?.enabled) {
          await this.sanctionRepository.increment({
            guildId: guild.id,
            userId: member.id,
            reason,
            action: 'warning',
          });
        }
        await this.#notify({
          guild,
          member,
          action: VERIFICATION_ACTIONS.WARNING,
          reason,
          controlChannelId,
        });
        break;
      case VERIFICATION_ACTIONS.EXPULSION:
        if (this.participantRepository?.enabled) {
          await this.participantRepository.markExpulsion({ sessionId, userId: member.id, reason });
        }
        if (this.sanctionRepository?.enabled) {
          await this.sanctionRepository.increment({
            guildId: guild.id,
            userId: member.id,
            reason,
            action: 'expulsion',
          });
        }
        await this.#removeEventRole(member, roleId);
        await this.eventService.removeParticipantByUserId({ sessionId, userId: member.id });
        await this.#notify({
          guild,
          member,
          action: VERIFICATION_ACTIONS.EXPULSION,
          reason,
          controlChannelId,
        });
        break;
      case VERIFICATION_ACTIONS.PERMANENT_BAN:
        if (this.participantRepository?.enabled) {
          await this.participantRepository.markPermanentBan({ sessionId, userId: member.id, reason });
        }
        if (this.sanctionRepository?.enabled) {
          await this.sanctionRepository.markPermanentBan({
            guildId: guild.id,
            userId: member.id,
            reason,
          });
        }
        await this.#removeEventRole(member, roleId);
        await this.eventService.removeParticipantByUserId({ sessionId, userId: member.id });
        await this.#notify({
          guild,
          member,
          action: VERIFICATION_ACTIONS.PERMANENT_BAN,
          reason,
          controlChannelId,
        });
        break;
      default:
        this.logger.debug(`[VERIFY] Acción no reconocida ${action.type}.`);
    }
  }

  async #removeEventRole(member, roleId) {
    if (!roleId) return;
    if (!member.roles?.cache?.has(roleId)) return;
    try {
      await member.roles.remove(roleId, 'Verificación de evento');
      this.logger.info(`[VERIFY] Rol de evento removido a ${member.id}.`);
    } catch (error) {
      this.logger.error(`[VERIFY] No se pudo quitar el rol del evento a ${member.id}:`, error);
    }
  }

  async #notify({ guild, member, action, reason, controlChannelId }) {
    const titles = {
      [VERIFICATION_ACTIONS.REMINDER]: 'Recordatorio de verificación',
      [VERIFICATION_ACTIONS.WARNING]: 'Advertencia de verificación',
      [VERIFICATION_ACTIONS.EXPULSION]: 'Expulsión del evento',
      [VERIFICATION_ACTIONS.PERMANENT_BAN]: 'Baneo permanente de eventos',
    };

    const actionLabels = {
      [VERIFICATION_ACTIONS.REMINDER]: 'Recordatorio',
      [VERIFICATION_ACTIONS.WARNING]: 'Advertencia',
      [VERIFICATION_ACTIONS.EXPULSION]: 'Expulsión',
      [VERIFICATION_ACTIONS.PERMANENT_BAN]: 'Baneo permanente',
    };

    const descriptions = {
      [VERIFICATION_REASONS.MISSING_TAG]: 'Debes mantener la etiqueta oficial del servidor en tu nombre.',
      [VERIFICATION_REASONS.MISSING_BIO]: 'Tu biografía debe incluir el enlace https://discord.gg/dedos.',
      left_guild: 'El miembro ya no se encuentra en el servidor.',
    };

    const embed = new EmbedBuilder()
      .setColor(this.config.WARN_EMBED_COLOR)
      .setTitle(titles[action] || 'Actualización de evento')
      .setDescription(descriptions[reason] || 'Debes cumplir con los requisitos del evento.')
      .addFields({ name: 'Usuario', value: `<@${member.id}>`, inline: true })
      .addFields({ name: 'Acción', value: actionLabels[action] || action, inline: true })
      .setFooter({ text: guild.name, iconURL: guild.iconURL() || undefined })
      .setTimestamp();

    const payload = buildEmbedPayload(embed, this.gifPath, this.config.WARN_GIF_URL, {
      allowedMentions: { users: [member.id] },
    });

    await this.#sendDm(member, payload, action);
    if (controlChannelId) {
      await this.#sendToChannel(guild, controlChannelId, payload, action);
    }
  }

  async #sendDm(member, payload, action) {
    try {
      this.logger.info(`[VERIFY] Enviando DM (${action}) a ${member.id}.`);
      await member.send(payload);
    } catch (error) {
      this.logger.warn(`[VERIFY] No se pudo enviar DM a ${member.id}: ${error?.message || error}`);
    }
  }

  async #sendToChannel(guild, channelId, payload, action) {
    try {
      const channel = await guild.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        this.logger.warn(`[VERIFY] Canal ${channelId} no disponible para logs.`);
        return;
      }
      this.logger.info(`[VERIFY] Publicando ${action} en canal ${channelId}.`);
      await channel.send(payload);
    } catch (error) {
      this.logger.error(`[VERIFY] Error enviando notificación a canal ${channelId}:`, error);
    }
  }
}
