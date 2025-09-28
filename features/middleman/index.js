import { COMMAND_PREFIX } from '../../config/constants.js';
import { guard } from '../../utils/guard.js';
import {
  canExecuteCloseCommand,
  canExecuteMmCommand,
  handleCloseCommand,
  handleMiddlemanCommand,
  handleMiddlemanComponent,
  handleMmCommand,
  handleStandaloneMmStatsCommand,
  isMiddlemanComponent,
} from './logic.js';

export const middlemanFeature = {
  commands: [
    { type: 'slash', name: 'middleman', execute: guard(handleMiddlemanCommand) },
    { type: 'prefix', name: `${COMMAND_PREFIX}middleman`, execute: guard(handleMiddlemanCommand) },
    { type: 'slash', name: 'mm', execute: guard(handleMmCommand, { hasPermission: canExecuteMmCommand }) },
    { type: 'prefix', name: `${COMMAND_PREFIX}mm`, execute: guard(handleMmCommand, { hasPermission: canExecuteMmCommand }) },

    { type: 'slash', name: 'mmstats', execute: guard(handleStandaloneMmStatsCommand, { hasPermission: () => true }) },
    { type: 'prefix', name: `${COMMAND_PREFIX}mmstats`, execute: guard(handleStandaloneMmStatsCommand, { hasPermission: () => true }) },

    { type: 'slash', name: 'close', execute: guard(handleCloseCommand, { hasPermission: canExecuteCloseCommand }) },
    { type: 'prefix', name: `${COMMAND_PREFIX}close`, execute: guard(handleCloseCommand, { hasPermission: canExecuteCloseCommand }) },
  ],
  async onInteraction(interaction) {
    if (isMiddlemanComponent(interaction)) {
      await handleMiddlemanComponent(interaction);
      return true;
    }
    return false;
  },
};
