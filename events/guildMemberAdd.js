export default {
  name: 'guildMemberAdd',
  once: false,
  async execute(member, { welcomeService, logger }) {
    const queued = welcomeService.enqueue(member);
    if (!queued) {
      logger.warn(`[WELCOME] No se pudo encolar el mensaje de bienvenida para ${member.user?.tag || member.id}.`);
    }
  },
};
