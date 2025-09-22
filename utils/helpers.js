export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseUser(input) {
  if (!input) return null;
  const mentionMatch = /<@!?(\d+)>/.exec(input);
  if (mentionMatch) return mentionMatch[1];
  if (/^\d+$/.test(input)) return input;
  return null;
}

export function collectionToArray(iterable) {
  return Array.from(iterable);
}

export function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
