import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const commands = [
  new SlashCommandBuilder().setName('middleman').setDescription('Publicar panel de middleman (solo admin)'),
  new SlashCommandBuilder().setName('tickets').setDescription('Publicar panel de tickets (solo admin)'),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Aplicar warn a un usuario (solo admin)')
    .addUserOption((option) => option.setName('usuario').setDescription('Usuario a advertir').setRequired(true))
    .addStringOption((option) => option.setName('motivo').setDescription('Motivo de la advertencia').setRequired(true)),
  new SlashCommandBuilder()
    .setName('removewarn')
    .setDescription('Remover warns de un usuario (solo admin)')
    .addUserOption((option) => option.setName('usuario').setDescription('Usuario objetivo').setRequired(true))
    .addIntegerOption((option) => option.setName('cantidad').setDescription('Cantidad a remover').setRequired(true)),
  new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Ver warns de un usuario (solo admin)')
    .addUserOption((option) => option.setName('usuario').setDescription('Usuario objetivo').setRequired(true)),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function main() {
  const clientId = process.env.CLIENT_ID;
  if (!clientId) throw new Error('Falta CLIENT_ID en el entorno');
  if (process.env.GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(clientId, process.env.GUILD_ID), { body: commands });
    console.log('✅ Comandos registrados en el servidor especificado.');
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Comandos registrados globalmente.');
  }
}

main().catch((error) => {
  console.error('❌ Error registrando comandos', error);
  process.exitCode = 1;
});
