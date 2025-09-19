import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} from 'discord.js';

const SHOP_GIF_URL =
  'https://message.style/cdn/images/b6b34048e6b8e4f2d6931af81a6935dbeb06d1d1a619dcf353733ab75bbcca8c.gif';

const SHOP_PAYMENT_METHODS_FIELD = {
  name: 'Metodos de pago:',
  value:
    '<:emojigg_LTC:1417418373721096254>  -  **Litecoin**  -  <:20747paypal:1417021872889139283>  -  **PayPal**   -  <:oxxo:1417027814246449263>  -  **Oxxo**   -   ??  -  **Transferencia**\n',
};

const SHOP_CLAUSULAS_FIELD = {
  name: 'Clausulas:',
  value:
    'Los pagos mediante transferencia bancaria y OXXO están disponibles únicamente en México ????. Los métodos PayPal <:20747paypal:1417021872889139283> y Litecoin <:emojigg_LTC:1417418373721096254> se encuentran habilitados a nivel global ??. En caso de utilizar PayPal, se aplicará un cargo adicional correspondiente a la comisión de la plataforma (aproximadamente 3%, variable según divisa y país de origen).',
};

const SHOP_STORE_PETS = [
  { name: ' <:Discobee:1414419895348891689>  Disco Bee', mxn: 80 },
  { name: ' <:gag_raccon:1417401527714320506> Raccon', mxn: 100 },
  { name: '<:Kitsune:1414434736880877650>  Kitsune', mxn: 260 },
  { name: '<:Butterfly:1417027669647949864>  Butterfly', mxn: 35 },
  { name: '<:DragonFly:1412701832311996499>  Dragonfly', mxn: 20 },
  { name: '<:Mimic_Octopus:1417027684751507476>  MImic', mxn: 20 },
];

const SHOP_PET_ROBUX_FIELDS = [
  {
    name: ' <:Discobee:1414419895348891689>  Disco Bee',
    value: '    **500 Robux** <:9073robux:1417021867167846420>',
    inline: true,
  },
  {
    name: ' <:gag_raccon:1417401527714320506> Raccon',
    value: '    **700 Robux** <:9073robux:1417021867167846420> ',
    inline: true,
  },
  {
    name: '<:Kitsune:1414434736880877650>  Kitsune',
    value: '    **1800 Robux** <:9073robux:1417021867167846420> ',
    inline: true,
  },
  {
    name: '<:Butterfly:1417027669647949864>  Butterfly',
    value: '    **300 Robux** <:9073robux:1417021867167846420> ',
    inline: true,
  },
  {
    name: '<:DragonFly:1412701832311996499>  Dragonfly',
    value: '     **80 Robux** <:9073robux:1417021867167846420>',
    inline: true,
  },
  {
    name: '<:Mimic_Octopus:1417027684751507476>  MImic',
    value:
      '      **80 Robux** <:9073robux:1417021867167846420> \n Clausulas\nNo compramos ítems relacionados con Steal o Brainrot. Los precios no incluyen el 30% de tax que Roblox <:Roblox:1417027880080375929> descuenta en cada transacción. No realizamos pagos mediante in game gift (no se regalan pases dentro de ningún juego). Por seguridad, en el caso de los Raccoons <:gag_raccon:1417401527714320506> mantenemos un mínimo de 48 horas en nuestro inventario antes de liberar el pago, para evitar la compra de duplicados. **Esto aplica únicamente al Raccoon otras pets si son pago inmediato **<:gag_raccon:1417401527714320506>, ya que es el pet más duplicado del juego.',
  },
];

const sanitizeTicketNameSegment = (value) =>
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cliente';

const buildTicketChannelName = (option, user) => {
  const username = sanitizeTicketNameSegment(
    user.username || user.globalName || user.displayName || 'cliente'
  );
  const suffixBase =
    user.discriminator && user.discriminator !== '0'
      ? user.discriminator
      : user.id.slice(-4);
  const raw = `${option.channelPrefix}-${username}-${suffixBase}`.replace(/-+/g, '-');
  return raw.length > 95 ? raw.slice(0, 95) : raw;
};

