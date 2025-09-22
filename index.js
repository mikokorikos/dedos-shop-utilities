// index.js — Bot completo: Reglas con verificación y Bienvenidas por DM
// Requisitos: Node 18+, discord.js v14, dotenv

import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActivityType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import fs from "node:fs";
import 'dotenv/config';

// ======== Configuración ========
const CONFIG = {
  // Configuración de reglas y verificación
  ROLE_ID: process.env.VERIFIED_ROLE_ID || "1414055931066716411", // Rol verificado
  VERIFICATION_CHANNEL_ID: process.env.VERIFICATION_CHANNEL_ID || "1412699909949358151",
  
  // Configuración de bienvenidas
  RATE_MS: parseInt(process.env.WELCOME_RATE_MS || "1500", 10), // ms entre envíos
  CONCURRENCY: parseInt(process.env.WELCOME_CONCURRENCY || "1", 10), // tareas por tick
  MAX_QUEUE: parseInt(process.env.WELCOME_MAX_QUEUE || "5000", 10), // tope cola
  SHOW_DEBUG: /^1|true$/i.test(process.env.DEBUG || "0"),
  GUILD_URL: process.env.GUILD_URL || "https://discord.gg/dedos",
  HELP_URL: process.env.HELP_URL || process.env.GUILD_URL || "https://discord.gg/dedos",
  INVITE_CHANNEL_ID: process.env.INVITE_CHANNEL_ID || "1417041676135956481",
  BRAND_ICON:
    process.env.BRAND_ICON ||
    "https://cdn.discordapp.com/attachments/1412699909949358151/1417020355389952031/8acfd3c22d8286c858abb3e9b4bc97cc.jpg",
  // Configuración de tickets
  TICKET_PANEL_CHANNEL_ID: process.env.TICKET_PANEL_CHANNEL_ID || "1412574665100230748",
  TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || null,
  TICKET_STAFF_ROLE_IDS: (process.env.TICKET_SUPPORT_ROLE_IDS || process.env.TICKET_STAFF_ROLE_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  TICKET_MAX_PER_USER: Math.max(1, parseInt(process.env.TICKET_MAX_PER_USER || "1", 10)),
  TICKET_COOLDOWN_MS: Math.max(0, parseInt(process.env.TICKET_COOLDOWN_MS || "3000", 10)),
  TICKET_BRAND_ICON:
    process.env.TICKET_BRAND_ICON ||
    "https://cdn.discordapp.com/attachments/1412699909949358151/1417272988801175593/dedosbot_avatar.jpg?ex=68c9e1d4&is=68c89054&hm=8c67741a13f8fa8bd24b48c7e77e43bf74d56d7bc80f38a23fd27d97d1ab880b&",
  VERIFICATION_MESSAGE_ID: process.env.VERIFICATION_MESSAGE_ID || null,
};

if (!process.env.TOKEN) {
  console.error("[FATAL] Falta TOKEN en el entorno (.env)");
  process.exit(1);
}

let verificationMessageId = CONFIG.VERIFICATION_MESSAGE_ID || null; // Guardar ID del mensaje de verificación

// ======== Cliente Discord ========
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers, // Para bienvenidas y verificación
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ======== Cola con limitación de tasa/concurrencia ========
class RateLimitedQueue {
  constructor({ intervalMs, concurrency, maxQueue }) {
    this.intervalMs = Math.max(250, Number(intervalMs) | 0);
    this.concurrency = Math.max(1, Number(concurrency) | 0);
    this.maxQueue = Math.max(1, Number(maxQueue) | 0);
    this.queue = [];
    this.active = 0;
    this.timer = null;
    this.lastReport = 0;
  }

  start() {
    if (this.timer) return;
    const t = setInterval(() => this.#tick(), this.intervalMs);
    if (typeof t.unref === "function") t.unref();
    this.timer = t;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  size() {
    return this.queue.length + this.active;
  }

  push(fn) {
    if (this.queue.length >= this.maxQueue) {
      console.warn(
        `[QUEUE] Cola llena (${this.queue.length}/${this.maxQueue}). Se descarta para proteger recursos.`
      );
      return false;
    }
    this.queue.push(fn);
    this.#maybeReport();
    return true;
  }

  async #run(fn) {
    this.active++;
    try {
      await fn();
    } catch (err) {
      console.error("[QUEUE] Tarea falló:", err?.stack || err);
    } finally {
      this.active--;
    }
  }

  #tick() {
    for (let i = 0; i < this.concurrency && this.queue.length > 0; i++) {
      const fn = this.queue.shift();
      this.#run(fn);
    }
  }

  #maybeReport() {
    const now = Date.now();
    if (now - this.lastReport > 10_000) {
      this.lastReport = now;
      console.log(`[QUEUE] Pendientes: ${this.queue.length}, activos: ${this.active}`);
    }
  }
}

const welcomeQueue = new RateLimitedQueue({
  intervalMs: CONFIG.RATE_MS,
  concurrency: CONFIG.CONCURRENCY,
  maxQueue: CONFIG.MAX_QUEUE,
});

// ======== Utilidades ========
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ======== Función para detectar y obtener el GIF ========
function resolveGifPath() {
  if (process.env.WELCOME_GIF && fs.existsSync(process.env.WELCOME_GIF)) {
    return process.env.WELCOME_GIF;
  }
  if (fs.existsSync("dedosgif.gif")) return "dedosgif.gif";
  if (fs.existsSync("dedosgift.gif")) return "dedosgift.gif";
  return null;
}


const SHOP_GIF_URL = "https://message.style/cdn/images/b6b34048e6b8e4f2d6931af81a6935dbeb06d1d1a619dcf353733ab75bbcca8c.gif";
const USD_FORMATTER = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const DEFAULT_MXN_TO_USD_RATE = 0.058;
let mxnToUsdRate = parseFloat(process.env.MXN_USD_RATE || "0");
let usingFallbackRate = true;
let mxnToUsdLastUpdated = null;

