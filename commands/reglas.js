import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { hasAdminAccess } from '../utils/permissions.js';
import { resolveGifPath } from '../utils/media.js';
import { buildEmbedPayload } from '../utils/embed.js';
import { resolveTextChannel } from '../utils/channels.js';

export default {
  name: 'reglas',
  description: 'Publica el mensaje de reglas y verificación.',
  usage: ';reglas [#canal | canal_id]',
  aliases: [],
  async execute(message, args, { verificationService, helpService, config, logger }) {
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

    const reglasEmbed = verificationService.buildRulesEmbed();

    const menu = new StringSelectMenuBuilder()
      .setCustomId(config.HELP_MENU_ID)
      .setPlaceholder('Elige una pregunta de ayuda')
      .addOptions(helpService.buildHelpMenu());

    const helpRow = new ActionRowBuilder().addComponents(menu);
    const verifyButton = verificationService.createVerifyButton();
    const verifyRow = new ActionRowBuilder().addComponents(verifyButton);

    const gifPath = resolveGifPath(config.WELCOME_GIF);
    const payload = buildEmbedPayload(reglasEmbed, gifPath, config.BRAND_ICON, {
      components: [helpRow, verifyRow],
    });

    try {
      const sent = await targetChannel.send(payload);
      await verificationService.persistMessageId(sent.id);
      await message
        .reply({
          content: `Reglas publicadas en <#${targetChannel.id}>.`,
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    } catch (error) {
      logger.error('[RULES] No se pudo publicar el mensaje de reglas:', error);
      await message
        .reply({
          content: 'No se pudo publicar el mensaje de reglas. Intenta más tarde.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    }
  },
};
