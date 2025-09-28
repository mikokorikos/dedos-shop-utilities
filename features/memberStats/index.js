import { COMMAND_PREFIX } from '../../config/constants.js';
import { guard } from '../../utils/guard.js';
import { handleMemberStatsCommand } from './logic.js';

export const memberStatsFeature = {
  commands: [
    { type: 'slash', name: 'stats', execute: guard(handleMemberStatsCommand, { hasPermission: () => true }) },
    { type: 'slash', name: 'ststs', execute: guard(handleMemberStatsCommand, { hasPermission: () => true }) },
    { type: 'prefix', name: `${COMMAND_PREFIX}stats`, execute: guard(handleMemberStatsCommand, { hasPermission: () => true }) },
    { type: 'prefix', name: `${COMMAND_PREFIX}ststs`, execute: guard(handleMemberStatsCommand, { hasPermission: () => true }) },
  ],
};