if (mxnToUsdRate > 0) {
  usingFallbackRate = false;
  mxnToUsdLastUpdated = Date.now();
} else {
  mxnToUsdRate = DEFAULT_MXN_TO_USD_RATE;
}

async function refreshMxnToUsdRate() {
  if (process.env.MXN_USD_DISABLE_FETCH === "1") return;
  if (typeof fetch !== "function") return;
  try {
    const response = await fetch("https://open.er-api.com/v6/latest/MXN", {
      headers: { "User-Agent": "DedosShopBot/1.0 (+https://discord.gg/dedos)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const nextRate = Number(payload?.rates?.USD);
    if (Number.isFinite(nextRate) && nextRate > 0) {
      mxnToUsdRate = nextRate;
      usingFallbackRate = false;
      mxnToUsdLastUpdated = Date.now();
            if (CONFIG.SHOW_DEBUG) {
        console.log(`[FX] Tasa MXN->USD actualizada: ${nextRate.toFixed(4)}`);
      }
    }
  } catch (error) {
    console.warn(`[FX] No se pudo actualizar la tasa MXN->USD: ${error?.message || error}`);
  }
}

function formatUsdFromMxn(amountMxn) {
  const usdValue = amountMxn * mxnToUsdRate;
  return `~ ${USD_FORMATTER.format(usdValue)} USD`;
}


function buildUsdInfoField() {
  const rateText = mxnToUsdRate.toFixed(4);
  const detail = usingFallbackRate
    ? "Usamos una tasa predeterminada cuando no hay actualizacion automatica disponible."
    : "La tasa se actualiza de forma automatica cada 6 horas desde open.er-api.com.";
  const lastUpdateLine = mxnToUsdLastUpdated
    ? `Ultima actualizacion: ${new Date(mxnToUsdLastUpdated).toISOString()}.`
    : "Ultima actualizacion: no disponible (tasa predeterminada).";
  return {
    name: "Como calculamos el USD",
    value: [
      `Conversion MXN -> USD = ${rateText}.`,
      detail,
      lastUpdateLine,
    ].join("\n"),
  };
}


const fxInterval = setInterval(() => {
  refreshMxnToUsdRate().catch(() => {});
}, 6 * 60 * 60 * 1000);
if (typeof fxInterval.unref === "function") fxInterval.unref();
refreshMxnToUsdRate().catch(() => {});

function persistVerificationMessageId(id) {
  const safeId = id ? String(id) : "";
  verificationMessageId = safeId || null;
  CONFIG.VERIFICATION_MESSAGE_ID = safeId || null;

  const envPath = ".env";
  try {
    let envContent = "";
    let fileExists = true;

    try {
      envContent = fs.readFileSync(envPath, "utf8");
    } catch (readError) {
      if (readError.code === "ENOENT") {
        fileExists = false;
      } else {
        throw readError;
      }


    }

    const line = `VERIFICATION_MESSAGE_ID=${safeId}`;

    let updatedContent;
    if (fileExists) {
      if (/^VERIFICATION_MESSAGE_ID=.*$/m.test(envContent)) {
        updatedContent = envContent.replace(/^VERIFICATION_MESSAGE_ID=.*$/m, line);
      } else {
        const suffix = envContent.endsWith("\n") ? "" : "\n";
        updatedContent = `${envContent}${suffix}${line}\n`;
      }
    } else {
      updatedContent = `${line}\n`;
    }

    fs.writeFileSync(envPath, updatedContent, "utf8");
  } catch (error) {
    console.warn(
      "[VERIFY] No se pudo guardar VERIFICATION_MESSAGE_ID en .env:",
      error?.message || error
    );
  }
}



// ======== Funciones de embeds ========
function buildWelcomeEmbed(member) {
  let authorName = CONFIG.GUILD_URL;
  try {
    authorName = new URL(CONFIG.GUILD_URL).host || CONFIG.GUILD_URL;
  } catch {}

  const title = "¡Bienvenido a dedos!";
  const verificationLink = `https://discord.com/channels/${member.guild.id}/${CONFIG.VERIFICATION_CHANNEL_ID}`;
  const inviteLink = `https://discord.com/channels/${member.guild.id}/${CONFIG.INVITE_CHANNEL_ID}`;
  const description = [
    `Hola <@${member.id}>, gracias por unirte 👋`,
    `Ahora somos **${member.guild.memberCount}** miembros 🎉`,
    "\nPrimero verifica para obtener acceso a los canales:",
    `[#verificación](${verificationLink}) • [#invitación](${inviteLink})`,
    "\nAquí siempre tenemos eventos activos.",
    "Más info: consulta el canal de información del servidor.",
    "Soporte: usa el canal de ayuda.",
    "\nEste servidor es de **trades, middleman y ventas**.",
    "\n¡Disfruta tu estancia y no olvides invitar a tus amigos! 🙌",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(0x5000ab)
    .setTitle(title)
    .setAuthor({ name: authorName, iconURL: CONFIG.BRAND_ICON })
    .setDescription(description)
    .setFooter({ text: `Gracias por unirte a ${CONFIG.GUILD_URL}`, iconURL: CONFIG.BRAND_ICON });
}

function buildRulesEmbed() {
  return new EmbedBuilder()
    .setTitle("🎮 Reglas del Servidor")
    .setColor(0x5000ab)
    .setDescription(
      "Antes de participar en nuestra comunidad, asegúrate de leer cuidadosamente estas reglas. El cumplimiento garantiza una convivencia sana y una experiencia divertida para todos. ✅"
    )
    .addFields(
      {
        name: "📋 Reglas Generales",
        value:
          "**1. Respeto básico**\n" +
          "• Insultos casuales permitidos dentro del contexto de broma.\n" +
          "• Prohibido el acoso persistente, amenazas graves o ataques personales.\n" +
          "• Estrictamente prohibido el doxxing o compartir datos personales.\n\n" +
          "**2. Convivencia**\n" +
          "• Usa cada canal según su propósito.\n" +
          "• Respeta a moderadores y sus decisiones.\n" +
          "• Si surge un conflicto, resuélvelo en privado o pide mediación a un mod.",
      },
      {
        name: "🛒 Trading e Intercambios",
        value:
          "• Puedes tradear **cualquier ítem, cuenta o servicio gaming** en el canal de trading.\n" +
          "• **Trading con MM oficial:** protegido y regulado.\n" +
          "• **Trading directo:** bajo tu propio riesgo. No nos hacemos responsables de estafas.\n" +
          "• Prohibido el comercio de cuentas robadas o contenido ilegal.\n" +
          "• Para usar el MM oficial, contacta a un moderador.",
      },
      {
        name: "🚫 Contenido Prohibido",
        value:
          "**4. NSFW**\n" +
          "• Prohibido cualquier contenido sexual explícito, incluyendo avatares y nombres.\n\n" +
          "**5. Spam y Flood**\n" +
          "• No repitas mensajes ni hagas menciones masivas.\n" +
          "• Evita flood de imágenes, stickers o emojis.\n" +
          "• Máximo **5 mensajes seguidos** sin respuesta de otros.\n\n" +
          "**6. Contenido Malicioso**\n" +
          "• Prohibido compartir virus, malware, IP grabbers o links peligrosos.\n" +
          "• No publiques phishing o estafas. Reporta cualquier link sospechoso.",
      },
      {
        name: "⚖️ Sistema de Sanciones",
        value:
          "• **1ra vez:** Advertencia verbal.\n" +
          "• **2da vez:** Timeout temporal (1–24h).\n" +
          "• **3ra vez:** Expulsión (Kick).\n" +
          "• **Casos graves:** Ban inmediato (ej. doxxing, malware, amenazas serias).",
      }
    )
    .setFooter({
      text: "Básicamente: diviértete, comercia y sé respetuoso. No arruines la experiencia.",
    });
}

const SHOP_PAYMENT_METHODS_FIELD = {
  name: "Metodos de pago:",
  value: "<:emojigg_LTC:1417418373721096254>  -   **Litecoin**  -   <:20747paypal:1417021872889139283>  -   **PayPal**   -   <:oxxo:1417027814246449263>  -   **Oxxo**   -    🏦  -   **Transferencia**\n",
};

const SHOP_CLAUSULAS_FIELD = {
  name: "Clausulas:",
  value: "Los pagos mediante transferencia bancaria y OXXO están disponibles únicamente en México 🇲🇽. Los métodos PayPal <:20747paypal:1417021872889139283> y Litecoin <:emojigg_LTC:1417418373721096254> se encuentran habilitados a nivel global 🌎. En caso de utilizar PayPal, se aplicará un cargo adicional correspondiente a la comisión de la plataforma (aproximadamente 3%, variable según divisa y país de origen).",
};

const SHOP_STORE_PETS = [
  { name: " <:Discobee:1414419895348891689>  Disco Bee", mxn: 80 },
  { name: " <:gag_raccon:1417401527714320506> Raccon", mxn: 100 },
  { name: "<:Kitsune:1414434736880877650>  Kitsune", mxn: 260 },
  { name: "<:Butterfly:1417027669647949864>  Butterfly", mxn: 35 },
  { name: "<:DragonFly:1412701832311996499>  Dragonfly", mxn: 20 },
  { name: "<:Mimic_Octopus:1417027684751507476>  MImic", mxn: 20 },
];

const SHOP_PET_ROBUX_FIELDS = [
  {
    name: " <:Discobee:1414419895348891689>  Disco Bee",
    value: "    **500 Robux** <:9073robux:1417021867167846420>",
    inline: true,
  },
  {
    name: " <:gag_raccon:1417401527714320506> Raccon",
    value: "    **700 Robux** <:9073robux:1417021867167846420> ",
    inline: true,
  },
  {
    name: "<:Kitsune:1414434736880877650>  Kitsune",
    value: "    **1800 Robux** <:9073robux:1417021867167846420> ",
    inline: true,
  },
  {
    name: "<:Butterfly:1417027669647949864>  Butterfly",
    value: "    **300 Robux** <:9073robux:1417021867167846420> ",
    inline: true,
  },
  {
    name: "<:DragonFly:1412701832311996499>  Dragonfly",
    value: "     **80 Robux** <:9073robux:1417021867167846420>",
    inline: true,
  },
  {
    name: "<:Mimic_Octopus:1417027684751507476>  MImic",
    value: "      **80 Robux** <:9073robux:1417021867167846420> ",
    inline: true,
  },
  {
    name: " Clausulas",
    value: "No compramos ítems relacionados con Steal o Brainrot. Los precios no incluyen el 30% de tax que Roblox <:Roblox:1417027880080375929> descuenta en cada transacción. No realizamos pagos mediante in game gift (no se regalan pases dentro de ningún juego). Por seguridad, en el caso de los Raccoons <:gag_raccon:1417401527714320506> mantenemos un mínimo de 48 horas en nuestro inventario antes de liberar el pago, para evitar la compra de duplicados. **Esto aplica únicamente al Raccoon otras pets si son pago inmediato **<:gag_raccon:1417401527714320506>, ya que es el pet más duplicado del juego.",
  },
];

const TICKET_INFO_MENU_ID = "ticket_info_menu";
const TICKET_BUTTON_PREFIX = "ticket_open:";
const TICKET_CLOSE_BUTTON_ID = "ticket_close";

function applyShopBrand(embed) {
  return embed
    .setAuthor({ name: ".gg/dedos", iconURL: CONFIG.TICKET_BRAND_ICON })
    .setFooter({
      text: "En caso de dudas, en el canal de tickets puedes solicitar ayuda.",
      iconURL: CONFIG.TICKET_BRAND_ICON,
    })
    .setImage(SHOP_GIF_URL);
}

function buildTicketPanelEmbed() {
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("COMPRA | VENTA")
    .setDescription(
      "<a:27572sparkles:1417433396958728254>En 𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 puedes pets de Grow a Garden, Robux <:9073robux:1417021867167846420>, N17r0 B005tz <a:7478evolvingbadgenitroascaling:1417021865893036093>, Decoraciones<a:6633kittypaw14:1416604699716751370>, Tambien ofrecemos otros servicios de streaming a cambio de dinero o pets (Para mas informacion abre un ticket de ayuda). \n𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 tambien **te compra tus PETS de Grow a Garden por robux.**\n**📌 Selecciona una opción en el menú de abajo para obtener más información.**"
    )
    .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());
  return applyShopBrand(embed);
}

function buildTicketSellPetsEmbed() {
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("PETS QUE COMPRAMOS")
    .setDescription(
      "En 𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 compramos tus PETS de GAG por** ROBUX** <:9073robux:1417021867167846420>. <:50230exclamationpoint:1417021877829767168> La lista muestra precios promedio calculados según el valor real de robux y la demanda de cada pet, por lo que pueden subir o bajar según la popularidad del juego. <a:9062kittypaw04:1416604701847322685> ¿No estás conforme con el precio? Abre un ticket y haz tu** oferta**.\n"
    )
    .addFields(...SHOP_PET_ROBUX_FIELDS);
  return applyShopBrand(embed);
}

function buildTicketBuyPetsEmbed() {
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("PETS QUE VENDEMOS")
    .setDescription(
      "𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 es tu mejor opción para adquirir pets de **Grow a Garden.**\nGarantizamos **precios más bajos** que la competencia y una experiencia de compra confiable."
    );

  for (const item of SHOP_STORE_PETS) {
    embed.addFields({
      name: item.name,
      value: `    **${item.mxn} MXN**\n${formatUsdFromMxn(item.mxn)}`,
      inline: true,
    });
  }

  embed.addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());
  return applyShopBrand(embed);
}

function buildTicketRobuxEmbed() {
  const priceByGroup = formatUsdFromMxn(125);
  const priceByGame = formatUsdFromMxn(125);
  const priceByGamepass = formatUsdFromMxn(135);

  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("COMPRAR ROBUX")
    .setDescription("𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 vende robux a los mejores precios. Ofrecioendo pagos por grupo o por gamepass.")
    .addFields(
      {
        name: "1000 ROBUX | PAGO POR GRUPO ",
        value: [
          "La opción **más conveniente** para adquirir Robux <:9073robux:1417021867167846420> es mediante pago por grupo. Únicamente debes unirte y permanecer en el grupo un mínimo de **2 semanas** para habilitar los envíos.",
          "Una vez cumplida la antigüedad requerida, los pagos se realizan de forma inmediata y recibirás exactamente 1000 Robux.",
          `**El costo es de $125 MXN por cada 1000 Robux** (${priceByGroup}).`,
          "**Grupo:** https://www.roblox.com/es/communities/12082479/unnamed#!/about",
        ].join("\n"),
      },
      {
        name: "1000 ROBUX | PAGO POR JUEGO",
        value: [
          "Esta es una alternativa conveniente si deseas utilizar Robux <:9073robux:1417021867167846420> para adquirir objetos o gamepasses en tu juego favoo.",
          "Realizas la compra de los Robux y recibirás el equivalente en el objeto o gamepass de tu elección.",
          `**El costo es de $125 MXN por cada 1000 Robux** (${priceByGame}).`,
        ].join("\n"),
      },
      {
        name: "1000 ROBUX | PAGO POR GAMEPASS",
        value: [
          "Esta es la opción menos recomendable<:50230exclamationpoint:1417021877829767168>, ya que funciona mediante gamepass, similar a Pls Donate.",
          "Roblox aplica una deducción del 30%, por lo que es necesario enviar 1,429 Robux para que recibas 1,000 netos.",
          "Además, el monto se acredita como pendiente y tarda entre 6 y 8 días en reflejarse en tu cuenta.",
          `**El costo es de $135 MXN por cada 1,000 Robux** (${priceByGamepass}).`,
        ].join("\n"),
      }
    )
    .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());

  return applyShopBrand(embed);
}

function buildTicketNitroEmbed() {
  const priceNitro = formatUsdFromMxn(95);
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("COMPRAR N17r0 B005tz")
    .setDescription(
      "Dedos Shop vende **N17r0 B005tz** al mejor precio de la competencia: **95 MXN por 1 mes.** " +
        `${priceNitro} Al ser legal paid, este tipo de NB es dificil de conseguir, por lo que pedimos disculpas en caso de no contar con stock disponible. A diferencia de otros, aqui no corres riesgo de recibir advertencias en tu cuenta de Discord ni de que sea revocado antes de completar el mes contratado.`
    )
    .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());

  return applyShopBrand(embed);
}