const parseTicketTopic = (topic) => {
  if (!topic || !topic.startsWith('TICKET:')) return null;
  const parts = topic.split(':');
  if (parts.length < 3) return null;
  const optionId = parts[1];
  const userPart = parts.slice(2).join(':').split('|')[0].trim();
  if (!optionId || !userPart) return null;
  return { optionId, userId: userPart };
};

export class TicketService {
  constructor({ config, logger, fxService }) {
    this.config = config;
    this.logger = logger;
    this.fx = fxService;
    this.cooldowns = new Map();
    this.options = [
      {
        id: 'sell_pets',
        menuLabel: 'Vender tus pets (Robux)',
        menuDescription: 'Cotizamos tus mascotas de Grow a Garden por Robux.',
        channelPrefix: 'venta',
        emoji: '??',
        introLines: [
          'Gracias por confiar en ?????????? ???????? para vender tus pets de Grow a Garden.',
          'Incluye la lista de pets que ofreces y la cantidad deseada en Robux.',
          'Adjunta capturas o pruebas de inventario si es posible.',
        ],
        embedBuilder: () => this.#buildSellPetsEmbed(),
      },
      {
        id: 'buy_pets',
        menuLabel: 'Comprar pets (MXN / USD)',
        menuDescription: 'Consulta precios actualizados en pesos y dólares.',
        channelPrefix: 'compra',
        emoji: '??',
        introLines: [
          'Cuéntanos qué pets deseas comprar y cuántas unidades necesitas.',
          'Indica tu método de pago favorito (PayPal, Litecoin, Oxxo, transferencia).',
          'El equipo te confirmará stock y proceso de pago en breve.',
        ],
        embedBuilder: () => this.#buildBuyPetsEmbed(),
      },
      {
        id: 'buy_robux',
        menuLabel: 'Comprar Robux',
        menuDescription: 'Elige grupo, juego o gamepass y abre tu ticket.',
        channelPrefix: 'robux',
        emoji: '??',
        introLines: [
          'Indica si prefieres recibir Robux por grupo, juego o gamepass.',
          'Comparte tu usuario de Roblox y cualquier detalle adicional.',
          'Asegúrate de leer las condiciones y tiempos detallados en la información.',
        ],
        embedBuilder: () => this.#buildRobuxEmbed(),
      },
      {
        id: 'buy_nitro',
        menuLabel: 'Comprar N17r0 B005tz',
        menuDescription: 'Reserva b005tz legales al mejor precio.',
        channelPrefix: 'n17r0',
        emoji: '??',
        introLines: [
          'Dinos cuantos meses de N17r0 B005tz necesitas y para que servidor.',
          'Comparte el metodo de pago y, si aplica, la fecha en la que lo requieres.',
          'Recuerda que el stock es limitado y puede agotarse rapidamente.',
        ],
        embedBuilder: () => this.#buildNitroEmbed(),
      },
      {
        id: 'buy_decor',
        menuLabel: 'Comprar decoraciones',
        menuDescription: 'Obten efectos y regalos premium más baratos.',
        channelPrefix: 'decor',
        emoji: '??',
        introLines: [
          'Enumera las decoraciones o efectos que te interesan y sus precios.',
          'Indica si necesitas el regalo para un perfil específico o para ti.',
          'Te confirmaremos disponibilidad y pasos a seguir para cerrar la compra.',
        ],
        embedBuilder: () => this.#buildDecorationsEmbed(),
      },
    ];
  }

  getMenuOptions() {
    return this.options.map((option) => ({
      label: option.menuLabel,
      value: option.id,
      description: option.menuDescription.slice(0, 100),
      emoji: option.emoji,
    }));
  }

  getOption(optionId) {
    return this.options.find((option) => option.id === optionId) || null;
  }

