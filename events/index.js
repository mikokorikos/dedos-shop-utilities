import fs from 'node:fs';
import path from 'node:path';

const eventsPath = path.join(process.cwd(), 'events');

export const loadEvents = async () => {
  const files = fs
    .readdirSync(eventsPath)
    .filter((file) => file.endsWith('.js') && file !== 'index.js');

  const events = [];

  for (const file of files) {
    const filePath = path.join(eventsPath, file);
    const module = await import(filePath);
    const event = module.default;
    if (!event?.name || typeof event.execute !== 'function') {
      // eslint-disable-next-line no-continue
      continue;
    }
    events.push(event);
  }

  return events;
};
