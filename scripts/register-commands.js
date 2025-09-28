import 'dotenv/config';
import { ChannelType, REST, Routes, SlashCommandBuilder } from 'discord.js';

const ENTITY_CHOICES = [
  { name: 'Usuarios', value: 'users' },
  { name: 'Middlemans', value: 'middlemen' },
  { name: 'Warns', value: 'warns' },
  { name: 'Tickets', value: 'tickets' },
];

const commandBuilders = [
  new SlashCommandBuilder().setName('middleman').setDescription('Publicar panel de middleman (solo admin)'),
  new SlashCommandBuilder().setName('tickets').setDescription('Publicar panel de tickets (solo admin)'),
  new SlashCommandBuilder()
    .setName('mm')
    .setDescription('Administrar middlemans (solo admin)')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Registrar o actualizar a un middleman')
        .addUserOption((option) => option.setName('usuario').setDescription('Usuario a registrar').setRequired(true))
        .addStringOption((option) =>
          option.setName('roblox_username').setDescription('Usuario de Roblox').setMinLength(3).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Actualizar datos de un middleman')
        .addUserOption((option) => option.setName('usuario').setDescription('Usuario a actualizar').setRequired(true))
        .addStringOption((option) =>
          option.setName('roblox_username').setDescription('Nuevo usuario de Roblox (opcional)').setMinLength(3).setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('stats')
        .setDescription('Ver estadísticas de un middleman')
        .addUserOption((option) => option.setName('usuario').setDescription('Usuario a consultar').setRequired(false))
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Listar top middlemans por vouches'))
    .addSubcommand((sub) => sub.setName('closeforce').setDescription('Cerrar trade sin esperar reseñas (solo reclamante/admin)')),
  new SlashCommandBuilder()
    .setName('mmstats')
    .setDescription('Consultar estadísticas de un middleman')
    .addUserOption((option) => option.setName('usuario').setDescription('Middleman a consultar').setRequired(false)),
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Iniciar el cierre del trade actual (solo middleman asignado)'),
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Administrar configuración del bot (solo admin)')
    .addSubcommand((sub) => sub.setName('get').setDescription('Mostrar configuración activa'))
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Actualizar valores configurables')
        .addChannelOption((option) =>
          option
            .setName('reviews_channel')
            .setDescription('Canal donde se publicarán las reseñas del middleman')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Ver estadísticas de trade de un miembro')
    .addUserOption((option) => option.setName('usuario').setDescription('Usuario a consultar').setRequired(false)),
  new SlashCommandBuilder()
    .setName('ststs')
    .setDescription('Alias para estadísticas de miembros')
    .addUserOption((option) => option.setName('usuario').setDescription('Usuario a consultar').setRequired(false)),
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
  new SlashCommandBuilder()
    .setName('db')
    .setDescription('Herramientas administrativas de base de datos (solo admin)')
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Listar registros paginados de una entidad')
        .addStringOption((option) =>
          option.setName('entidad').setDescription('Entidad a consultar').setRequired(true).addChoices(...ENTITY_CHOICES)
        )
        .addIntegerOption((option) => option.setName('pagina').setDescription('Página a consultar').setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('search')
        .setDescription('Buscar registros de una entidad')
        .addStringOption((option) =>
          option.setName('entidad').setDescription('Entidad a consultar').setRequired(true).addChoices(...ENTITY_CHOICES)
        )
        .addStringOption((option) =>
          option
            .setName('texto')
            .setDescription('Texto a buscar')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(100)
        )
        .addIntegerOption((option) => option.setName('pagina').setDescription('Página a consultar').setMinValue(1))
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Eliminar un registro de una entidad')
        .addStringOption((option) =>
          option.setName('entidad').setDescription('Entidad objetivo').setRequired(true).addChoices(...ENTITY_CHOICES)
        )
        .addStringOption((option) =>
          option
            .setName('identificador')
            .setDescription('ID del registro o usuario a eliminar')
            .setRequired(true)
        )
    ),
];

const commands = commandBuilders.map((command) => command.toJSON());

function assertUniqueCommandNames(list) {
  const seen = new Set();
  for (const command of list) {
    if (seen.has(command.name)) {
      throw new Error(`Comando duplicado detectado: ${command.name}`);
    }
    seen.add(command.name);
  }
}

assertUniqueCommandNames(commands);

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
