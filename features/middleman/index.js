import { COMMAND_PREFIX } from '../../config/constants.js';
import { guard } from '../../utils/guard.js';
import { handleMiddlemanCommand, handleMiddlemanComponent, isMiddlemanComponent } from './logic.js';

export const middlemanFeature = {
  commands: [
    { type: 'slash', name: 'middleman', execute: guard(handleMiddlemanCommand) },
    { type: 'prefix', name: `${COMMAND_PREFIX}middleman`, execute: guard(handleMiddlemanCommand) },
  ],
  async onInteraction(interaction) {
    if (isMiddlemanComponent(interaction)) {
      await handleMiddlemanComponent(interaction);
      return true;
    }
    return false;
  },
};