function buildTicketDecorationsEmbed() {
  const embed = new EmbedBuilder()
    .setColor(7602431)
    .setTitle("COMPRAR DECORACIONES")
    .setDescription(
      "𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 vende decoraciones y efectos legal paid por regalo de perfil\n$4.99 <a:51047animatedarrowwhite:1417021879411281992>    $3.1 \n$5.99  <a:51047animatedarrowwhite:1417021879411281992>    $3.3\n$6.99 <a:51047animatedarrowwhite:1417021879411281992>      $3.6 \n$7.99  <a:51047animatedarrowwhite:1417021879411281992>   $3.9\n$8.49 <a:51047animatedarrowwhite:1417021879411281992>      $4.05\n$9.99  <a:51047animatedarrowwhite:1417021879411281992>      $5\n$11.99 <a:51047animatedarrowwhite:1417021879411281992>    $5.5\nPrecio de la izquierda es a lo que discord los vende, el de la derecha es el precio que 𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 lo vende."
    )
    .addFields({ ...SHOP_PAYMENT_METHODS_FIELD }, { ...SHOP_CLAUSULAS_FIELD }, buildUsdInfoField());

  return applyShopBrand(embed);
}

const SHOP_TICKET_OPTIONS = [
  {
    id: "sell_pets",
    menuLabel: "Vender tus pets (Robux)",
    menuDescription: "Cotizamos tus mascotas de Grow a Garden por Robux.",
    embedBuilder: buildTicketSellPetsEmbed,
    channelPrefix: "venta",
    emoji: "🦊",
    introLines: [
      "Gracias por confiar en 𝔻𝕖𝕕𝕠𝕤 𝕊𝕙𝕠𝕡 para vender tus pets de Grow a Garden.",
      "Incluye la lista de pets que ofreces y la cantidad deseada en Robux.",
      "Adjunta capturas o pruebas de inventario si es posible.",
    ],
  },
  {
    id: "buy_pets",
    menuLabel: "Comprar pets (MXN / USD)",
    menuDescription: "Consulta precios actualizados en pesos y dólares.",
    embedBuilder: buildTicketBuyPetsEmbed,
    channelPrefix: "compra",
    emoji: "🌱",
    introLines: [
      "Cuéntanos qué pets deseas comprar y cuántas unidades necesitas.",
      "Indica tu método de pago favorito (PayPal, Litecoin, Oxxo, transferencia).",
      "El equipo te confirmará stock y proceso de pago en breve.",
    ],
  },
  {
    id: "buy_robux",
    menuLabel: "Comprar Robux",
    menuDescription: "Elige grupo, juego o gamepass y abre tu ticket.",
    embedBuilder: buildTicketRobuxEmbed,
    channelPrefix: "robux",
    emoji: "💎",
    introLines: [
      "Indica si prefieres recibir Robux por grupo, juego o gamepass.",
      "Comparte tu usuario de Roblox y cualquier detalle adicional.",
      "Asegúrate de leer las condiciones y tiempos detallados en la información.",
    ],
  },
  {
    id: "buy_nitro",
    menuLabel: "Comprar N17r0 B005tz",
    menuDescription: "Reserva b005tz legales al mejor precio.",
    embedBuilder: buildTicketNitroEmbed,
    channelPrefix: "n17r0",
    emoji: "🚀",
    introLines: [
      "Dinos cuantos meses de N17r0 B005tz necesitas y para que servidor.",
      "Comparte el metodo de pago y, si aplica, la fecha en la que lo requieres.",
      "Recuerda que el stock es limitado y puede agotarse rapidamente.",
    ],
  },
  {
    id: "buy_decor",
    menuLabel: "Comprar decoraciones",
    menuDescription: "Obten efectos y regalos premium más baratos.",
    embedBuilder: buildTicketDecorationsEmbed,
    channelPrefix: "decor",
    emoji: "🎁",
    introLines: [
      "Enumera las decoraciones o efectos que te interesan y sus precios.",
      "Indica si necesitas el regalo para un perfil específico o para ti.",
      "Te confirmaremos disponibilidad y pasos a seguir para cerrar la compra.",
    ],
  },
];

