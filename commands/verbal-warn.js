import { hasModeratorAccess } from '../utils/permissions.js';
import { normalizeUserId } from '../utils/strings.js';

const usageMessage = (prefix) => `Uso: ${prefix}verbalwarn @usuario mensaje`;

export default {
  name: 'verbalwarn',
  description: 'Envía una advertencia verbal a un usuario sin registrarla en la base de datos.',
  usage: ';verbalwarn @usuario mensaje',
  aliases: ['verbal-warn'],
  async execute(message, args, { warnService, config }) {
    if (!hasModeratorAccess(message.member)) {
      await message
        .reply({
          content: 'Necesitas permisos de moderación para usar este comando.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (!args?.length) {
      await message
        .reply({
          content: usageMessage(config.COMMAND_PREFIX),
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const userId = normalizeUserId(args[0]);
    if (!userId) {
      await message
        .reply({
          content: 'Debes mencionar a un usuario válido.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    const reason = args.slice(1).join(' ').trim();
    if (!reason) {
      await message
        .reply({
          content: 'Debes escribir un mensaje para la advertencia verbal.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    let member;
    try {
      member = await message.guild.members.fetch(userId);
    } catch {
      member = null;
    }

    if (!member) {
      await message
        .reply({
          content: 'No pude encontrar a ese miembro en el servidor.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    if (member.user.bot) {
      await message
        .reply({
          content: 'No puedes advertir a un bot.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    await message
      .reply({
        content: `Advertencia verbal enviada a ${member}.`,
        allowedMentions: { repliedUser: false },
      })
      .catch(() => {});

    await warnService.sendWarnDm({
      member,
      reason,
      moderator: message.member,
      points: 0,
      isVerbal: true,
    });
  },
};
