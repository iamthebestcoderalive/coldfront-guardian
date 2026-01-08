require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, REST, Routes, ButtonBuilder, ButtonStyle, Partials } = require('discord.js');
const ai = require('./src/ai_engine');
const { searchMinecraftWiki, isMinecraftQuestion } = require('./src/minecraft_wiki');
const { searchWeb } = require('./src/web_search');
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
// Old config variables removed in favor of config_manager

// Legacy functions removed - populated from config_manager now

client.once('ready', async () => {
    // Legacy loadConfig() removed - using per-guild config
    loadPersona(); // Keeps default persona as fallback
    await ai.init();
    console.log(`❄️ ColdFront Guardian active: ${client.user.tag}`);

    // Start Express for Render health check
    const app = express();
    const PORT = process.env.PORT || 3000;
    app.get('/', (req, res) => res.send('🤖 ColdFront Guardian is running'));
    app.get('/health', (req, res) => res.json({ status: 'ok', bot: client.user.tag }));
    app.listen(PORT, () => console.log(`🌐 Web server listening on port ${PORT}`));

    // Register Slash Commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Refreshing application (/) commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            {
                body: [
                    {
                        name: 'setup',
                        description: 'Configure News Category and Support Category for tickets',
                        default_member_permissions: "8" // Administrator only
                    },
                    {
                        name: 'close',
                        description: 'Close/delete the current ticket channel',
                        default_member_permissions: "0" // Everyone can use
                    }
                ]
            },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    // Initial News Load removed - done per-guild or on demand
    // if (NEWS_CATEGORY_ID) await scanNews();
});

let newsMemory = ""; // Global cache for now (simplification for single-instance)

async function scanNews(guildId) {
    // In a multi-guild bot, this needs a rewrite to store per-guild news.
    // For single-instance compatibility or migration:
    // We will just do a check if provided guildId config has news.
    // This part requires a refactor for true multi-tenancy news polling.
    // For now, leaving as placeholder or manual trigger in setup.
    console.log("News scan requested.");
}

// Temporary storage for multi-step setup
const setupSessions = new Map();

// --- MODULES ---
const { startSetup, handleSetupInteraction } = require('./src/setup_wizard');
const { loadConfig, getConfigValue, isSetupComplete } = require('./src/config_manager');
const { generatePersona } = require('./src/persona_generator');

client.on('interactionCreate', async interaction => {
    // 1. Handle Commands
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup') {
            await startSetup(interaction);
        }

        if (interaction.commandName === 'close') {
            const supportId = getConfigValue(interaction.guildId, 'SUPPORT_CATEGORY_ID');
            // Check if this channel is in the support category or is a ticket channel
            if ((supportId && interaction.channel.parentId === supportId) || interaction.channel.name.startsWith('ticket-')) {
                await interaction.reply('🗑️ Closing ticket...');
                setTimeout(() => interaction.channel.delete().catch(console.error), 2000);
            } else {
                await interaction.reply({ content: '❌ This command only works in ticket channels inside the support category.', ephemeral: true });
            }
        }
    }

    // 2. Handle Setup Wizard Interactions (Modals, Selects, Buttons)
    if (interaction.customId && (interaction.customId.startsWith('setup_') || interaction.customId === 'server_name')) {
        await handleSetupInteraction(interaction);
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

        // Load config for this guild
        const guildConfig = loadConfig(message.guildId);

        // Generate dynamic persona based on config
        let fullContext = generatePersona(guildConfig);

        // Dynamic persona already includes Knowledge Base and Scope Rules
        // We only append dynamic real-time data like Wiki results here

        // Clean user message text FIRST (before wiki search uses it)
        let cleanText = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        if (!cleanText) cleanText = "Hello!";

        // Search Minecraft Wiki if this is a Minecraft question
        if (isMinecraftQuestion(message.content)) {
            const wikiResult = await searchMinecraftWiki(cleanText);
            if (wikiResult) {
                fullContext += `\n\n--- MINECRAFT WIKI LOOKUP ---\n${wikiResult}\nUse this official source to answer accurately.\n--- END WIKI ---`;
            }
        }

        // Add server news ONLY if configured and available
        const newsId = guildConfig.NEWS_CATEGORY_ID;
        // Note: For multi-server news memory, we would need a map. 
        // For now, scan fresh or use global cache if valid.
        // Ideally, we implement per-server news cache.

        if (newsId && newsMemory && newsMemory.trim() !== "") {
            fullContext += `\n\n--- RECENT NEWS (${guildConfig.SERVER_NAME} Updates) ---\n${newsMemory}\n--- END OF NEWS ---\n\n**CRITICAL**: The above news is REAL data from the server. You may reference it ONLY.`;
        } else {
            fullContext += `\n\n--- NO SERVER NEWS AVAILABLE ---\n**CRITICAL INSTRUCTION**: You do NOT have access to server news right now.\n- If asked about server updates/news, say: "I don't have any recent news updates right now. Check back later or ask a staff member!"\n- DO NOT make up any events, updates, or changes\n- DO NOT say generic things like "seasonal events" or "bug fixes"\n- Be honest that you don't have this information\n--- END ---`;
        }



        try {
            await message.channel.sendTyping();

            // Retry logic: Attempt up to 2 times
            let response = null;
            for (let i = 0; i < 2; i++) {
                try {
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 90000));
                    const aiPromise = ai.generate(cleanText, fullContext);

                    response = await Promise.race([aiPromise, timeoutPromise]);

                    if (response && response.trim() !== "") break;
                } catch (e) {
                    console.log(`AI Attempt ${i + 1} failed: ${e.message}`);
                    if (i === 1) throw e;
                    await new Promise(r => setTimeout(r, 3000));
                }
            }

            if (!response || response.trim() === "") throw new Error("Empty response");
            message.reply(response);
        } catch (err) {
            console.error("AI Final Error:", err.message);
            message.reply("⚠️ *I am currently overloaded. Please ask again in a few seconds.*");
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
