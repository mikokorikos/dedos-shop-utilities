import dayjs from 'dayjs';
import { logger } from './logger.js';

const BASE_URL = 'https://users.roblox.com/v1';

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`Roblox API error ${res.status}`);
  }
  return res.json();
}

export async function resolveRobloxUser(username) {
  const body = { usernames: [username], excludeBannedUsers: true };
  const data = await fetchJson(`${BASE_URL}/usernames/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const [user] = data?.data ?? [];
  if (!user) {
    return null;
  }
  const detail = await fetchJson(`${BASE_URL}/users/${user.id}`);
  const createdAt = dayjs(detail.created);
  const ageDays = dayjs().diff(createdAt, 'day');
  return {
    id: user.id,
    name: user.requestedUsername,
    createdAt,
    ageDays,
    isYoungerThanYear: ageDays < 365,
  };
}

export async function assertRobloxUser(username) {
  try {
    const user = await resolveRobloxUser(username);
    if (!user) {
      return { exists: false };
    }
    return { exists: true, user };
  } catch (error) {
    logger.warn('Fallo consultando Roblox API', error);
    return { exists: false, error };
  }
}
