import { collectionToArray } from './helpers.js';

const cooldowns = new Map();

const keyFor = (userId, action) => `${userId}:${action}`;

export function checkCooldown(userId, action, cooldownMs) {
  if (!userId || !cooldownMs) return { allowed: true, remainingMs: 0 };
  const key = keyFor(userId, action);
  const now = Date.now();
  const expiresAt = cooldowns.get(key) ?? 0;
  if (expiresAt > now) {
    return { allowed: false, remainingMs: expiresAt - now };
  }
  cooldowns.set(key, now + cooldownMs);
  return { allowed: true, remainingMs: 0 };
}

export function clearCooldown(userId, action) {
  cooldowns.delete(keyFor(userId, action));
}

export function snapshotCooldowns() {
  return collectionToArray(cooldowns.entries());
}
