const axios = require('axios');

class AIEngine {
    constructor() {
        this.model = 'openai';
    }

    async init() {
        console.log("🚀 ColdFront Support Engine (Lightweight) is Ready");
        return true;
    }

    async generate(userMessage, systemContext) {
        try {
            const response = await axios.post('https://text.pollinations.ai/', {
                messages: [
                    { role: 'system', content: systemContext },
                    { role: 'user', content: userMessage }
                ],
                model: this.model,
                seed: Math.floor(Math.random() * 1000)
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            });

            return response.data?.choices?.[0]?.message?.content;
        } catch (err) {
            console.error("AI Request Failed:", err.message);
            throw err;
        }
    }
}

module.exports = new AIEngine();
