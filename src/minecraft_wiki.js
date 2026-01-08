const axios = require('axios');

/**
 * Search and fetch Minecraft Wiki information
 * @param {string} query - The search query (e.g., "creeper explosion")
 * @returns {Promise<string>} - Wiki summary or error message
 */
async function searchMinecraftWiki(query) {
    try {
        console.log(`🔍 Searching Minecraft Wiki for: "${query}"`);

        // Use Minecraft Wiki search API
        const searchUrl = `https://minecraft.wiki/api.php?action=opensearch&format=json&search=${encodeURIComponent(query)}&limit=1`;

        const response = await axios.get(searchUrl, { timeout: 5000 });

        if (response.data && response.data[1] && response.data[1].length > 0) {
            const pageTitle = response.data[1][0];
            const pageUrl = response.data[3][0];

            console.log(`✅ Found: ${pageTitle}`);
            return `**Source: Minecraft Wiki**\n[${pageTitle}](${pageUrl})\n\nPage found - answering from official wiki data.`;
        } else {
            return null; // No results found
        }
    } catch (err) {
        console.error('❌ Minecraft Wiki search failed:', err.message);
        return null;
    }
}

/**
 * Check if a message is asking a Minecraft question
 * @param {string} message - User message
 * @returns {boolean}
 */
function isMinecraftQuestion(message) {
    const minecraftKeywords = [
        'minecraft', 'creeper', 'diamond', 'redstone', 'enchant', 'nether',
        'ender', 'dragon', 'wither', 'villager', 'iron golem', 'farm',
        'crafting', 'biome', 'portal', 'elytra', 'beacon', 'anvil',
        'brewing', 'potion', 'mob', 'spawn', 'block', 'item'
    ];

    const lowerMsg = message.toLowerCase();
    return minecraftKeywords.some(keyword => lowerMsg.includes(keyword));
}

module.exports = {
    searchMinecraftWiki,
    isMinecraftQuestion
};
