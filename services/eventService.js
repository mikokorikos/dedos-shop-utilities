import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildEmbedPayload, EMBED_GIF_FILENAME } from '../utils/embed.js';
import { resolveGifPath } from '../utils/media.js';
import { parseSqlDate } from '../utils/time.js';

const EVENT_EMBED_TEMPLATE = {
  title: 'EVENTO DE MENSAJES : <:79071starrymoon:1417433441825325147>',
  description:
    'El servidor está por cumplir 2 semanas desde su creación ?? y queremos celebrar con un **evento de actividad** donde habrá **3 ganadores**.',
  color: 7602431,
  footer: {
    text: 'Es obligatorio que sigas las instrucciones y reglas del servidor.',
    iconURL:
      'https://cdn.discordapp.com/attachments/1415232274156228620/1417752136342573176/IMG_2716.jpg',
  },
  author: {
    name: '.gg/dedos',
    url: 'https://discord.gg/dedos',
    iconURL:
      'https://cdn.discordapp.com/attachments/1415232274156228620/1417752136342573176/IMG_2716.jpg',
  },
  image: {
    url: 'https://message.style/cdn/images/b6b34048e6b8e4f2d6931af81a6935dbeb06d1d1a619dcf353733ab75bbcca8c.gif',
  },
  fields: [
    { name: 'Primer Lugar', value: '1000 Robux <:9073robux:1417021867167846420>', inline: true },
    { name: 'Segundo Lugar', value: '500 Robux <:9073robux:1417021867167846420>', inline: true },
    { name: 'Tercer Lugar', value: '200 Robux <:9073robux:1417021867167846420>', inline: true },
  ],
};

const buildReminderKey = (guildId, userId) => `${guildId}:${userId}`;

export class EventService {
  constructor({
    config,
    logger,
    db,
    sessionRepository,
    participantRepository,
    sanctionRepository,
    settingsService,
  }) {
    this.config = config;
    this.logger = logger;
    this.db = db;
    this.sessionRepository = sessionRepository;
    this.participantRepository = participantRepository;
    this.sanctionRepository = sanctionRepository;
    this.settingsService = settingsService;
    this.eventMessageState = new Map();
    this.eventReminderState = new Map();
    this.reminderRoleWarningLogged = false;
    this.reminderChannelWarningLogged = false;
    this.gifPath = null;
    this.client = null;
    this.messageSessionMap = new Map();
    this.sessionIndex = new Map();
  }

  resolveSessionName() {
    if (this.config.EVENT_SESSION_NAME) {
      return this.config.EVENT_SESSION_NAME;
    }
    const now = new Date();
    return `Evento ${now.toLocaleDateString('es-ES')}`;
  }

  async init(client) {
    this.client = client;
    this.gifPath = resolveGifPath(this.config.WELCOME_GIF);

    if (!this.sessionRepository?.enabled) {
      return;
    }

    const sessions = await this.sessionRepository.listActiveSessions();
    for (const session of sessions) {
      this.#cacheSessionReference({
        sessionId: session.id,
        guildId: session.guild_id,
        channelId: session.channel_id,
        messageId: session.message_id,
      });

      if (!session.message_id || !session.channel_id) {
        continue;
      }