const SHOP_TICKET_OPTION_MAP = new Map(SHOP_TICKET_OPTIONS.map((option) => [option.id, option]));

const ticketCooldowns = new Map();

function sanitizeTicketNameSegment(value) {
  return (
    (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cliente"
  );
}

function buildTicketChannelName(option, user) {
  const username = sanitizeTicketNameSegment(
    user.username || user.globalName || user.displayName || "cliente"
  );
  const suffixBase =
    user.discriminator && user.discriminator !== "0"
      ? user.discriminator
      : user.id.slice(-4);
  const raw = `${option.channelPrefix}-${username}-${suffixBase}`.replace(/-+/g, "-");
  return raw.length > 95 ? raw.slice(0, 95) : raw;
}

function parseTicketTopic(topic) {
  if (!topic || !topic.startsWith("TICKET:")) return null;
  const parts = topic.split(":");
  if (parts.length < 3) return null;
  const optionId = parts[1];
  const userPart = parts.slice(2).join(":").split("|")[0].trim();
  if (!optionId || !userPart) return null;
  return { optionId, userId: userPart };
}

async function findExistingTicketChannels(guild, userId) {
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

async function resolveTicketParentChannelId(guild) {
  if (CONFIG.TICKET_CATEGORY_ID) {
    const category =
      guild.channels.cache.get(CONFIG.TICKET_CATEGORY_ID) ||
      (await guild.channels.fetch(CONFIG.TICKET_CATEGORY_ID).catch(() => null));
    if (category?.type === ChannelType.GuildCategory) {
      return category.id;
    }
  }

  if (CONFIG.TICKET_PANEL_CHANNEL_ID) {
    const panelChannel =
      guild.channels.cache.get(CONFIG.TICKET_PANEL_CHANNEL_ID) ||
      (await guild.channels.fetch(CONFIG.TICKET_PANEL_CHANNEL_ID).catch(() => null));
    if (panelChannel?.parentId) {
      return panelChannel.parentId;
    }
  }

  return null;
}

function buildTicketIntroEmbed(option, user) {
  const lines = [
    `Hola <@${user.id}> 👋`,
    ...option.introLines,
    "",
    "Un miembro del staff te atenderá a la brevedad. Si necesitas cerrar el ticket, avisa cuando quedes conforme.",
  ];
  return applyShopBrand(
    new EmbedBuilder()
      .setColor(7602431)
      .setTitle(`Ticket abierto: ${option.menuLabel}`)
      .setDescription(lines.join("\n"))
      .setTimestamp()
  );
}

async function handleTicketOpen(interaction) {
  const optionId = interaction.customId.slice(TICKET_BUTTON_PREFIX.length);
  const option = SHOP_TICKET_OPTION_MAP.get(optionId);

  if (!option) {
    await interaction.reply({
      content: "Esta opción de ticket ya no está disponible.",
      ephemeral: true,
    });
    return;
  }

  const userId = interaction.user.id;
  const now = Date.now();
  const lastUse = ticketCooldowns.get(userId) || 0;
  const remaining = CONFIG.TICKET_COOLDOWN_MS - (now - lastUse);

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
      content: "No pude abrir el ticket en este servidor. Intenta de nuevo.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  let existingChannels;
  try {
    existingChannels = await findExistingTicketChannels(guild, userId);
  } catch (error) {
    console.error("[TICKETS] No se pudo listar tickets existentes:", error);
    await interaction.editReply({
      content: "No pude revisar tus tickets actuales. Inténtalo de nuevo más tarde.",
    });
    return;
  }

  const openChannels = existingChannels.filter((channel) => channel && !channel.deleted);
  if (openChannels.length >= CONFIG.TICKET_MAX_PER_USER) {
    const mentions = openChannels.map((channel) => `<#${channel.id}>`).join(", ");
    await interaction.editReply({
      content: `Ya tienes ${openChannels.length} ticket(s) abierto(s): ${mentions}. Cierra alguno antes de abrir otro.`,
    });
    return;
  }

  const staffRoleIds = CONFIG.TICKET_STAFF_ROLE_IDS.filter((roleId) =>
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
    parentId = await resolveTicketParentChannelId(guild);
  } catch (error) {
    console.warn("[TICKETS] No se pudo resolver categoría de tickets:", error);
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
    console.error("[TICKETS] Error creando el canal:", error);
    await interaction.editReply({
      content: "No pude crear el ticket. Contacta al staff para recibir ayuda.",
    });
    return;
  }

  const introEmbed = buildTicketIntroEmbed(option, interaction.user);
  const mentions = [`<@${userId}>`];
  if (staffRoleIds.length > 0) {
    mentions.push(...staffRoleIds.map((roleId) => `<@&${roleId}>`));
  }

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLOSE_BUTTON_ID)
      .setLabel("Cerrar ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒")
  );

  try {
    await ticketChannel.send({
      content: mentions.join(" "),
      embeds: [introEmbed],
      components: [closeRow],
    });
  } catch (error) {
    console.warn("[TICKETS] No se pudo enviar el mensaje inicial del ticket:", error);
  }

  ticketCooldowns.set(userId, now);

  await interaction.editReply({
    content: `Tu ticket se abrió en <#${ticketChannel.id}>. ¡Gracias por escribirnos!`,
  });
}
async function handleTicketClose(interaction) {
  const channel = interaction.channel;
  const guild = interaction.guild;

  if (!channel || channel.type !== ChannelType.GuildText || !guild) {
    await interaction.reply({
      content: "Este boton solo funciona dentro de un ticket.",
      ephemeral: true,
    }).catch(() => {});
    return;
  }

  const info = parseTicketTopic(channel.topic);
  if (!info) {
    await interaction.reply({
      content: "No pude identificar los datos de este ticket. Contacta a un administrador.",
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

  const staffRoleIds = CONFIG.TICKET_STAFF_ROLE_IDS;
  const hasStaffRole = Boolean(member?.roles?.cache?.some((role) => staffRoleIds.includes(role.id)));
  const isAdmin = Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator));

  if (!hasStaffRole && !isAdmin) {
    const embed = applyShopBrand(
      new EmbedBuilder()
        .setColor(0xff3366)
        .setTitle("Acceso denegado")
        .setDescription("Solo el staff de tickets o un administrador puede cerrar este ticket.")
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
        if (button.data?.custom_id === TICKET_CLOSE_BUTTON_ID) {
          button.setDisabled(true).setLabel("Ticket cerrado");
        }
        actionRow.addComponents(button);
      }
      return actionRow;
    });
    if (disabledRows.length > 0) {
      await interaction.message.edit({ components: disabledRows });
    }
  } catch (error) {
    console.warn("[TICKETS] No se pudo actualizar el mensaje del ticket:", error);
  }

  await interaction.reply({
    content: "Ticket cerrado. Este canal se eliminara en 10 segundos.",
    ephemeral: true,
  }).catch(() => {});

  await channel
    .send({
      content: "[LOCK] Ticket cerrado por " + interaction.user.toString() + ". El canal se eliminara en 10 segundos.",
    })
    .catch(() => {});

  setTimeout(() => {
    channel.delete(`Ticket cerrado por ${interaction.user.tag}`).catch(() => {});
  }, 10_000);
}

