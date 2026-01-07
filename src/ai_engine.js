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
        // Pollinations.ai POST API
        try {
            const response = await axios.post('https://text.pollinations.ai/', {
                messages: [
                    { role: 'system', content: systemContext },
                    { role: 'user', content: userMessage }
                ],
                model: 'openai',
                seed: Math.floor(Math.random() * 1000) // Random seed to avoid caching collisions
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            });

            return response.data?.choices?.[0]?.message?.content;
        } catch (err) {
            // Re-throw to let index.js handle retries
            // Log for debugging but throw for logic
            console.error("AI Request Failed:", err.message);
            throw err;
        }
    }
}

module.exports = new AIEngine();
