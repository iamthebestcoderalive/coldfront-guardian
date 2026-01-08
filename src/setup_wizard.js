const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const { saveConfig, loadConfig, updateConfig } = require('./config_manager');

// Store temporary setup sessions
const setupSessions = new Map();

/**
 * Start the setup wizard
 */
async function startSetup(interaction) {
    // Create session with default values or existing config
    const currentConfig = loadConfig(interaction.guildId);
    setupSessions.set(interaction.user.id, {
        step: 1,
        guildId: interaction.guildId,
        config: { ...currentConfig }
    });

    // Show Step 1: Basic Info Modal
    const modal = new ModalBuilder()
        .setCustomId('setup_step1_modal')
        .setTitle('Step 1/4: Basic Server Info');

    const nameInput = new TextInputBuilder()
        .setCustomId('server_name')
        .setLabel("Server Name")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. ColdFront, Skyblock Central")
        .setValue(currentConfig.SERVER_NAME || '')
        .setRequired(true);

    const typeInput = new TextInputBuilder()
        .setCustomId('server_type')
        .setLabel("Server Type")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. Vanilla, Paper, Modded, Bedrock")
        .setValue(currentConfig.SERVER_TYPE || '')
        .setRequired(true);

    const ipInput = new TextInputBuilder()
        .setCustomId('server_ip')
        .setLabel("Server IP (Optional)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("play.myserver.com")
        .setValue(currentConfig.SERVER_IP || '')
        .setRequired(false);

    const versionInput = new TextInputBuilder()
        .setCustomId('server_version')
        .setLabel("Minecraft Version")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("e.g. 1.21, 1.8-1.21")
        .setValue(currentConfig.SERVER_VERSION || '')
        .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(nameInput);
    const secondRow = new ActionRowBuilder().addComponents(typeInput);
    const thirdRow = new ActionRowBuilder().addComponents(ipInput);
    const fourthRow = new ActionRowBuilder().addComponents(versionInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

    await interaction.showModal(modal);
}

/**
 * Handle setup interactions
 */
async function handleSetupInteraction(interaction) {
    const session = setupSessions.get(interaction.user.id);
    if (!session) {
        // Only reply if it's a component interaction, not a modal submission (which requires different handling if session is lost)
        if (!interaction.isModalSubmit()) {
            return interaction.reply({ content: '❌ Session expired. Please run `/setup` again.', ephemeral: true });
        }
        return;
    }

    // Handle Step 1 Modal Submission
    if (interaction.isModalSubmit() && interaction.customId === 'setup_step1_modal') {
        session.config.SERVER_NAME = interaction.fields.getTextInputValue('server_name');
        session.config.SERVER_TYPE = interaction.fields.getTextInputValue('server_type');
        session.config.SERVER_IP = interaction.fields.getTextInputValue('server_ip');
        session.config.SERVER_VERSION = interaction.fields.getTextInputValue('server_version');

        session.step = 2;
        setupSessions.set(interaction.user.id, session);

        await showStep2(interaction);
    }

    // Handle Category Selections (Step 2)
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'setup_news_category') {
            session.config.NEWS_CATEGORY_ID = interaction.values[0] === 'SKIP' ? null : interaction.values[0];
            await interaction.deferUpdate(); // Acknowledge without changing view yet
        }
        else if (interaction.customId === 'setup_support_category') {
            session.config.SUPPORT_CATEGORY_ID = interaction.values[0] === 'SKIP' ? null : interaction.values[0];
            await interaction.deferUpdate();
        }
        else if (interaction.customId === 'setup_rules_channel') {
            session.config.RULES_CHANNEL_ID = interaction.values[0] === 'SKIP' ? null : interaction.values[0];
            session.step = 3; // Move to next step logic
            await showStep3(interaction);
        }
        // Personality Selections (Step 3)
        else if (interaction.customId === 'setup_personality_style') {
            session.config.PERSONALITY = interaction.values[0];
            await interaction.deferUpdate();
        }
        else if (interaction.customId === 'setup_emoji_level') {
            session.config.EMOJI_LEVEL = interaction.values[0];
            await showStep4(interaction); // Go to review
        }
    }

    // Handle Buttons (Navigation)
    if (interaction.isButton()) {
        if (interaction.customId === 'setup_save') {
            saveConfig(interaction.guildId, session.config);
            setupSessions.delete(interaction.user.id);

            const embed = new EmbedBuilder()
                .setTitle('✅ Setup Complete!')
                .setDescription(`**${session.config.BOT_NAME}** is now configured for **${session.config.SERVER_NAME}**!`)
                .addFields(
                    { name: 'Server', value: `${session.config.SERVER_NAME} (${session.config.SERVER_TYPE})`, inline: true },
                    { name: 'IP', value: session.config.SERVER_IP || 'None', inline: true },
                    { name: 'Personality', value: `${session.config.PERSONALITY} / ${session.config.EMOJI_LEVEL} emojis`, inline: true }
                )
                .setColor(0x00FF00);

            await interaction.update({ content: '', embeds: [embed], components: [] });
        }
        else if (interaction.customId === 'setup_cancel') {
            setupSessions.delete(interaction.user.id);
            await interaction.update({ content: '❌ Setup cancelled.', embeds: [], components: [] });
        }
    }
}

