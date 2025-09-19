import { PermissionFlagsBits } from 'discord.js';
import { hasAdminAccess } from '../utils/permissions.js';

export default {
  name: 'evento',
  description: 'Publica el panel de un evento para que los usuarios se unan.',
  usage: ';evento',
  aliases: [],
  async execute(message, args, { eventService }) {
    if (args.length) {
      await message
        .reply({
          content: 'Este comando no acepta argumentos.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const member = message.member;
    const hasPermission =
      hasAdminAccess(member) || member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);

    if (!hasPermission) {
      await message
        .reply({
          content: 'Necesitas permisos de administración para publicar eventos.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    await eventService.publishEvent(message);
  },
};
