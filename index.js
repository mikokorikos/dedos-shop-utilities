// ===================================================================
// You can delete all these files and upload your project or bot.
// ===================================================================

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

// Change your discord bot token in the .env file
client.login('Your token here')