async function showStep2(interaction) {
    const categories = interaction.guild.channels.cache
        .filter(c => c.type === 4) // ChannelType.GuildCategory = 4
        .map(c => ({ label: c.name, value: c.id }))
        .slice(0, 24);

    const textChannels = interaction.guild.channels.cache
        .filter(c => c.type === 0) // ChannelType.GuildText = 0
        .map(c => ({ label: `#${c.name}`, value: c.id }))
        .slice(0, 24);

    const newsSelect = new StringSelectMenuBuilder()
        .setCustomId('setup_news_category')
        .setPlaceholder('📰 Select News Category')
        .addOptions([
            { label: '❌ Skip / No News', value: 'SKIP' },
            ...categories.map(c => ({ label: c.label, value: c.value }))
        ]);

    const supportSelect = new StringSelectMenuBuilder()
        .setCustomId('setup_support_category')
        .setPlaceholder('🎫 Select Support Category')
        .addOptions([
            { label: '❌ Skip / No Support Tickets', value: 'SKIP' },
            ...categories.map(c => ({ label: c.label, value: c.value }))
        ]);

    const rulesSelect = new StringSelectMenuBuilder()
        .setCustomId('setup_rules_channel')
        .setPlaceholder('📜 Select Rules Channel (Last step for this page)')
        .addOptions([
            { label: '❌ Skip / No Rules Channel', value: 'SKIP' },
            ...textChannels.map(c => ({ label: c.label, value: c.value }))
        ]);

    const row1 = new ActionRowBuilder().addComponents(newsSelect);
    const row2 = new ActionRowBuilder().addComponents(supportSelect);
    const row3 = new ActionRowBuilder().addComponents(rulesSelect);

    await interaction.reply({ // Changed from update to reply because submitModal replies
        content: '**Step 2/4: Channels & Categories**\nConfigure where the bot should look for news, create tickets, and find rules.',
        components: [row1, row2, row3],
        ephemeral: true
    });
}

async function showStep3(interaction) {
    const personalitySelect = new StringSelectMenuBuilder()
        .setCustomId('setup_personality_style')
        .setPlaceholder('🧠 Select Identity Style')
        .addOptions([
            { label: 'Professional (Formal, Efficient)', value: 'professional', emoji: '👔' },
            { label: 'Casual (Friendly, Welcoming)', value: 'casual', emoji: '☕' },
            { label: 'Fun (Energetic, Expressive)', value: 'fun', emoji: '🎉' },
            { label: 'Minimal (Direct, Brief)', value: 'minimal', emoji: '🤖' }
        ]);

    const emojiSelect = new StringSelectMenuBuilder()
        .setCustomId('setup_emoji_level')
        .setPlaceholder('😊 Select Emoji Usage Level (Last step)')
        .addOptions([
            { label: 'None (No emojis)', value: 'none' },
            { label: 'Light (Minimal)', value: 'light' },
            { label: 'Moderate (Balanced)', value: 'moderate' },
            { label: 'Heavy (Expressive)', value: 'heavy' }
        ]);

    const row1 = new ActionRowBuilder().addComponents(personalitySelect);
    const row2 = new ActionRowBuilder().addComponents(emojiSelect);

    await interaction.update({
        content: '**Step 3/4: Personality Customization**\nChoose how your bot should sound and behave.',
        components: [row1, row2]
    });
}

async function showStep4(interaction) {
    const session = setupSessions.get(interaction.user.id);
    const cfg = session.config;

    const embed = new EmbedBuilder()
        .setTitle('Step 4/4: Review Configuration')
        .setColor(0x0099FF)
        .addFields(
            { name: 'Server Details', value: `Name: **${cfg.SERVER_NAME}**\nType: **${cfg.SERVER_TYPE}**\nIP: ${cfg.SERVER_IP || 'None'}\nVer: ${cfg.SERVER_VERSION}` },
            { name: 'Channels', value: `News: ${cfg.NEWS_CATEGORY_ID ? `<#${cfg.NEWS_CATEGORY_ID}>` : 'None'}\nSupport: ${cfg.SUPPORT_CATEGORY_ID ? `<#${cfg.SUPPORT_CATEGORY_ID}>` : 'None'}\nRules: ${cfg.RULES_CHANNEL_ID ? `<#${cfg.RULES_CHANNEL_ID}>` : 'None'}` },
            { name: 'Personality', value: `Style: **${cfg.PERSONALITY}**\nEmoji: **${cfg.EMOJI_LEVEL}**` }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('setup_save').setLabel('✅ Save & Finish').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('setup_cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
    );

    await interaction.update({
        content: '**Almost done!** Review your settings below.',
        embeds: [embed],
        components: [row]
    });
}

module.exports = {
    startSetup,
    handleSetupInteraction
};
