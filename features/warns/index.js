import { COMMAND_PREFIX } from '../../config/constants.js';
import { guard } from '../../utils/guard.js';
import { withBranding } from '../../utils/branding.js';
import { applyWarn, removeWarn, showWarns } from './logic.js';

async function handleWarnSlash(interaction) {
  const target = interaction.options.getMember('usuario');
  const reason = interaction.options.getString('motivo', true);
  if (!target) {
    await interaction.reply(withBranding({ title: '❌ Usuario no encontrado', description: 'No se encontró al usuario seleccionado.' }, { ephemeral: true }));
    return;
  }
  await applyWarn({ interaction, targetMember: target, reason });
}

async function handleRemoveWarnSlash(interaction) {
  const target = interaction.options.getMember('usuario');
  const amount = interaction.options.getInteger('cantidad', true);
  if (!target) {
    await interaction.reply(withBranding({ title: '❌ Usuario no encontrado', description: 'No se encontró al usuario seleccionado.' }, { ephemeral: true }));
    return;
  }
  await removeWarn({ interaction, targetMember: target, amount });
}

async function handleWarnsSlash(interaction) {
  const target = interaction.options.getMember('usuario');
  if (!target) {
    await interaction.reply(withBranding({ title: '❌ Usuario no encontrado', description: 'No se encontró al usuario seleccionado.' }, { ephemeral: true }));
    return;
  }
  await showWarns({ interaction, targetMember: target });
}

function parsePrefixArgs(message) {
  const parts = message.content.trim().split(/\s+/);
  return { command: parts[0]?.toLowerCase(), args: parts.slice(1) };
}

async function handleWarnPrefix(message) {
  const { args } = parsePrefixArgs(message);
  if (args.length < 2) {
    await message.reply('Uso: ;warn @usuario motivo');
    return;
  }
  const target = message.mentions.members.first() ?? (await message.guild.members.fetch(args[0]).catch(() => null));
  if (!target) {
    await message.reply(withBranding({ title: '❌ Usuario no encontrado', description: 'No se encontró al usuario.' }));
    return;
  }
  const reason = args.slice(1).join(' ');
  await applyWarn({ interaction: message, targetMember: target, reason });
}

async function handleRemoveWarnPrefix(message) {
  const { args } = parsePrefixArgs(message);
  if (args.length < 2) {
    await message.reply('Uso: ;removewarn @usuario cantidad');
    return;
  }
  const target = message.mentions.members.first() ?? (await message.guild.members.fetch(args[0]).catch(() => null));
  if (!target) {
    await message.reply(withBranding({ title: '❌ Usuario no encontrado', description: 'No se encontró al usuario.' }));
    return;
  }
  const amount = Number.parseInt(args[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    await message.reply(withBranding({ title: '⚠️ Cantidad inválida', description: 'La cantidad debe ser un número mayor a cero.' }));
    return;
  }
  await removeWarn({ interaction: message, targetMember: target, amount });
}

async function handleWarnsPrefix(message) {
  const { args } = parsePrefixArgs(message);
  if (args.length < 1) {
    await message.reply('Uso: ;warns @usuario');
    return;
  }
  const target = message.mentions.members.first() ?? (await message.guild.members.fetch(args[0]).catch(() => null));
  if (!target) {
    await message.reply(withBranding({ title: '❌ Usuario no encontrado', description: 'No se encontró al usuario.' }));
    return;
  }
  await showWarns({ interaction: message, targetMember: target });
}

export const warnsFeature = {
  commands: [
    { type: 'slash', name: 'warn', execute: guard(handleWarnSlash) },
    { type: 'slash', name: 'removewarn', execute: guard(handleRemoveWarnSlash) },
    { type: 'slash', name: 'warns', execute: guard(handleWarnsSlash) },
    { type: 'prefix', name: `${COMMAND_PREFIX}warn`, execute: guard(handleWarnPrefix) },
    { type: 'prefix', name: `${COMMAND_PREFIX}removewarn`, execute: guard(handleRemoveWarnPrefix) },
    { type: 'prefix', name: `${COMMAND_PREFIX}warns`, execute: guard(handleWarnsPrefix) },
  ],
};
