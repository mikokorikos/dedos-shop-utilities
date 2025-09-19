export class AmnestyService {
  constructor({
    warnService,
    participantRepository,
    sanctionRepository,
    staffActionRepository,
    settingsService,
    logger,
  }) {
    this.warnService = warnService;
    this.participantRepository = participantRepository;
    this.sanctionRepository = sanctionRepository;
    this.staffActionRepository = staffActionRepository;
    this.settingsService = settingsService;
    this.logger = logger;
  }

  async removeWarnById({ guildId, warnId, moderatorId, reason }) {
    this.logger.info(`[AMNESTY] Solicitud para eliminar warn ${warnId} en ${guildId}.`);
    const removed = await this.warnService.removeWarnById({ guildId, warnId });
    if (!removed) {
      this.logger.warn(`[AMNESTY] Warn ${warnId} no encontrado en ${guildId}.`);
      return null;
    }
    await this.staffActionRepository.logAmnesty({
      guildId,
      moderatorId,
      userId: removed.user_id,
      action: 'remove_warn',
      reason: reason || null,
      reference: String(warnId),
    });
    return removed;
  }

  async removeLatestWarn({ guildId, userId, moderatorId, reason }) {
    this.logger.info(`[AMNESTY] Eliminando último warn de ${userId} en ${guildId}.`);
    const removed = await this.warnService.removeLatestWarn({ guildId, userId });
    if (!removed) {
      this.logger.warn(`[AMNESTY] No hay warns para ${userId} en ${guildId}.`);
      return null;
    }
    await this.staffActionRepository.logAmnesty({
      guildId,
      moderatorId,
      userId,
      action: 'remove_warn',
      reason: reason || null,
      reference: String(removed.id),
    });
    return removed;
  }

  async clearVerificationCounters({ guildId, userId, reasonKey, moderatorId, sessionId }) {
    const reason = reasonKey || null;
    this.logger.info(
      `[AMNESTY] Restableciendo contadores de verificación (${reason || 'todos'}) para ${userId}.`
    );
    await this.sanctionRepository.clearCounters({ guildId, userId, reason });
    if (sessionId) {
      await this.participantRepository.clearState({ sessionId, userId }).catch(() => {});
    }
    await this.staffActionRepository.logAmnesty({
      guildId,
      moderatorId,
      userId,
      action: reason ? 'remove_verification_warn' : 'reset_verification',
      reason,
      reference: sessionId ? `session:${sessionId}` : null,
    });
  }

  async unbanParticipant({ guildId, userId, moderatorId, sessionId }) {
    this.logger.info(`[AMNESTY] Levantando baneo de eventos para ${userId} en ${guildId}.`);
    await this.sanctionRepository.clearCounters({ guildId, userId });
    if (sessionId) {
      await this.participantRepository.clearState({ sessionId, userId }).catch(() => {});
    }
    await this.staffActionRepository.logAmnesty({
      guildId,
      moderatorId,
      userId,
      action: 'event_unban',
      reason: null,
      reference: sessionId ? `session:${sessionId}` : null,
    });
  }
}