// ======== Event Listeners ========
bot.once("ready", () => {
  console.log(`✅ Bot conectado como ${bot.user.tag}`);
  bot.user.setPresence({
    activities: [{ name: "nuevos miembros y reglas", type: ActivityType.Watching }],
    status: "online",
  });
  welcomeQueue.start();
});

// ======== Comando !reglas para enviar el embed principal ========
bot.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const member = message.member;
  if (!member?.permissions?.has("Administrator")) return;

  const content = message.content.trim();

  if (content === "!reglas") {
    const reglasEmbed = buildRulesEmbed();

    const gifPath = resolveGifPath();
    if (gifPath) {
      reglasEmbed.setImage("attachment://dedosgif.gif");
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("menu_inquietudes")
      .setPlaceholder("Elige una pregunta de ayuda")
      .addOptions([
        { label: "¿Qué son los eventos?", value: "eventos" },
        { label: "¿Qué se puede hacer en el servidor?", value: "servidor" },
        { label: "¿Cómo verificarse?", value: "verificacion" },
      ]);

    const row = new ActionRowBuilder().addComponents(menu);

    const payload = { embeds: [reglasEmbed], components: [row] };
    if (gifPath) payload.files = [{ attachment: gifPath, name: "dedosgif.gif" }];

    const sent = await message.channel.send(payload);
    persistVerificationMessageId(sent.id);
    await sent.react("✅");
    return;
  }

  if (content === "!tickets") {
    const panelEmbed = buildTicketPanelEmbed();
    const menu = new StringSelectMenuBuilder()
      .setCustomId(TICKET_INFO_MENU_ID)
      .setPlaceholder("Selecciona el servicio que necesitas")
      .addOptions(
        SHOP_TICKET_OPTIONS.map((option) => {
          const optionData = {
            label: option.menuLabel,
            value: option.id,
          };
          if (option.menuDescription) {
            optionData.description = option.menuDescription.slice(0, 100);
          }
          if (option.emoji) {
            optionData.emoji = option.emoji;
          }
          return optionData;
        })
      );

    const row = new ActionRowBuilder().addComponents(menu);

    let targetChannel = message.channel;
    if (CONFIG.TICKET_PANEL_CHANNEL_ID) {
      const fetched = await message.guild.channels
        .fetch(CONFIG.TICKET_PANEL_CHANNEL_ID)
        .catch(() => null);
      if (fetched && typeof fetched.isTextBased === "function" && fetched.isTextBased()) {
        targetChannel = fetched;
      } else {
        await message.reply({
          content: "No pude encontrar el canal configurado para el panel de tickets.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
    }

    await targetChannel.send({ embeds: [panelEmbed], components: [row] });

    if (targetChannel.id !== message.channel.id) {
      await message.reply({
        content: `Panel de tickets publicado en <#${targetChannel.id}>.`,
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }
});

// ======== Verificación por reacción ========
bot.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (reaction.partial) {
      await reaction.fetch();
    }
  } catch (error) {
    console.error("[VERIFY] No se pudo recuperar la reacción:", error);
    return;
  }

  if (user.bot) return;

  const emojiMatches = reaction.emoji?.name === "✅";
  const channelMatches = reaction.message?.channel?.id === CONFIG.VERIFICATION_CHANNEL_ID;
  const messageMatches =
    !verificationMessageId || reaction.message.id === verificationMessageId;

  if (!emojiMatches || !channelMatches || !messageMatches) return;

  const guild = reaction.message.guild;
  if (!guild) return;

  let member;
  try {
    member = await guild.members.fetch(user.id);
  } catch (error) {
    console.error(`[VERIFY] No se pudo obtener al miembro ${user.id}:`, error);
    return;
  }

  if (member.roles.cache.has(CONFIG.ROLE_ID)) {
    if (CONFIG.SHOW_DEBUG) {
      console.log(`[VERIFY] ${user.tag} ya estaba verificado.`);
    }
    return;
  }

  try {
    await member.roles.add(CONFIG.ROLE_ID);
    console.log(`[VERIFY] Rol asignado a ${user.tag}.`);
  } catch (error) {
    console.error(`[VERIFY] Error asignando rol a ${user.tag}:`, error);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x5000ab)
    .setTitle("✅ ¡Verificación completada!")
    .setDescription([
      `¡Gracias por verificarte, <@${member.id}>!`,
      "Ya tienes acceso completo al servidor.",
      `Si necesitas ayuda, visita ${CONFIG.HELP_URL}.`,
    ].join("\n"))
    .setFooter({ text: `Bienvenido a ${CONFIG.GUILD_URL}`, iconURL: CONFIG.BRAND_ICON })
    .setTimestamp();

  const gifPath = resolveGifPath();
  const payload = { embeds: [embed], content: CONFIG.GUILD_URL };

  if (gifPath) {
    embed.setImage("attachment://dedosgif.gif");
    payload.files = [{ attachment: gifPath, name: "dedosgif.gif" }];
  }

  try {
    await user.send(payload);
  } catch (error) {
    console.warn(`[VERIFY] No pude enviar el DM a ${user.tag}:`, error?.message || error);
  }
});

// ======== Menú de ayuda ========
bot.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "menu_inquietudes") {
        const selection = interaction.values[0];
        let embed;

        if (selection === "eventos") {
          embed = new EmbedBuilder()
            .setTitle("Eventos y premios")
            .setDescription(
              "Los eventos son dinámicas especiales que premian a los usuarios más activos del servidor.\n\n" +
                "**Siempre hay eventos en curso.**\n\n" +
                "Para ver los eventos actuales:\n" +
                "- Revisa el canal de anuncios (desbloqueado tras verificarte).\n" +
                "- Encontrarás toda la información: reglas, fechas, cómo participar y premios."
            )
            .setColor(0x5000ab);
        }

        if (selection === "servidor") {
          embed = new EmbedBuilder()
            .setTitle("¿Qué puedo hacer en el servidor?")
            .setDescription(
              "Estas son las principales actividades dentro del servidor:\n\n" +
                "- Participa en eventos y gana recompensas por tu actividad.\n" +
                "- Usa nuestro middleman oficial sin propinas obligatorias.\n" +
                "- Compra en la tienda con los mejores precios del mercado.\n" +
                "- Convive, tradea y aporta sugerencias para seguir creciendo."
            )
            .setColor(0x5000ab);
        }

        if (selection === "verificacion") {
          const enlace = verificationMessageId
            ? `https://discord.com/channels/${interaction.guild?.id}/${CONFIG.VERIFICATION_CHANNEL_ID}/${verificationMessageId}`
            : "el mensaje de verificación (usa !reglas para volver a generarlo)";

          embed = new EmbedBuilder()
            .setTitle("Verificación")
            .setDescription(`Para verificarte, reacciona con la ✅ en ${enlace}.`)
            .setColor(0x5000ab);
        }

        if (!embed) {
          await interaction.reply({ content: "No pude encontrar información para esa opción.", ephemeral: true });
          return;
        }

        const gifPath = resolveGifPath();
        if (gifPath) {
          embed.setImage("attachment://dedosgif.gif");
        }

        const replyPayload = {
          embeds: [embed],
          content: "discord.gg/dedos",
          ephemeral: true,
        };
        if (gifPath) {
          replyPayload.files = [{ attachment: gifPath, name: "dedosgif.gif" }];
        }

        await interaction.reply(replyPayload);
        return;
      }

      if (interaction.customId === TICKET_INFO_MENU_ID) {
        const optionId = interaction.values[0];
        const option = SHOP_TICKET_OPTION_MAP.get(optionId);
        if (!option) {
          await interaction.reply({
            content: "Esta opción ya no está disponible.",
            ephemeral: true,
          });
          return;
        }

        const embed = option.embedBuilder();
        const button = new ButtonBuilder()
          .setCustomId(`${TICKET_BUTTON_PREFIX}${option.id}`)
          .setLabel("Abrir ticket")
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true,
        });
        return;
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith(TICKET_BUTTON_PREFIX)) {
        await handleTicketOpen(interaction);
        return;
      }
      if (interaction.customId === TICKET_CLOSE_BUTTON_ID) {
        await handleTicketClose(interaction);
        return;
      }
    }
  } catch (error) {
    console.error("[INTERACTION] Error manejando interacción:", error);
    if (interaction.isRepliable()) {
      try {
        if (interaction.deferred && !interaction.replied) {
          await interaction.editReply({ content: "Ocurrió un error al procesar la interacción." });
        } else if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            content: "Ocurrió un error al procesar la interacción.",
            ephemeral: true,
          });
        }
      } catch (replyError) {
        console.warn("[INTERACTION] No se pudo responder al error:", replyError);
      }
    }
  }
});

