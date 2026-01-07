require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, REST, Routes, ButtonBuilder, ButtonStyle } = require('discord.js');
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
let NEWS_CATEGORY_ID = ""; // Will load from config
const CONFIG_PATH = path.join(__dirname, 'config.json');

// --- Load/Save Config ---
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            NEWS_CATEGORY_ID = data.newsCategoryId || "";
            console.log("Config loaded. Category ID:", NEWS_CATEGORY_ID);
        }
    } catch (e) { console.error("Config load error:", e); }
}

function saveConfig(categoryId) {
    NEWS_CATEGORY_ID = categoryId;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ newsCategoryId: categoryId }, null, 2));
}

// --- Persona Load ---
const PERSONA_PATH = path.join(__dirname, 'persona.txt');
let systemPersona = "";
try {
    systemPersona = fs.readFileSync(PERSONA_PATH, 'utf-8');
} catch (err) {
    console.error("Error reading persona.txt:", err);
    systemPersona = "You are the ColdFront Support Bot.";
}

client.once('ready', async () => {
    loadConfig();
    await ai.init();
    console.log(`ColdFront Guardian active: ${client.user.tag}`);

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
            // Just acknowledge, don't block. User must click Save.
            await interaction.deferUpdate();
        }
    }

    // 3. Handle Save Button
    if (interaction.isButton()) {
        if (interaction.customId === 'btn_save_setup') {
            if (!NEWS_CATEGORY_ID) {
                return interaction.reply({ content: "⚠️ Please select a category first.", ephemeral: true });
            }
            // Update UI immediately to prevent timeout
            await interaction.update({
                content: `✅ **News Category Saved Successfully.**\nSystem updated for <#${NEWS_CATEGORY_ID}>.\nNews context is refreshing in the background...`,
                components: []
            });

            // Run heavy task in bg
            scanNews().catch(err => console.error("BG Scan Error:", err));
        }
    }
});

client.on('messageCreate', async (message) => {
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

        try {
            // Retry logic: Attempt up to 2 times
            let response = null;
            for (let i = 0; i < 2; i++) {
                try {
                    // Increased to 90s to handle Render Free Tier cold starts
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 90000));
                    const aiPromise = ai.generate(message.content, fullContext);

                    response = await Promise.race([aiPromise, timeoutPromise]);

                    if (response && response.trim() !== "") break; // Success, exit loop
                } catch (e) {
                    console.log(`AI Attempt ${i + 1} failed: ${e.message}`);
                    if (i === 1) throw e; // Throw on last attempt
                }
            }

            if (!response || response.trim() === "") throw new Error("Empty response");
            message.reply(response);
        } catch (err) {
            console.error("AI Error:", err);
            message.reply("⚠️ *I am having trouble connecting to the AI brain. Please try again in a moment.*");
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
