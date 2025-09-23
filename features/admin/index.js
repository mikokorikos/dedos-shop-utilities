import { COMMAND_PREFIX } from '../../config/constants.js';
import { guard } from '../../utils/guard.js';
import { handleDbCommand } from './logic.js';

export const adminFeature = {
  commands: [
    { type: 'slash', name: 'db', execute: guard(handleDbCommand, { cooldownMs: 10_000 }) },
    { type: 'prefix', name: `${COMMAND_PREFIX}db`, execute: guard(handleDbCommand, { cooldownMs: 10_000 }) },
  ],
};
