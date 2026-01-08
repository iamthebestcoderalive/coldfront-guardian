require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, REST, Routes, ButtonBuilder, ButtonStyle } = require('discord.js');
const ai = require('./src/ai_engine');
const fs = require('fs');
const path = require('path');
const express = require('express');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// --- STATE MANAGEMENT ---
const HANGOUT_TIME = 180 * 1000; // 3 minutes in ms
const hangoutUsers = new Map(); // Map<userId, timestamp>

// --- PATTERNS ---
// --- Persona Load ---
const PERSONA_PATH = path.join(__dirname, 'docs', 'persona.md');
let systemPersona = "";

function loadPersona() {
    try {
        if (fs.existsSync(PERSONA_PATH)) {
            systemPersona = fs.readFileSync(PERSONA_PATH, 'utf-8');
            console.log("✅ Persona loaded from docs/persona.md");
        } else {
            console.warn("⚠️ persona.md not found, using default.");
            systemPersona = "You are Birno, the ColdFront Support Assistant.";
        }
    } catch (err) {
        console.error("Error reading persona:", err);
    }
}

const CONFIG_PATH = path.join(__dirname, 'config.json');
let NEWS_CATEGORY_ID = null;
let newsMemory = "";

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            NEWS_CATEGORY_ID = config.NEWS_CATEGORY_ID || null;
            console.log(`✅ Config loaded. NEWS_CATEGORY_ID: ${NEWS_CATEGORY_ID || 'Not Set'}`);
        } else {
            console.warn("⚠️ config.json not found, starting with no news category.");
        }
    } catch (err) {
        console.error("Error reading config:", err);
    }
}

function saveConfig(categoryId) {
    NEWS_CATEGORY_ID = categoryId;
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({ NEWS_CATEGORY_ID: categoryId }, null, 2), 'utf-8');
        console.log(`✅ Config saved. NEWS_CATEGORY_ID set to ${categoryId}`);
    } catch (err) {
        console.error("Error writing config:", err);
    }
}

client.once('ready', async () => {
    loadConfig();
    loadPersona();
    await ai.init();
    console.log(`❄️ ColdFront Guardian active: ${client.user.tag}`);

    // Register Slash Command
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Refreshing application (/) commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: [{
                    name: 'setup',
                    description: 'Configure the News Category for the bot',
                    default_member_permissions: "8" // Administrator only
                }]
            },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    // Initial News Load
    if (NEWS_CATEGORY_ID) await scanNews();
});

async function scanNews() {
    if (!NEWS_CATEGORY_ID) return;
    const newsCategory = client.channels.cache.get(NEWS_CATEGORY_ID);
    if (newsCategory) {
        let allNews = [];
        const channels = newsCategory.children.cache.filter(c => c.isTextBased());

        for (const [id, channel] of channels) {
            try {
                const messages = await channel.messages.fetch({ limit: 5 });
                messages.forEach(m => {
                    allNews.push({
                        date: m.createdAt,
                        text: `[${m.createdAt.toDateString()}] (${channel.name}): ${m.content}`
                    });
                });
            } catch (err) { }
        }
        allNews.sort((a, b) => b.date - a.date);
        newsMemory = allNews.slice(0, 15).map(n => n.text).join('\n');
        console.log("News refreshed.");
    }
}

client.on('interactionCreate', async interaction => {
    // 1. Handle Command
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup') {
            const categories = interaction.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildCategory)
                .map(c => ({ label: c.name, value: c.id }))
                .slice(0, 25);

            if (categories.length === 0) return interaction.reply("No categories found.");

            const select = new StringSelectMenuBuilder()
                .setCustomId('select_news_category')
                .setPlaceholder('Select the News Category')
                .addOptions(categories.map(c => new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(c.value)));

            // Add Save Button
            const btn = new ButtonBuilder()
                .setCustomId('btn_save_setup')
                .setLabel('Save & Continue')
                .setStyle(ButtonStyle.Success);

            const row1 = new ActionRowBuilder().addComponents(select);
            const row2 = new ActionRowBuilder().addComponents(btn);

            await interaction.reply({
                content: 'Please select the category where you post Server News:',
                components: [row1, row2],
                ephemeral: true
            });
        }
    }

    // 2. Handle Dropdown
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_news_category') {
            const selectedId = interaction.values[0];
            saveConfig(selectedId);
            await interaction.deferUpdate();
        }
    }

    // 3. Handle Save Button
    if (interaction.isButton()) {
        if (interaction.customId === 'btn_save_setup') {
            if (!NEWS_CATEGORY_ID) {
                return interaction.reply({ content: "⚠️ Please select a category first.", ephemeral: true });
            }
            await interaction.update({
                content: `✅ **News Category Saved Successfully.**\nSystem updated for <#${NEWS_CATEGORY_ID}>.\nNews context is refreshing in the background...`,
                components: []
            });
            scanNews().catch(err => console.error("BG Scan Error:", err));
        }
    }
});

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    if (message.content.toLowerCase() === '/close') {
        if (message.channel.name.includes('ticket')) {
            message.channel.send("Closing ticket...");
            setTimeout(() => message.channel.delete(), 5000);
            return;
        }
    }

    if (message.channel.name.includes('ticket') || message.mentions.has(client.user)) {
        await message.channel.sendTyping();

        let fullContext = systemPersona;
        if (fullContext.includes('[NEWS_CONTEXT]')) {
            fullContext = fullContext.replace('[NEWS_CONTEXT]', newsMemory);
        } else {
            fullContext = `${fullContext}\n\nCurrent News/Status: ${newsMemory}`;
        }
        // Clean text
        let cleanText = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        if (!cleanText) cleanText = "Hello!";

        // Latency 2: Typing & Generation
        try {
            await message.channel.sendTyping();

            const reply = await ai.generate(cleanText, SYSTEM_PROMPT);

            if (reply && !reply.startsWith("Error:")) {
                // Truncate if too long
                const safeReply = reply.length > 1900 ? reply.substring(0, 1900) + '...' : reply;
                await message.reply(safeReply);
            } else {
                console.log("AI Failed or returned error:", reply);
            }
        } catch (err) {
            console.error("Error sending reply:", err);
        }
    }
});

// Create src directory if not needed (script is at root) but module is in src/
// We need to ensure src dir exists as well if it doesn't.
// Graceful shutdown
const cleanup = async () => {
    console.log('\n🛑 Shutting down...');
    await ai.shutdown();
    await client.destroy();
    process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Login
if (!process.env.DISCORD_TOKEN) {
    console.error("❌ DISCORD_TOKEN missing in .env");
} else {
    client.login(process.env.DISCORD_TOKEN);
}
