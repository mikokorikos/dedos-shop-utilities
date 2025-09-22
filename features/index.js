import { middlemanFeature } from './middleman/index.js';
import { ticketsFeature } from './tickets/index.js';
import { warnsFeature } from './warns/index.js';

export const FEATURES = [middlemanFeature, ticketsFeature, warnsFeature];

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
        map.set(command.name, command.execute);
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
        map.set(command.name, command.execute);
      }
    }
  }
  return map;
}
