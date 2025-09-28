import { adminFeature } from './admin/index.js';
import { configFeature } from './config/index.js';
import { middlemanFeature } from './middleman/index.js';
import { memberStatsFeature } from './memberStats/index.js';
import { ticketsFeature } from './tickets/index.js';
import { warnsFeature } from './warns/index.js';
import { logger } from '../utils/logger.js';

export const FEATURES = [adminFeature, configFeature, middlemanFeature, memberStatsFeature, ticketsFeature, warnsFeature];

function registerCommand(map, command, type) {
  if (map.has(command.name)) {
    const message = `El comando ${type} "${command.name}" ya está registrado.`;
    logger.error(message);
    throw new Error(message);
  }
  map.set(command.name, command.execute);
}

export async function dispatchFeatureInteraction(interaction) {
  for (const feature of FEATURES) {
    if (typeof feature.onInteraction === 'function') {
      const handled = await feature.onInteraction(interaction);
      if (handled) return true;
    }
  }
  return false;
}

export function buildSlashCommandMap() {
  const map = new Map();
  for (const feature of FEATURES) {
    for (const command of feature.commands ?? []) {
      if (command.type === 'slash') {
        registerCommand(map, command, 'slash');
      }
    }
  }
  return map;
}

export function buildPrefixCommandMap() {
  const map = new Map();
  for (const feature of FEATURES) {
    for (const command of feature.commands ?? []) {
      if (command.type === 'prefix') {
        registerCommand(map, command, 'prefijo');
      }
    }
  }
  return map;
}
