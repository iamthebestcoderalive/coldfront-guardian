const axios = require('axios');

class AIEngine {
    constructor() {
        // Using HuggingFace Inference API (free, no key required for smaller models)
        this.endpoint = 'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium';
    }

    async init() {
        console.log("🚀 ColdFront Support Engine (Lightweight) is Ready");
        return true;
    }

    async generate(userMessage, systemContext) {
        try {
            // Combine system context with user message
            const prompt = `${systemContext}\n\nUser: ${userMessage}\nAssistant:`;

            console.log("🤖 Requesting AI response...");

            const response = await axios.post(this.endpoint, {
                inputs: prompt,
                parameters: {
                    max_length: 500,
                    temperature: 0.7,
                    return_full_text: false
                }
            }, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            });

            // HuggingFace returns array of generated text
            let result = '';
            if (Array.isArray(response.data) && response.data.length > 0) {
                result = response.data[0].generated_text || '';
            } else if (response.data.generated_text) {
                result = response.data.generated_text;
            } else if (typeof response.data === 'string') {
                result = response.data;
            }

            console.log("✅ AI Response received");

            if (!result || result.trim() === "") {
                throw new Error("Empty response from AI");
            }

            // Clean up the response (remove the prompt if it's included)
            result = result.replace(prompt, '').trim();

            return result;
        } catch (err) {
            console.error("❌ AI Request Failed:", err.message);
            if (err.response) {
                console.error("Response status:", err.response.status);
                console.error("Response data:", JSON.stringify(err.response.data).substring(0, 200));
            }
            throw err;
        }
    }
}

module.exports = new AIEngine();
