import { hasAdminAccess } from '../utils/permissions.js';
import { resolveTextChannel } from '../utils/channels.js';

export default {
  name: 'tickets',
  description: 'Publica el panel para abrir tickets de soporte.',
  usage: ';tickets [#canal | canal_id]',
  aliases: [],
  async execute(message, args, { ticketService, logger }) {
    if (!hasAdminAccess(message.member)) {
      await message
        .reply({
          content: 'Necesitas permisos de administrador para usar este comando.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const targetChannel = args?.[0]
      ? await resolveTextChannel(message.guild, args[0])
      : message.channel;

    if (!targetChannel) {
      await message
        .reply({
          content: 'Selecciona un canal de texto válido (mención o ID).',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    try {
      const messagePayload = ticketService.buildPanelMessage();
      await targetChannel.send(messagePayload);
      await message
        .reply({
          content: `Panel de tickets publicado en <#${targetChannel.id}>.`,
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    } catch (error) {
      logger.error('[TICKETS] No se pudo publicar el panel:', error);
      await message
        .reply({
          content: 'No pude publicar el panel de tickets. Intenta más tarde.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    }
  },
};
