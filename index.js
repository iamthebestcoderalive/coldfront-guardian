require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const ai = require('./src/ai_engine');
const fs = require('fs');
const path = require('path');
const express = require('express');

// --- Render / Uptime Robot Keep-Alive ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('ColdFront Guardian Active ❄️');
});

app.listen(port, () => {
    console.log(`Web server listening on port ${port}`);
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

let newsMemory = "No news yet.";
// Reading persona file synchronously on startup
const PERSONA_PATH = path.join(__dirname, 'persona.txt');
let systemPersona = "";

try {
    systemPersona = fs.readFileSync(PERSONA_PATH, 'utf-8');
} catch (err) {
    console.error("Error reading persona.txt:", err);
    systemPersona = "You are the ColdFront Support Bot. You are serious and cold."; // Fallback
}

const NEWS_CATEGORY_ID = '1458368095751241840';

client.once('ready', async () => {
    await ai.init();
    console.log(`ColdFront Guardian active: ${client.user.tag}`);

    // 1. Read News on Startup (Category Scan)
    const newsCategory = client.channels.cache.get(NEWS_CATEGORY_ID);
    if (newsCategory) {
        let allNews = [];
        // Filter for text channels in this category
        const channels = newsCategory.children.cache.filter(c => c.isTextBased());

        for (const [id, channel] of channels) {
            try {
                const messages = await channel.messages.fetch({ limit: 5 });
                messages.forEach(m => {
                    // IMPORTANT: Capture distinct Date and Content
                    allNews.push({
                        date: m.createdAt,
                        text: `[${m.createdAt.toDateString()}] (${channel.name}): ${m.content}`
                    });
                });
            } catch (err) {
                console.error(`Failed to read news from ${channel.name}:`, err);
            }
        }

        // Sort by date (newest first)
        allNews.sort((a, b) => b.date - a.date);

        // Take top 15 entries to avoid context overflow
        newsMemory = allNews.slice(0, 15).map(n => n.text).join('\n');
        console.log("News loaded into Memory (Category Scan Complete).");
    } else {
        console.warn("News Category NOT FOUND. Check ID.");
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 2. Handle Closing
    if (message.content.toLowerCase() === '/close') {
        if (message.channel.name.includes('ticket')) {
            message.channel.send("Closing ticket...");
            setTimeout(() => message.channel.delete(), 5000);
            return;
        }
    }

    // 3. Support Logic (Only reply in tickets or if mentioned)
    if (message.channel.name.includes('ticket') || message.mentions.has(client.user)) {
        await message.channel.sendTyping();

        // Combine Persona and News
        let fullContext = systemPersona;
        if (fullContext.includes('[NEWS_CONTEXT]')) {
            fullContext = fullContext.replace('[NEWS_CONTEXT]', newsMemory);
        } else {
            fullContext = `${fullContext}\n\nCurrent News/Status: ${newsMemory}`;
        }

        const response = await ai.generate(message.content, fullContext);
        message.reply(response);
    }
});

client.login(process.env.DISCORD_TOKEN);
