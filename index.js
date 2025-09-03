// ===================================================================
// English: You can delete all these files and upload your project or bot.
// Español: Puede eliminar todos estos archivos y cargar tu propio proyecto o bot.
// ===================================================================

// This bot is just an example. When you type "ping" in a Discord channel, the bot responds with the message "pong".
// Este bot es solo un ejemplo. Cuando escribes "ping" en un canal de Discord, el bot responde con el mensaje "pong".

const { Client, Events, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on("message", msg => {
    if (msg.content === "ping") {
        msg.reply("pong");
    }
})

// Change your discord bot token here
// Cambia aquí tu token de Discord Bot
client.login('Your token here')