  #applyBrand(embed) {
    return embed
      .setAuthor({ name: '.gg/dedos', iconURL: this.config.TICKET_BRAND_ICON })
      .setFooter({
        text: 'En caso de dudas, en el canal de tickets puedes solicitar ayuda.',
        iconURL: this.config.TICKET_BRAND_ICON,
      })
      .setImage(SHOP_GIF_URL);
  }

  #buildPanelEmbed() {
    const embed = new EmbedBuilder()
      .setColor(7602431)
      .setTitle('COMPRA | VENTA')
      .setDescription(
        '<a:27572sparkles:1417433396958728254>En ?????????? ???????? puedes pets de Grow a Garden, Robux <:9073robux:1417021867167846420>, N17r0 B005tz <a:7478evolvingbadgenitroascaling:1417021865893036093>, Decoraciones<a:6633kittypaw14:1416604699716751370>, Tambien ofrecemos otros servicios de streaming a cambio de dinero o pets (Para mas informacion abre un ticket de ayuda). \n?????????? ???????? tambien **te compra tus PETS de Grow a Garden por robux.**\n**?? Selecciona una opción en el menú de abajo para obtener más información.**'
      )
      .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, this.fx.buildInfoField());
    return this.#applyBrand(embed);
  }

  #buildSellPetsEmbed() {
    const embed = new EmbedBuilder()
      .setColor(7602431)
      .setTitle('PETS QUE COMPRAMOS')
      .setDescription(
        'En ?????????? ???????? compramos tus PETS de GAG por** ROBUX** <:9073robux:1417021867167846420>. <:50230exclamationpoint:1417021877829767168> La lista muestra precios promedio calculados según el valor real de robux y la demanda de cada pet, por lo que pueden subir o bajar según la popularidad del juego. <a:9062kittypaw04:1416604701847322685> ¿No estás conforme con el precio? Abre un ticket y haz tu** oferta**.\n'
      )
      .addFields(...SHOP_PET_ROBUX_FIELDS);
    return this.#applyBrand(embed).addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, this.fx.buildInfoField());
  }

  #buildBuyPetsEmbed() {
    const embed = new EmbedBuilder()
      .setColor(7602431)
      .setTitle('PETS QUE VENDEMOS')
      .setDescription(
        '?????????? ???????? es tu mejor opción para adquirir pets de **Grow a Garden.**\nGarantizamos **precios más bajos** que la competencia y una experiencia de compra confiable.'
      );

    for (const item of SHOP_STORE_PETS) {
      embed.addFields({
        name: item.name,
        value: `    **${item.mxn} MXN**\n${this.fx.formatUsdFromMxn(item.mxn)}`,
        inline: true,
      });
    }

    return this.#applyBrand(embed).addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, this.fx.buildInfoField());
  }

  #buildRobuxEmbed() {
    const priceByGroup = this.fx.formatUsdFromMxn(125);
    const priceByGame = this.fx.formatUsdFromMxn(125);
    const priceByGamepass = this.fx.formatUsdFromMxn(135);

    const embed = new EmbedBuilder()
      .setColor(7602431)
      .setTitle('COMPRAR ROBUX')
      .setDescription('?????????? ???????? vende robux a los mejores precios. Ofrecioendo pagos por grupo o por gamepass.')
      .addFields(
        {
          name: '1000 ROBUX | PAGO POR GRUPO ',
          value: [
            'La opción **más conveniente** para adquirir Robux <:9073robux:1417021867167846420> es mediante pago por grupo. Únicamente debes unirte y permanecer en el grupo un mínimo de **2 semanas** para habilitar los envíos.',
            'Una vez cumplida la antigüedad requerida, los pagos se realizan de forma inmediata y recibirás exactamente 1000 Robux.',
            `**El costo es de $125 MXN por cada 1000 Robux** (${priceByGroup}).`,
            '**Grupo:** https://www.roblox.com/es/communities/12082479/unnamed#!/about',
          ].join('\n'),
        },
        {
          name: '1000 ROBUX | PAGO POR JUEGO',
          value: [
            'Esta es una alternativa conveniente si deseas utilizar Robux <:9073robux:1417021867167846420> para adquirir objetos o gamepasses en tu juego favoo.',
            'Realizas la compra de los Robux y recibirás el equivalente en el objeto o gamepass de tu elección.',
            `**El costo es de $125 MXN por cada 1000 Robux** (${priceByGame}).`,
          ].join('\n'),
        },
        {
          name: '1000 ROBUX | PAGO POR GAMEPASS',
          value: [
            'Esta es la opción menos recomendable<:50230exclamationpoint:1417021877829767168>, ya que funciona mediante gamepass, similar a Pls Donate.',
            'Roblox aplica una deducción del 30%, por lo que es necesario enviar 1,429 Robux para que recibas 1,000 netos.',
            'Además, el monto se acredita como pendiente y tarda entre 6 y 8 días en reflejarse en tu cuenta.',
            `**El costo es de $135 MXN por cada 1,000 Robux** (${priceByGamepass}).`,
          ].join('\n'),
        }
      )
      .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, this.fx.buildInfoField());

    return this.#applyBrand(embed);
  }

  #buildNitroEmbed() {
    const priceNitro = this.fx.formatUsdFromMxn(95);
    const embed = new EmbedBuilder()
      .setColor(7602431)
      .setTitle('COMPRAR N17r0 B005tz')
      .setDescription(
        'Dedos Shop vende **N17r0 B005tz** al mejor precio de la competencia: **95 MXN por 1 mes.** ' +
          `${priceNitro} Al ser legal paid, este tipo de NB es dificil de conseguir, por lo que pedimos disculpas en caso de no contar con stock disponible. A diferencia de otros, aqui no corres riesgo de recibir advertencias en tu cuenta de Discord ni de que sea revocado antes de completar el mes contratado.`
      )
      .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, this.fx.buildInfoField());

    return this.#applyBrand(embed);
  }

  #buildDecorationsEmbed() {
    const embed = new EmbedBuilder()
      .setColor(7602431)
      .setTitle('COMPRAR DECORACIONES')
      .setDescription(
        '?????????? ???????? vende decoraciones y efectos legal paid por regalo de perfil\n$4.99 <a:51047animatedarrowwhite:1417021879411281992>    $3.1 \n$5.99  <a:51047animatedarrowwhite:1417021879411281992>    $3.3\n$6.99 <a:51047animatedarrowwhite:1417021879411281992>      $3.6 \n$7.99  <a:51047animatedarrowwhite:1417021879411281992>   $3.9\n$8.49 <a:51047animatedarrowwhite:1417021879411281992>      $4.05\n$9.99  <a:51047animatedarrowwhite:1417021879411281992>      $5\n$11.99 <a:51047animatedarrowwhite:1417021879411281992>    $5.5\nPrecio de la izquierda es a lo que discord los vende, el de la derecha es el precio que ?????????? ???????? lo vende.'
      )
      .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, this.fx.buildInfoField());

    return this.#applyBrand(embed);
  }

  buildPanelComponents() {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(this.config.TICKET_SELECT_ID)
      .setPlaceholder('Selecciona el servicio que necesitas')
      .addOptions(this.getMenuOptions());
    return [new ActionRowBuilder().addComponents(menu)];
  }

  buildPanelMessage() {
    const embed = this.#buildPanelEmbed();
    return { embeds: [embed], components: this.buildPanelComponents() };
  }

  buildOptionResponse(optionId) {
    const option = this.getOption(optionId);
    if (!option) return null;
    const embed = option.embedBuilder();
    const button = new ButtonBuilder()
      .setCustomId(`${this.config.TICKET_BUTTON_PREFIX}${option.id}`)
      .setLabel('Abrir ticket')
      .setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(button);
    return { embeds: [embed], components: [row], ephemeral: true };
  }

  async #findExistingTicketChannels(guild, userId) {
    const channels = await guild.channels.fetch();
    const matches = [];
    for (const channel of channels.values()) {
      if (!channel || channel.type !== ChannelType.GuildText) continue;
      const info = parseTicketTopic(channel.topic);
      if (info?.userId === userId) {
        matches.push(channel);
      }
    }
    return matches;
  }

  async #resolveTicketParentChannelId(guild) {
    if (this.config.TICKET_CATEGORY_ID) {
      const category =
        guild.channels.cache.get(this.config.TICKET_CATEGORY_ID) ||
        (await guild.channels.fetch(this.config.TICKET_CATEGORY_ID).catch(() => null));
      if (category?.type === ChannelType.GuildCategory) {
        return category.id;
      }
    }

    if (this.config.TICKET_PANEL_CHANNEL_ID) {
      const panelChannel =
        guild.channels.cache.get(this.config.TICKET_PANEL_CHANNEL_ID) ||
        (await guild.channels.fetch(this.config.TICKET_PANEL_CHANNEL_ID).catch(() => null));
      if (panelChannel?.parentId) {
        return panelChannel.parentId;
      }
    }

    return null;
  }

  buildIntroEmbed(option, user) {
    const lines = [
      `Hola <@${user.id}> ??`,
      ...option.introLines,
      '',
      'Un miembro del staff te atenderá a la brevedad. Si necesitas cerrar el ticket, avisa cuando quedes conforme.',
    ];
    return this.#applyBrand(
      new EmbedBuilder()
        .setColor(7602431)
        .setTitle(`Ticket abierto: ${option.menuLabel}`)
        .setDescription(lines.join('\n'))
        .setTimestamp()
    );
  }

  async openTicket(interaction, optionId) {
    const option = this.getOption(optionId);
    if (!option) {
      await interaction.reply({
        content: 'Esta opción de ticket ya no está disponible.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    const now = Date.now();
    const lastUse = this.cooldowns.get(userId) || 0;
    const remaining = this.config.TICKET_COOLDOWN_MS - (now - lastUse);

    if (remaining > 0) {
      const seconds = Math.ceil(remaining / 1000);
      await interaction.reply({
        content: `Espera ${seconds}s para abrir otro ticket.`,
        ephemeral: true,
      });
      return;
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: 'No pude abrir el ticket en este servidor. Intenta de nuevo.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    let existingChannels;
    try {
      existingChannels = await this.#findExistingTicketChannels(guild, userId);
    } catch (error) {
      this.logger.error('[TICKETS] No se pudo listar tickets existentes:', error);
      await interaction.editReply({
        content: 'No pude revisar tus tickets actuales. Inténtalo de nuevo más tarde.',
      });
      return;
    }

    const openChannels = existingChannels.filter((channel) => channel && !channel.deleted);
    if (openChannels.length >= this.config.TICKET_MAX_PER_USER) {
      const mentions = openChannels.map((channel) => `<#${channel.id}>`).join(', ');
      await interaction.editReply({
        content: `Ya tienes ${openChannels.length} ticket(s) abierto(s): ${mentions}. Cierra alguno antes de abrir otro.`,
      });
      return;
    }

    const staffRoleIds = this.config.TICKET_STAFF_ROLE_IDS.filter((roleId) =>
      guild.roles.cache.has(roleId)
    );

    const overwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.UseExternalEmojis,
          PermissionFlagsBits.AddReactions,
        ],
      },
      ...staffRoleIds.map((roleId) => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.UseExternalEmojis,
          PermissionFlagsBits.AddReactions,
          PermissionFlagsBits.ManageMessages,
        ],
      })),
    ];

    let parentId = null;
    try {
      parentId = await this.#resolveTicketParentChannelId(guild);
    } catch (error) {
      this.logger.warn('[TICKETS] No se pudo resolver categoría de tickets:', error);
    }

    let ticketChannel;
    try {
      ticketChannel = await guild.channels.create({
        name: buildTicketChannelName(option, interaction.user),
        type: ChannelType.GuildText,
        parent: parentId ?? undefined,
        topic: `TICKET:${option.id}:${userId}`,
        permissionOverwrites: overwrites,
        reason: `Ticket (${option.menuLabel}) abierto por ${interaction.user.tag}`,
      });
    } catch (error) {
      this.logger.error('[TICKETS] Error creando el canal:', error);
      await interaction.editReply({
        content: 'No pude crear el ticket. Contacta al staff para recibir ayuda.',
      });
      return;
    }

    const introEmbed = this.buildIntroEmbed(option, interaction.user);
    const mentions = [`<@${userId}>`];
    if (staffRoleIds.length > 0) {
      mentions.push(...staffRoleIds.map((roleId) => `<@&${roleId}>`));
    }

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(this.config.TICKET_CLOSE_BUTTON_ID)
        .setLabel('Cerrar ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('??')
    );

    try {
      await ticketChannel.send({
        content: mentions.join(' '),
        embeds: [introEmbed],
        components: [closeRow],
      });
    } catch (error) {
      this.logger.warn('[TICKETS] No se pudo enviar el mensaje inicial del ticket:', error);
    }

    this.cooldowns.set(userId, now);

    await interaction.editReply({
      content: `Tu ticket se abrió en <#${ticketChannel.id}>. ¡Gracias por escribirnos!`,
    });
  }

  async closeTicket(interaction) {
    const channel = interaction.channel;
    const guild = interaction.guild;

    if (!channel || channel.type !== ChannelType.GuildText || !guild) {
      await interaction.reply({
        content: 'Este boton solo funciona dentro de un ticket.',
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    const info = parseTicketTopic(channel.topic);
    if (!info) {
      await interaction.reply({
        content: 'No pude identificar los datos de este ticket. Contacta a un administrador.',
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    let member = interaction.member;
    if (!member) {
      try {
        member = await guild.members.fetch(interaction.user.id);
      } catch {
        member = null;
      }
    }

    const staffRoleIds = this.config.TICKET_STAFF_ROLE_IDS;
    const hasStaffRole = Boolean(member?.roles?.cache?.some((role) => staffRoleIds.includes(role.id)));
    const isAdmin = Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));

    if (!hasStaffRole && !isAdmin) {
      const embed = this.#applyBrand(
        new EmbedBuilder()
          .setColor(0xff3366)
          .setTitle('Acceso denegado')
          .setDescription('Solo el staff de tickets o un administrador puede cerrar este ticket.')
      );
      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      }).catch(() => {});
      return;
    }

    try {
      const disabledRows = interaction.message.components.map((row) => {
        const actionRow = new ActionRowBuilder();
        for (const component of row.components) {
          const button = ButtonBuilder.from(component);
          if (button.data?.custom_id === this.config.TICKET_CLOSE_BUTTON_ID) {
            button.setDisabled(true).setLabel('Ticket cerrado');
          }
          actionRow.addComponents(button);
        }
        return actionRow;
      });
      if (disabledRows.length > 0) {
        await interaction.message.edit({ components: disabledRows });
      }
    } catch (error) {
      this.logger.warn('[TICKETS] No se pudo actualizar el mensaje del ticket:', error);
    }

    await interaction.reply({
      content: 'Ticket cerrado. Este canal se eliminará en 10 segundos.',
      ephemeral: true,
    }).catch(() => {});

    await channel
      .send({
        content: `[LOCK] Ticket cerrado por ${interaction.user.toString()}. El canal se eliminará en 10 segundos.`,
      })
      .catch(() => {});

    setTimeout(() => {
      channel.delete(`Ticket cerrado por ${interaction.user.tag}`).catch(() => {});
    }, 10_000);
  }
}
