const fs = require('fs');
const path = require('path');

/**
 * Config Manager - Handles per-server configuration
 * Each Discord server (guild) gets its own isolated config
 */

const CONFIG_DIR = path.join(__dirname, '..', 'configs');

// Default configuration template
const DEFAULT_CONFIG = {
    SERVER_NAME: "Minecraft Server",
    SERVER_TYPE: "vanilla",
    SERVER_IP: null,
    SERVER_VERSION: "Latest",
    NEWS_CATEGORY_ID: null,
    SUPPORT_CATEGORY_ID: null,
    RULES_CHANNEL_ID: null,
    WELCOME_CHANNEL_ID: null,
    BOT_NAME: "Birno",
    PERSONALITY: "casual",
    EMOJI_LEVEL: "moderate",
    SIGNATURE_EMOJI: "❄️",
    STAFF_ROLES: [],
    ADMIN_ROLES: []
};

/**
 * Ensure configs directory exists
 */
function ensureConfigDir() {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        console.log('✅ Created configs directory');
    }
}

/**
 * Get config file path for a guild
 */
function getConfigPath(guildId) {
    return path.join(CONFIG_DIR, `${guildId}.json`);
}

/**
 * Load configuration for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {object} - Configuration object
 */
function loadConfig(guildId) {
    ensureConfigDir();
    const configPath = getConfigPath(guildId);

    try {
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            console.log(`✅ Config loaded for guild ${guildId}`);
            return config;
        } else {
            console.log(`⚠️ No config found for guild ${guildId}, using defaults`);
            return { ...DEFAULT_CONFIG };
        }
    } catch (err) {
        console.error(`❌ Error loading config for guild ${guildId}:`, err);
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Save configuration for a guild
 * @param {string} guildId - Discord guild ID
 * @param {object} config - Configuration object
 */
function saveConfig(guildId, config) {
    ensureConfigDir();
    const configPath = getConfigPath(guildId);

    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`✅ Config saved for guild ${guildId}`);
        return true;
    } catch (err) {
        console.error(`❌ Error saving config for guild ${guildId}:`, err);
        return false;
    }
}

/**
 * Update specific config fields for a guild
 * @param {string} guildId - Discord guild ID
 * @param {object} updates - Fields to update
 */
function updateConfig(guildId, updates) {
    const config = loadConfig(guildId);
    const newConfig = { ...config, ...updates };
    return saveConfig(guildId, newConfig);
}

/**
 * Get a specific config value
 * @param {string} guildId - Discord guild ID
 * @param {string} key - Config key
 * @returns {any} - Config value
 */
function getConfigValue(guildId, key) {
    const config = loadConfig(guildId);
    return config[key];
}

/**
 * Check if a guild has completed initial setup
 * @param {string} guildId - Discord guild ID
 * @returns {boolean} - True if setup is complete
 */
function isSetupComplete(guildId) {
    const config = loadConfig(guildId);
    return !!(config.NEWS_CATEGORY_ID || config.SUPPORT_CATEGORY_ID);
}

module.exports = {
    loadConfig,
    saveConfig,
    updateConfig,
    getConfigValue,
    isSetupComplete,
    DEFAULT_CONFIG
};
