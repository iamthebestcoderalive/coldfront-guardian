const axios = require('axios');

class AIEngine {
    constructor() {
        this.model = 'openai'; // polliniations supports: openai, mistral, llama
    }

    async init() {
        console.log("ColdFront Support Engine (Lightweight) is Ready 🚀");
        return true;
    }

    async generate(userMessage, systemContext) {
        try {
            // Pollinations.ai (Free, No Key, Fast)
            // Format: https://text.pollinations.ai/{prompt}?model={model}&system={system}

            // Encode components to be URL safe
            const prompt = encodeURIComponent(userMessage);
            const system = encodeURIComponent(systemContext);
            const model = encodeURIComponent(this.model);

            // Construct URL
            const url = `https://text.pollinations.ai/${prompt}?model=${model}&system=${system}`;

            // Fetch
            const response = await axios.get(url, { timeout: 30000 });

            return response.data;
        } catch (err) {
            console.error("AI Network Error:", err.message);
            return "⚠️ *System Malfunction: Unable to reach command.* (Network Error)";
        }
    }
}

module.exports = new AIEngine();