// ======== Bienvenidas por DM ========
bot.on("guildMemberAdd", (member) => {
  const queued = welcomeQueue.push(async () => {
    const embed = buildWelcomeEmbed(member);

    // Botones con enlaces
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Servidor").setURL(CONFIG.GUILD_URL),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Verificación")
        .setURL(`https://discord.com/channels/${member.guild.id}/${CONFIG.VERIFICATION_CHANNEL_ID}`),
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Invitación")
        .setURL(`https://discord.com/channels/${member.guild.id}/${CONFIG.INVITE_CHANNEL_ID}`),
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Ayuda").setURL(CONFIG.HELP_URL)
    );

    // Detectar GIF
    const gifPath = resolveGifPath();
    if (gifPath) {
      embed.setImage("attachment://dedosgif.gif");
    }

    const payload = { content: CONFIG.GUILD_URL, embeds: [embed], components: [row] };
    if (gifPath) payload.files = [{ attachment: gifPath, name: "dedosgif.gif" }];

    try {
      await member.send(payload);
      if (CONFIG.SHOW_DEBUG) console.log(`✉️  DM enviado a ${member.user.tag}`);
    } catch (err) {
      const code = err?.code || err?.name || "ERR";
      console.warn(`⚠️  No se pudo enviar DM a ${member.user.tag} [${code}]`);
    }
  });

  if (!queued) {
    // Si la cola está saturada, evitamos presión adicional.
    console.warn(`⛔ Cola saturada. DM omitido para ${member.user.tag}`);
  }
});