      const message = await this.#fetchSessionMessage(session).catch((error) => {
        this.logger.warn(
          `[EVENT] No se pudo recuperar el mensaje ${session.message_id} para la sesión ${session.id}: ${error?.message || error}`
        );
        return null;
      });

      if (!message) {
        continue;
      }

      const state = this.#getEventStateForMessage(message, session.id);

      if (state.joinedIds.size === 0 && this.participantRepository) {
        const participants = await this.participantRepository
          .listCurrentParticipants(session.id)
          .catch(() => []);
        for (const userId of participants) {
          state.joinedIds.add(userId);
        }
        if (participants.length) {
          await this.#refreshEventMessage(message, state).catch(() => {});
        }
      }
    }
  }

  async getActiveSession(guildId) {
    if (!this.sessionRepository?.enabled) return null;
    return this.sessionRepository.findActiveSession(guildId);
  }

  buildEventEmbed({ joinedUserIds = [], useAttachment = false } = {}) {
    const embed = new EmbedBuilder()
      .setTitle(EVENT_EMBED_TEMPLATE.title)
      .setColor(EVENT_EMBED_TEMPLATE.color)
      .setDescription(EVENT_EMBED_TEMPLATE.description)
      .setFooter(EVENT_EMBED_TEMPLATE.footer)
      .setAuthor(EVENT_EMBED_TEMPLATE.author)
      .addFields(...EVENT_EMBED_TEMPLATE.fields)
      .setTimestamp();

    if (useAttachment) {
      embed.setImage(`attachment://${EMBED_GIF_FILENAME}`);
    } else if (EVENT_EMBED_TEMPLATE.image?.url) {
      embed.setImage(EVENT_EMBED_TEMPLATE.image.url);
    }

    const uniqueIds = Array.from(new Set(joinedUserIds));
    if (uniqueIds.length) {
      const mentions = uniqueIds.slice(0, 20).map((id) => `<@${id}>`);
      let value = mentions.join('\n');
      if (uniqueIds.length > mentions.length) {
        value += `\n... y ${uniqueIds.length - mentions.length} más`;
      }
      embed.addFields({ name: `Participantes (${uniqueIds.length})`, value });
    }

    return embed;
  }

  async #fetchSessionMessage(sessionInfo) {
    if (!this.client) return null;
    try {
      const guildId = sessionInfo.guild_id || sessionInfo.guildId;
      const channelId = sessionInfo.channel_id || sessionInfo.channelId;
      const messageId = sessionInfo.message_id || sessionInfo.messageId;

      const guild =
        this.client.guilds.cache.get(guildId) ||
        (await this.client.guilds.fetch(guildId));
      const channel = await guild.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return null;
      }
      return await channel.messages.fetch(messageId);
    } catch (error) {
      this.logger.warn(
        `[EVENT] No se pudo recuperar el mensaje ${(sessionInfo.message_id || sessionInfo.messageId) ?? 'desconocido'}: ${error?.message || error}`
      );
      return null;
    }
  }

  async #refreshEventMessage(message, state) {
    const updatedEmbed = this.buildEventEmbed({
      joinedUserIds: Array.from(state.joinedIds),
      useAttachment: state.useAttachment,
    });
    try {
      await message.edit({ embeds: [updatedEmbed] });
    } catch (error) {
      this.logger.warn('[EVENT] No se pudo actualizar el panel del evento:', error);
    }
  }

  async #disableJoinButton(message) {
    if (!message?.components?.length) {
      return;
    }

    try {
      const newRows = message.components.map((row) => {
        const builder = new ActionRowBuilder();
        for (const component of row.components) {
          if (component.type === 2) {
            const cloned = ButtonBuilder.from(component);
            if (component.customId === this.config.EVENT_JOIN_BUTTON_ID) {
              cloned.setDisabled(true);
            }
            builder.addComponents(cloned);
          }
        }
        return builder;
      });
      await message.edit({ components: newRows });
    } catch (error) {
      this.logger.warn('[EVENT] No se pudo deshabilitar el botón de unión:', error);
    }
  }

  #cacheSessionReference({ sessionId, guildId, channelId, messageId, useAttachment }) {
    if (!sessionId || !messageId) return;
    this.sessionIndex.set(sessionId, { guildId, channelId, messageId, useAttachment: Boolean(useAttachment) });
    this.messageSessionMap.set(messageId, sessionId);
  }

  #getEventStateForMessage(message, sessionId) {
    let state = this.eventMessageState.get(message.id);
    if (!state) {
      const embed = message.embeds?.[0];
      const joinedIds = new Set(this.#extractParticipantIdsFromEmbed(embed));
      const usesAttachment =
        Boolean(embed?.image?.url && embed.image.url.startsWith(`attachment://${EMBED_GIF_FILENAME}`)) ||
        Boolean(message.attachments?.some?.((attachment) => attachment.name === EMBED_GIF_FILENAME));

      const resolvedSessionId = sessionId || this.messageSessionMap.get(message.id) || null;
      state = { joinedIds, useAttachment: usesAttachment, sessionId: resolvedSessionId };
      this.eventMessageState.set(message.id, state);
    }

    if (sessionId && state.sessionId !== sessionId) {
      state.sessionId = sessionId;
      this.messageSessionMap.set(message.id, sessionId);
    } else if (!state.sessionId && this.messageSessionMap.has(message.id)) {
      state.sessionId = this.messageSessionMap.get(message.id);
    }

    return state;
  }

  #extractParticipantIdsFromEmbed(embed) {
    if (!embed || !Array.isArray(embed.fields)) return [];
    const participantField = embed.fields.find((field) =>
      typeof field?.name === 'string' && field.name.startsWith('Participantes')
    );
    if (!participantField?.value) return [];
    return Array.from(participantField.value.matchAll(/<@!?(\d+)>/g)).map((match) => match[1]);
  }

  async publishEvent(message) {
    const guild = message.guild;
    if (!guild) {
      await message
        .reply({
          content: 'No puedo publicar eventos fuera de un servidor.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
      return;
    }

    let targetChannel = message.channel;
    if (this.config.EVENTS_CHANNEL_ID) {
      const fetched = await guild.channels
        .fetch(this.config.EVENTS_CHANNEL_ID)
        .catch((error) => {
          this.logger.error('[EVENT] No se pudo obtener el canal configurado:', error);
          return null;
        });

      if (fetched && typeof fetched.isTextBased === 'function' && fetched.isTextBased()) {
        targetChannel = fetched;
      } else {
        await message
          .reply({
            content: 'No pude encontrar el canal configurado para eventos.',
            allowedMentions: { repliedUser: false },
          })
          .catch(() => {});
        return;
      }
    }

    if (this.sessionRepository?.enabled) {
      const activeSession = await this.sessionRepository.findActiveSession(guild.id);
      if (activeSession) {
        await message
          .reply({
            content: 'Ya existe un evento activo. Finaliza el evento actual antes de publicar uno nuevo.',
            allowedMentions: { repliedUser: false },
          })
          .catch(() => {});
        return;
      }
    }

    this.gifPath = this.gifPath || resolveGifPath(this.config.WELCOME_GIF);
    const gifPath = this.gifPath;
    const embed = this.buildEventEmbed({ joinedUserIds: [], useAttachment: Boolean(gifPath) });
    const button = new ButtonBuilder()
      .setCustomId(this.config.EVENT_JOIN_BUTTON_ID)
      .setLabel(this.config.EVENT_BUTTON_LABEL || 'Unirme al evento')
      .setStyle(ButtonStyle.Success);
    const row = new ActionRowBuilder().addComponents(button);

    const payload = buildEmbedPayload(embed, gifPath, EVENT_EMBED_TEMPLATE.image?.url, {
      components: [row],
    });

    try {
      const sent = await targetChannel.send(payload);

      let sessionRecord = null;
      if (this.sessionRepository?.enabled) {
        sessionRecord = await this.sessionRepository.createSession({
          guildId: guild.id,
          name: this.resolveSessionName(),
          createdBy: message.author.id,
          messageId: sent.id,
          channelId: sent.channelId,
        });
      }

      const sessionId = sessionRecord?.id || null;
      this.#cacheSessionReference({
        sessionId,
        guildId: guild.id,
        channelId: sent.channelId,
        messageId: sent.id,
        useAttachment: Boolean(gifPath),
      });

      const state = this.#getEventStateForMessage(sent, sessionId);
      state.joinedIds = state.joinedIds || new Set();
      state.useAttachment = Boolean(gifPath);

      const confirmation =
        targetChannel.id === message.channelId
          ? 'Evento publicado correctamente.'
          : `Evento publicado en <#${targetChannel.id}>.`;

      await message
        .reply({
          content: confirmation,
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    } catch (error) {
      this.logger.error('[EVENT] No se pudo publicar el panel del evento:', error);
      await message
        .reply({
          content: 'No pude publicar el evento. Intenta más tarde.',
          allowedMentions: { repliedUser: false },
        })
        .catch(() => {});
    }
  }

  async finishActiveSession(guildId, moderatorId, reason) {
    if (!this.sessionRepository?.enabled) {
      return null;
    }

    const session = await this.sessionRepository.findActiveSession(guildId);
    if (!session) {
      return null;
    }

    await this.sessionRepository.finishSession({
      sessionId: session.id,
      finishedBy: moderatorId,
      reason,
    });

    const sessionInfo = this.sessionIndex.get(session.id);
    if (sessionInfo) {
      const message = await this.#fetchSessionMessage({
        guildId: sessionInfo.guildId,
        channelId: sessionInfo.channelId,
        messageId: sessionInfo.messageId,
      });
      if (message) {
        await this.#disableJoinButton(message);
      }
    }

    if (session.message_id) {
      this.eventMessageState.delete(session.message_id);
      this.messageSessionMap.delete(session.message_id);
    }
    this.sessionIndex.delete(session.id);
    return session;
  }

  async handleJoin(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: 'No pude procesar la acción fuera del servidor.',
        ephemeral: true,
      });
      return;
    }

    const roleId = this.config.EVENT_ROLE_ID;
    if (!roleId) {
      await interaction.reply({
        content: 'No hay un rol configurado para el evento.',
        ephemeral: true,
      });
      return;
    }

    let member = interaction.member;
    if (!member || typeof member.roles?.add !== 'function') {
      member = await guild.members.fetch(interaction.user.id).catch(() => null);
    }

    if (!member) {
      await interaction.reply({
        content: 'No pude obtener tu información de miembro.',
        ephemeral: true,
      });
      return;
    }

    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      await interaction.reply({
        content: 'El rol del evento no existe. Contacta a un administrador.',
        ephemeral: true,
      });
      return;
    }

    const alreadyHasRole = member.roles.cache.has(roleId);
    if (!alreadyHasRole) {
      try {
        await member.roles.add(roleId, `Evento: unión por botón (${interaction.user.tag})`);
      } catch (error) {
        this.logger.error('[EVENT] No se pudo asignar el rol del evento:', error);
        await interaction.reply({
          content: 'No pude asignarte el rol del evento. Intenta de nuevo más tarde.',
          ephemeral: true,
        });
        return;
      }
    }

    const sessionId = this.messageSessionMap.get(interaction.message.id);
    if (!sessionId && this.sessionRepository?.enabled) {
      const session = await this.sessionRepository.findActiveSession(guild.id);
      if (session) {
        this.#cacheSessionReference({
          sessionId: session.id,
          guildId: guild.id,
          channelId: interaction.channelId,
          messageId: interaction.message.id,
        });
      }
    }

    const resolvedSessionId = this.messageSessionMap.get(interaction.message.id);

    if (this.sanctionRepository?.enabled) {
      const banned = await this.sanctionRepository.isPermanentlyBanned({
        guildId: guild.id,
        userId: interaction.user.id,
      });
      if (banned) {
        await interaction.reply({
          content: 'No puedes unirte al evento porque tienes un baneo permanente de eventos.',
          ephemeral: true,
        });
        return;
      }
    }

    if (resolvedSessionId && this.participantRepository?.enabled) {
      await this.participantRepository.upsertParticipant({
        sessionId: resolvedSessionId,
        guildId: guild.id,
        userId: interaction.user.id,
      });
    }

    const state = this.#getEventStateForMessage(interaction.message, resolvedSessionId);
    state.joinedIds.add(interaction.user.id);

    await this.#refreshEventMessage(interaction.message, state);

    const response = alreadyHasRole
      ? 'Ya estabas inscrito en el evento. ¡Nos vemos ahí!'
      : 'Te uniste al evento y recibiste el rol.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: response, ephemeral: true });
    } else {
      await interaction.reply({ content: response, ephemeral: true });
    }
  }

  async #getReminderState(guildId, userId) {
    const key = buildReminderKey(guildId, userId);
    let state = this.eventReminderState.get(key);

    if (!state) {
      state = {
        messageCount: 0,
        lastRemindedAt: null,
        optedOut: false,
        loaded: false,
        loading: null,
        sending: false,
      };
      this.eventReminderState.set(key, state);
    }

    if (!state.loaded && this.db) {
      if (!state.loading) {
        state.loading = (async () => {
          try {
            const [[row]] = await this.db.execute(
              `SELECT last_reminded_at, opted_out_at FROM event_reminders WHERE guild_id = ? AND user_id = ?`,
              [guildId, userId]
            );
            if (row) {
              state.lastRemindedAt = row.last_reminded_at ? parseSqlDate(row.last_reminded_at) : null;
              state.optedOut = Boolean(row.opted_out_at);
            }
          } catch (error) {
            this.logger.error(
              `[REMINDER] Error cargando estado para ${guildId}/${userId}: ${error?.message || error}`
            );
          } finally {
            state.loaded = true;
            state.loading = null;
          }
        })();
      }

      if (state.loading) {
        await state.loading.catch(() => {});
      }
    }

    return state;
  }

  async #markReminderSent(guildId, userId) {
    if (!this.db) return;
    try {
      await this.db.execute(
        `INSERT INTO event_reminders (guild_id, user_id, last_reminded_at, opted_out_at)
         VALUES (?, ?, NOW(), NULL)
         ON DUPLICATE KEY UPDATE last_reminded_at = VALUES(last_reminded_at), opted_out_at = NULL`,
        [guildId, userId]
      );
    } catch (error) {
      this.logger.error(
        `[REMINDER] Error actualizando recordatorio en la base de datos para ${guildId}/${userId}: ${error?.message || error}`
      );
    }
  }

  async #markReminderOptOut(guildId, userId) {
    if (!this.db) return;
    try {
      await this.db.execute(
        `INSERT INTO event_reminders (guild_id, user_id, last_reminded_at, opted_out_at)
         VALUES (?, ?, NULL, NOW())
         ON DUPLICATE KEY UPDATE opted_out_at = VALUES(opted_out_at)`,
        [guildId, userId]
      );
    } catch (error) {
      this.logger.error(
        `[REMINDER] Error almacenando opt-out para ${guildId}/${userId}: ${error?.message || error}`
      );
      throw error;
    }
  }

  #getGifPath() {
    if (!this.gifPath) {
      this.logger.debug('[REMINDER] Resolviendo ruta del gif de firma.');
      this.gifPath = resolveGifPath(this.config.WELCOME_GIF);
      if (!this.gifPath) {
        this.logger.warn('[REMINDER] No se encontró dedosgif.gif. Se usará la URL de respaldo.');
      } else {
        this.logger.debug(`[REMINDER] Gif de firma localizado en ${this.gifPath}.`);
      }
    }
    return this.gifPath;
  }

  #buildReminderEmbed({ guild, member }) {
    this.logger.debug(
      `[REMINDER] Construyendo embed de recordatorio de canal para ${member.user?.tag || member.id}.`
    );
    const eventChannelMention = this.config.EVENTS_CHANNEL_ID
      ? `<#${this.config.EVENTS_CHANNEL_ID}>`
      : 'el canal de eventos';
    const descriptionLines = [
      `Hola, ${member}, te recordamos que ${guild.name} siempre tiene eventos activos donde puedes ganar premios.`,
      `Parece que aun no te has unido, ¿qué esperas para visitar ${eventChannelMention}?`,
      'Si no te interesa el evento puedes tocar el botón de abajo.',
    ];

    return new EmbedBuilder()
      .setTitle('Recordatorio')
      .setDescription(descriptionLines.join('\n\n'))
      .setColor(EVENT_EMBED_TEMPLATE.color || this.config.WARN_EMBED_COLOR || 0x5000ab)
      .setAuthor({
        name: '.gg/dedos',
        url: this.config.GUILD_URL,
        iconURL: this.config.EVENT_BRAND_ICON || this.config.BRAND_ICON,
      })
      .setFooter({
        text: 'No olvides unirte a los eventos e invitar a tus amigos',
        iconURL: this.config.EVENT_BRAND_ICON || this.config.BRAND_ICON,
      })
      .setTimestamp();
  }

  #buildReminderDmEmbed({ guild, member }) {
    this.logger.debug(
      `[REMINDER] Construyendo embed de recordatorio por DM para ${member.user?.tag || member.id}.`
    );
    const channelText = this.config.EVENTS_CHANNEL_ID
      ? `visitar <#${this.config.EVENTS_CHANNEL_ID}>`
      : 'revisar el canal de eventos';
    return new EmbedBuilder()
      .setColor(EVENT_EMBED_TEMPLATE.color || this.config.WARN_EMBED_COLOR || 0x5000ab)
      .setTitle('¡Te esperamos en el evento!')
      .setDescription(
        [
          `Hola ${member.displayName}, aún no vemos tu participación en los eventos de ${guild.name}.`,
          `Puedes ${channelText} para enterarte de todos los detalles.`,
        ].join('\n\n')
      )
      .setFooter({
        text: 'Puedes responder este DM si necesitas ayuda.',
        iconURL: this.config.EVENT_BRAND_ICON || this.config.BRAND_ICON,
      })
      .setTimestamp();
  }

  #createReminderChannelPayload({ embed, member, components }) {
    const payload = buildEmbedPayload(embed, this.#getGifPath(), this.config.EVENT_REMINDER_GIF_URL, {
      content: member.toString(),
      components,
      allowedMentions: { users: [member.id], roles: [] },
    });
    this.logger.debug(
      `[REMINDER] Payload de canal preparado para ${member.user?.tag || member.id}.`
    );
    return payload;
  }

  #createReminderDmPayload({ guild, member }) {
    const embed = this.#buildReminderDmEmbed({ guild, member });
    const payload = buildEmbedPayload(embed, this.#getGifPath(), this.config.EVENT_REMINDER_GIF_URL);
    this.logger.debug(`[REMINDER] Payload de DM preparado para ${member.user?.tag || member.id}.`);
    return payload;
  }

  async #sendReminderToChannel({ channel, payload, member }) {
    try {
      this.logger.info(
        `[REMINDER] Enviando recordatorio de canal a ${member.user?.tag || member.id} en #${channel.name || channel.id}.`
      );
      await channel.send(payload);
      this.logger.info(
        `[REMINDER] Recordatorio publicado para ${member.user?.tag || member.id} en #${channel.name || channel.id}.`
      );
    } catch (error) {
      this.logger.error(
        `[REMINDER] Error enviando recordatorio a ${member.user?.tag || member.id} en ${channel.id}: ${error?.message || error}`
      );
      throw error;
    }
  }

  async #sendReminderDm({ member, payload }) {
    try {
      this.logger.info(`[REMINDER] Enviando recordatorio por DM a ${member.user?.tag || member.id}.`);
      await member.send(payload);
      this.logger.info(`[REMINDER] Recordatorio por DM enviado a ${member.user?.tag || member.id}.`);
    } catch (error) {
      this.logger.warn(
        `[REMINDER] No se pudo enviar el recordatorio por DM a ${member.user?.tag || member.id}: ${error?.message || error}`
      );
    }
  }

  async handleReminderMessage(message) {
    try {
      if (!message.guild || message.author.bot) return;
      if (!this.config.EVENT_REMINDER_CHANNEL_IDS.length) {
        if (!this.reminderChannelWarningLogged) {
          this.logger.warn(
            '[REMINDER] EVENT_REMINDER_CHANNEL_IDS no está configurado. El sistema de recordatorios está inactivo.'
          );
          this.reminderChannelWarningLogged = true;
        }
        return;
      }

      if (!this.config.EVENT_ROLE_ID) {
        if (!this.reminderRoleWarningLogged) {
          this.logger.warn(
            '[REMINDER] EVENT_ROLE_ID no está configurado. El sistema de recordatorios está inactivo.'
          );
          this.reminderRoleWarningLogged = true;
        }
        return;
      }

      if (!this.config.EVENT_REMINDER_CHANNEL_IDS.includes(message.channel.id)) {
        return;
      }

      const guildId = message.guild.id;
      const userId = message.author.id;

      let member = message.member;
      if (!member) {
        try {
          member = await message.guild.members.fetch(userId);
        } catch {
          this.logger.warn(`[REMINDER] No se pudo obtener al miembro ${userId} para procesar recordatorio.`);
          return;
        }
      }

      if (member.roles.cache.has(this.config.EVENT_ROLE_ID)) {
        this.eventReminderState.delete(buildReminderKey(guildId, userId));
        return;
      }

      const state = await this.#getReminderState(guildId, userId);
      if (state.optedOut) {
        this.logger.info(`[REMINDER] ${member.user.tag} desactivó los recordatorios. Se omite.`);
        return;
      }

      state.messageCount += 1;
      this.logger.info(
        `[REMINDER] ${member.user.tag} mensaje ${state.messageCount}/${this.config.EVENT_REMINDER_MESSAGE_THRESHOLD} en #${message.channel.name || message.channel.id}.`
      );

      if (state.messageCount < this.config.EVENT_REMINDER_MESSAGE_THRESHOLD) {
        return;
      }

      const now = Date.now();
      const lastReminder = state.lastRemindedAt ? state.lastRemindedAt.getTime() : 0;
      const cooldownMs = this.config.EVENT_REMINDER_COOLDOWN_MS;

      if (cooldownMs > 0 && now - lastReminder < cooldownMs) {
        const remainingMs = cooldownMs - (now - lastReminder);
        this.logger.info(
          `[REMINDER] ${member.user.tag} aún está en cooldown (${Math.ceil(remainingMs / 1000)}s).`
        );
        return;
      }

      if (state.sending) {
        this.logger.debug(`[REMINDER] ${member.user.tag} ya tiene un recordatorio en progreso. Se omite.`);
        return;
      }

      state.sending = true;

      try {
        state.messageCount = 0;
        state.lastRemindedAt = new Date(now);
        await this.#markReminderSent(guildId, userId);

        this.logger.info(
          `[REMINDER] Programando recordatorio para ${member.user.tag} tras cumplir condiciones.`
        );

        const embed = this.#buildReminderEmbed({ guild: message.guild, member });
        const joinButton = new ButtonBuilder()
          .setCustomId(this.config.EVENT_JOIN_BUTTON_ID)
          .setStyle(ButtonStyle.Success)
          .setLabel(this.config.EVENT_REMINDER_JOIN_LABEL || this.config.EVENT_BUTTON_LABEL || 'Ir al evento');
        const stopButton = new ButtonBuilder()
          .setCustomId(this.config.EVENT_REMINDER_STOP_BUTTON_ID)
          .setStyle(ButtonStyle.Secondary)
          .setLabel(this.config.EVENT_REMINDER_STOP_LABEL || 'No volver a recordar');
        const row = new ActionRowBuilder().addComponents(joinButton, stopButton);

        const channelPayload = this.#createReminderChannelPayload({
          embed,
          member,
          components: [row],
        });
        await this.#sendReminderToChannel({
          channel: message.channel,
          payload: channelPayload,
          member,
        });

        const dmPayload = this.#createReminderDmPayload({ guild: message.guild, member });
        await this.#sendReminderDm({ member, payload: dmPayload });
      } catch (error) {
        this.logger.error(
          `[REMINDER] Error enviando recordatorio a ${member.user.tag}: ${error?.message || error}`
        );
      } finally {
        state.sending = false;
      }
    } catch (error) {
      this.logger.error(`[REMINDER] Error procesando mensaje para recordatorio: ${error?.message || error}`);
    }
  }

  async handleReminderStop(interaction) {
    if (!interaction.guildId) {
      await interaction.reply({ content: 'No pude identificar el servidor.', ephemeral: true }).catch(() => {});
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const key = buildReminderKey(guildId, userId);
    const state = await this.#getReminderState(guildId, userId);

    if (state.optedOut) {
      const message = 'Ya no recibirás recordatorios de eventos.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
      }
      return;
    }

    try {
      await this.#markReminderOptOut(guildId, userId);
      state.optedOut = true;
      state.messageCount = 0;
      this.eventReminderState.set(key, state);
      this.logger.info(`[REMINDER] ${interaction.user.tag} desactivó los recordatorios de eventos.`);

      const message = 'Listo, no volverás a recibir recordatorios.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
      }
    } catch (error) {
      this.logger.error(
        `[REMINDER] Error al procesar opt-out para ${interaction.user.tag}: ${error?.message || error}`
      );
      const message = 'No pude actualizar tus recordatorios. Intenta más tarde.';
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
      }
    }
  }

  async removeParticipantByUserId({ sessionId, userId }) {
    const sessionInfo = this.sessionIndex.get(sessionId);
    if (!sessionInfo) {
      return;
    }

    const message = await this.#fetchSessionMessage({
      guildId: sessionInfo.guildId,
      channelId: sessionInfo.channelId,
      messageId: sessionInfo.messageId,
    });

    if (!message) {
      return;
    }

    const state = this.#getEventStateForMessage(message, sessionId);
    if (state.joinedIds.has(userId)) {
      state.joinedIds.delete(userId);
      await this.#refreshEventMessage(message, state);
    }
  }
}
