import { dispatchFeatureInteraction } from '../features/index.js';
import { withBranding } from '../utils/branding.js';
import { logger } from '../utils/logger.js';

export function createInteractionHandler({ slashCommands }) {
  return async function onInteraction(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const handler = slashCommands.get(interaction.commandName);
        if (!handler) return;
        await handler(interaction);
        return;
      }
      if (interaction.isStringSelectMenu() || interaction.isButton() || interaction.isModalSubmit()) {
        const handled = await dispatchFeatureInteraction(interaction);
        if (!handled && !interaction.replied) {
          await interaction.reply(
            withBranding({ title: 'ℹ️ Acción no disponible', description: 'Esta interacción no está disponible por ahora.' }, { ephemeral: true })
          );
        }
      }
    } catch (error) {
      logger.error('Fallo manejando interacción', error);
      if (!interaction.replied) {
        try {
          await interaction.reply(
            withBranding({ title: '❌ Error', description: 'Ocurrió un problema al procesar la interacción.' }, { ephemeral: true })
          );
        } catch (err) {
          logger.warn('No se pudo responder al error de interacción', err);
        }
      }
    }
  };
}
