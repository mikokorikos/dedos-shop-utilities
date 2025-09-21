export default {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, context) {
    const { logger, ticketService, verificationService, helpService, config } = context;

    try {
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === config.HELP_MENU_ID) {
          const selection = interaction.values[0];
          const payload = helpService.buildResponse(
            selection,
            verificationService.verificationMessageId,
            interaction.guildId
          );
          if (!payload) {
            await interaction.reply({ content: 'No pude encontrar información para esa opción.', ephemeral: true });
            return;
          }
          await interaction.reply(payload);
          return;
        }

        if (interaction.customId === config.TICKET_SELECT_ID) {
          const optionId = interaction.values[0];
          const payload = ticketService.buildOptionResponse(optionId);
          if (!payload) {
            await interaction.reply({
              content: 'Esta opción ya no está disponible.',
              ephemeral: true,
            });
            return;
          }
          await interaction.reply(payload);
          return;
        }
      }

      if (interaction.isButton()) {
        if (interaction.customId === config.TICKET_CLOSE_BUTTON_ID) {
          await ticketService.closeTicket(interaction);
          return;
        }
        if (interaction.customId.startsWith(config.TICKET_BUTTON_PREFIX)) {
          const optionId = interaction.customId.slice(config.TICKET_BUTTON_PREFIX.length);
          await ticketService.openTicket(interaction, optionId);
          return;
        }
        if (interaction.customId === config.VERIFY_BUTTON_ID) {
          await verificationService.verify(interaction);
          return;
        }
      }
    } catch (error) {
      logger.error('[INTERACTION] Error procesando interacción:', error);
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: 'Ocurrió un error inesperado. Intenta más tarde.',
            ephemeral: true,
          }).catch(() => {});
        } else {
          await interaction.reply({
            content: 'Ocurrió un error inesperado. Intenta más tarde.',
            ephemeral: true,
          }).catch(() => {});
        }
      }
    }
  },
};
