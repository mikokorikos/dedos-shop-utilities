import fs from 'node:fs';
import path from 'node:path';
import { sanitizeEnvValue } from './env.js';

let cachedGifPath = null;
let gifLookupAttempted = false;

export const resolveGifPath = (envValue) => {
  if (!gifLookupAttempted) {
    const candidates = [];
    const sanitized = sanitizeEnvValue(envValue);
    if (sanitized) candidates.push(sanitized);
    candidates.push(
      'dedosgif.gif',
      path.join(process.cwd(), 'dedosgif.gif'),
      path.join(process.cwd(), 'assets', 'dedosgif.gif'),
      'dedosgift.gif',
      path.join(process.cwd(), 'dedosgift.gif')
    );

    cachedGifPath = candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
    gifLookupAttempted = true;
  }
  return cachedGifPath;
};
