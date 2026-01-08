require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, REST, Routes, ButtonBuilder, ButtonStyle, Partials } = require('discord.js');
const ai = require('./src/ai_engine');
const { searchMinecraftWiki, isMinecraftQuestion } = require('./src/minecraft_wiki');
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
let SUPPORT_CATEGORY_ID = null;
let newsMemory = "";

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            NEWS_CATEGORY_ID = config.NEWS_CATEGORY_ID || null;
            SUPPORT_CATEGORY_ID = config.SUPPORT_CATEGORY_ID || null;
            console.log(`✅ Config loaded. NEWS: ${NEWS_CATEGORY_ID || 'Not Set'}, SUPPORT: ${SUPPORT_CATEGORY_ID || 'Not Set'}`);
        } else {
            console.warn("⚠️ config.json not found, starting with no configuration.");
        }
    } catch (err) {
        console.error("Error reading config:", err);
    }
}

function saveConfig(newsId, ticketId) {
    NEWS_CATEGORY_ID = newsId || NEWS_CATEGORY_ID;
    TICKET_CHANNEL_ID = ticketId || TICKET_CHANNEL_ID;
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify({
            NEWS_CATEGORY_ID: NEWS_CATEGORY_ID,
            TICKET_CHANNEL_ID: TICKET_CHANNEL_ID
        }, null, 2), 'utf-8');
        console.log(`✅ Config saved. NEWS: ${NEWS_CATEGORY_ID}, TICKET: ${TICKET_CHANNEL_ID}`);
    } catch (err) {
        console.error("Error writing config:", err);
    }
}

client.once('ready', async () => {
    loadConfig();
    loadPersona();
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

// Temporary storage for multi-step setup
const setupSessions = new Map();

client.on('interactionCreate', async interaction => {
    // 1. Handle Commands
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'setup') {
            const categories = interaction.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildCategory)
                .map(c => ({ label: c.name, value: c.id }))
                .slice(0, 25);

            if (categories.length === 0) return interaction.reply({ content: "❌ No categories found.", ephemeral: true });

            const select = new StringSelectMenuBuilder()
                .setCustomId('select_news_category')
                .setPlaceholder('📰 Select News Category')
                .addOptions(categories.map(c => new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(c.value)));

            const row = new ActionRowBuilder().addComponents(select);

            await interaction.reply({
                content: '### Step 1/2: Set the News Category\n\nUse the dropdown below to select where you post server news:',
                components: [row],
                ephemeral: true
            });

            // Initialize session
            setupSessions.set(interaction.user.id, { newsId: null, ticketId: null });
        }

        if (interaction.commandName === 'close') {
            // Check if this channel is in the support category or is a ticket channel
            if (interaction.channel.parentId === SUPPORT_CATEGORY_ID || interaction.channel.name.startsWith('ticket-')) {
                await interaction.reply('🗑️ Closing ticket...');
                setTimeout(() => interaction.channel.delete().catch(console.error), 2000);
            } else {
                await interaction.reply({ content: '❌ This command only works in ticket channels inside the support category.', ephemeral: true });
            }
        }
    }

    // 2. Handle Dropdown Selections
    if (interaction.isStringSelectMenu()) {
        const session = setupSessions.get(interaction.user.id);
        if (!session) return;

        if (interaction.customId === 'select_news_category') {
            session.newsId = interaction.values[0];
            setupSessions.set(interaction.user.id, session);

            // Show Support Category Selection (not channel!)
            const categories = interaction.guild.channels.cache
                .filter(c => c.type === ChannelType.GuildCategory)
                .map(c => ({ label: c.name, value: c.id }))
                .slice(0, 25);

            const supportSelect = new StringSelectMenuBuilder()
                .setCustomId('select_support_category')
                .setPlaceholder('🎫 Select Support/Ticket Category (Optional)')
                .addOptions([
                    new StringSelectMenuOptionBuilder().setLabel('❌ Skip (No Support Category)').setValue('SKIP'),
                    ...categories.map(c => new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(c.value))
                ]);

            const row = new ActionRowBuilder().addComponents(supportSelect);

            await interaction.update({
                content: '### Step 2/2: Set the Support Category (Optional)\n\nSelect a category where users can get support (ticket channels will be created here), or skip:',
                components: [row]
            });
        }

        if (interaction.customId === 'select_support_category') {
            const supportId = interaction.values[0] === 'SKIP' ? null : interaction.values[0];
            session.ticketId = supportId;

            // Save configuration
            saveConfig(session.newsId, session.supportId);
            setupSessions.delete(interaction.user.id);

            let message = '✅ **Setup Complete!**\n\n';
            message += `📰 **News Category:** <#${session.newsId}>\n`;
            message += session.supportId ? `🎫 **Support Category:** <#${session.supportId}>` : '🎫 **Support Category:** Not Set';
            message += '\n\n_News is being scanned now..._';

            await interaction.update({
                content: message,
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

        // Build AI context - only include news if configured
        let fullContext = systemPersona;

        // Add Minecraft Knowledge Base
        fullContext += `\n\n## Minecraft Knowledge Base (Official Wiki Reference)
You are an expert on Minecraft. Key facts:
- **Latest Version**: 1.21 (Tricky Trials Update) - Added Trial Chambers, Breeze mob, new copper blocks
- **Common Questions**:
  * Diamond level: Y=-64 to Y=16, most common at Y=-59
  * Iron golem farms: Need 3 villagers + 3 beds + zombie scare trigger
  * Nether portal: Minimum 4x5 obsidian frame, light with flint & steel
  * Enchanting: Max level 30 (needs 15 bookshelves around table)
  * Elytra: Found in End Ships after defeating Ender Dragon
  * Redstone basics: Power level 0-15, repeaters extend signal, comparators detect containers
  
When answering Minecraft questions, be specific and cite exact mechanics.`;

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
        if (NEWS_CATEGORY_ID && newsMemory && newsMemory.trim() !== "") {
            fullContext += `\n\n--- RECENT NEWS (ColdFront Server Updates) ---\n${newsMemory}\n--- END OF NEWS ---\n\n**CRITICAL**: The above news is REAL data from the server. You may reference it ONLY.`;
        } else {
            fullContext += `\n\n--- NO SERVER NEWS AVAILABLE ---\n**CRITICAL INSTRUCTION**: You do NOT have access to server news right now.\n- If asked about server updates/news, say: "I don't have any recent news updates right now. Check back later or ask a staff member!"\n- DO NOT make up any events, updates, or changes\n- DO NOT say generic things like "seasonal events" or "bug fixes"\n- Be honest that you don't have this information\n--- END ---`;
        }

        fullContext += `\n\nBe helpful, honest, and concise. Minecraft = your specialty. Server news = only if provided above.`;

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
