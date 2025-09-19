import fs from 'node:fs';
import path from 'node:path';

const commandsPath = path.join(process.cwd(), 'commands');

const registerCommand = (registry, name, command) => {
  if (!name) {
    return;
  }
  const key = name.toLowerCase();
  if (registry.has(key)) {
    const existing = registry.get(key);
    // eslint-disable-next-line no-console
    console.warn(
      `Skipping duplicate command registration for "${key}" between "${existing.source}" and "${command.source}".`
    );
    return;
  }
  registry.set(key, command);
};

export const loadCommands = async () => {
  const files = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js') && file !== 'index.js');

  const commands = new Map();

  for (const file of files) {
    const filePath = path.join(commandsPath, file);
    const module = await import(filePath);
    const command = module.default;
    if (!command?.name || typeof command.execute !== 'function') {
      // eslint-disable-next-line no-continue
      continue;
    }

    const enhancedCommand = {
      aliases: [],
      description: '',
      usage: '',
      ...command,
      source: file,
    };

    registerCommand(commands, enhancedCommand.name, enhancedCommand);
    for (const alias of enhancedCommand.aliases ?? []) {
      registerCommand(commands, alias, enhancedCommand);
    }
  }

  return commands;
};