// ======== Manejo de errores ========
bot.on("error", (e) => console.error("[CLIENT] Error:", e));
bot.on("warn", (m) => CONFIG.SHOW_DEBUG && console.warn("[CLIENT] Warn:", m));
bot.on("shardError", (e, id) => console.error(`[SHARD ${id}] Error:`, e));

// ======== Manejo global de errores (fail-fast + reinicio por supervisor) ========
let shuttingDown = false;
async function shutdown(code = 1) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    welcomeQueue.stop();
    await bot.destroy();
  } catch {}
  finally {
    // Salimos para que el supervisor (PM2/NSSM) reinicie
    process.exit(code);
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Promesa no manejada:", reason);
  shutdown(1);
});
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Excepción no capturada:", err);
  shutdown(1);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ======== Login con reintentos exponenciales ========
async function loginWithRetry(token) {
  const maxAttempts = Math.max(1, parseInt(process.env.LOGIN_MAX_ATTEMPTS || "6", 10));
  let delay = Math.max(1000, parseInt(process.env.LOGIN_RETRY_MS || "5000", 10));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await bot.login(token);
      return; // listo
    } catch (err) {
      const msg = String(err?.message || err);
      // Token inválido: terminar sin reintentos
      if (/invalid.*token/i.test(msg) || /401/.test(msg)) {
        console.error("[FATAL] TOKEN inválido. Saliendo.");
        return shutdown(1);
      }
      console.warn(`Login falló (intento ${attempt}/${maxAttempts}): ${msg}`);
      if (attempt === maxAttempts) {
        console.error("[FATAL] No se pudo iniciar sesión tras múltiples intentos.");
        return shutdown(1);
      }
      await sleep(delay);
      delay = Math.min(delay * 2, 60_000); // tope 60s
    }
  }
}

loginWithRetry(process.env.TOKEN);
