export class AmnestyService {
  constructor({
    warnService,
    staffActionRepository,
    logger,
  }) {
    this.warnService = warnService;
    this.staffActionRepository = staffActionRepository;
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

}
