import { COMMAND_PREFIX } from '../../config/constants.js';
import { guard } from '../../utils/guard.js';
import { handleConfigCommand } from './logic.js';

export const configFeature = {
  commands: [
    { type: 'slash', name: 'config', execute: guard(handleConfigCommand) },
    { type: 'prefix', name: `${COMMAND_PREFIX}config`, execute: guard(handleConfigCommand) },
  ],
};
