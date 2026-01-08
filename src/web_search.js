const axios = require('axios');

/**
 * Search the web for Minecraft information using DuckDuckGo Instant Answer API
 * @param {string} query - The search query
 * @returns {Promise<string|null>} - Search result summary or null
 */
async function searchWeb(query) {
    try {
        console.log(`🌐 Web searching for: "${query}"`);

        // Use DuckDuckGo Instant Answer API (free, no key required)
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query + ' Minecraft')}&format=json&no_html=1`;

        const response = await axios.get(searchUrl, { timeout: 5000 });

        if (response.data) {
            let summary = '';

            // Try AbstractText first (most detailed)
            if (response.data.AbstractText) {
                summary = response.data.AbstractText;
            }
            // Then try Answer
            else if (response.data.Answer) {
                summary = response.data.Answer;
            }
            // Then try Definition
            else if (response.data.Definition) {
                summary = response.data.Definition;
            }
            // Check RelatedTopics for relevant info
            else if (response.data.RelatedTopics && response.data.RelatedTopics.length > 0) {
                const firstTopic = response.data.RelatedTopics[0];
                if (firstTopic.Text) {
                    summary = firstTopic.Text;
                }
            }

            if (summary) {
                console.log(`✅ Web search found information`);
                return `**Web Search Result**: ${summary}`;
            }
        }

        return null;
    } catch (err) {
        console.error('❌ Web search failed:', err.message);
        return null;
    }
}

module.exports = {
    searchWeb
};
