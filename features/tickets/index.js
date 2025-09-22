import { COMMAND_PREFIX, INTERACTION_IDS } from '../../config/constants.js';
import { guard } from '../../utils/guard.js';
import { handleTicketMenu, handleTicketPanelCommand } from './logic.js';

export const ticketsFeature = {
  commands: [
    { type: 'slash', name: 'tickets', execute: guard(handleTicketPanelCommand) },
    { type: 'prefix', name: `${COMMAND_PREFIX}tickets`, execute: guard(handleTicketPanelCommand) },
  ],
  async onInteraction(interaction) {
    if (interaction.customId === INTERACTION_IDS.TICKET_MENU) {
      await handleTicketMenu(interaction);
      return true;
    }
    return false;
  },
};
