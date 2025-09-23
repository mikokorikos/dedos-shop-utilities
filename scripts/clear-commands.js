import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function main() {
  const clientId = process.env.CLIENT_ID;
  if (!clientId) {
    throw new Error('Falta CLIENT_ID en el entorno');
  }
  if (process.env.GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(clientId, process.env.GUILD_ID), { body: [] });
    console.log('✅ Comandos eliminados del servidor especificado.');
    return;
  }
  await rest.put(Routes.applicationCommands(clientId), { body: [] });
  console.log('✅ Comandos globales eliminados.');
}

main().catch((error) => {
  console.error('❌ Error eliminando comandos', error);
  process.exitCode = 1;
});
