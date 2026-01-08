const { chromium } = require('playwright-core');

class AIEngine {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isReady = false;
        this.puterToken = process.env.PUTER_TOKEN;
    }

    async init() {
        if (this.isReady) return;
        console.log("🚀 Initializing Puter.js AI Engine with Auth Token...");

        if (!this.puterToken) {
            throw new Error("PUTER_TOKEN not found in .env file!");
        }

        try {
            // Launch in headless mode for production
            this.browser = await chromium.launch({
                headless: true, // Headless for production
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            this.page = await this.browser.newPage();

            // Console bridge for debugging
            this.page.on('console', msg => console.log('🌐 BROWSER:', msg.text()));
            this.page.on('pageerror', err => console.log('🔥 ERROR:', err.toString()));

            // Load Puter.js with authentication
            const html = `
                <!DOCTYPE html>
                <html>
                    <head>
                        <script src="https://js.puter.com/v2/"></script>
                    </head>
                    <body>
                        <h1>🧠 AI Brain Active</h1>
                        <script>
                            // Set auth token from environment
                            const PUTER_TOKEN = "${this.puterToken}";
                            
                            window.puterReady = false;
                            
                            // Wait for Puter to load and authenticate
                            window.onload = async () => {
                                try {
                                    console.log("Setting Puter auth token...");
                                    
                                    // Set the auth token
                                    if (typeof puter !== 'undefined') {
                                        puter.setAuthToken(PUTER_TOKEN);
                                        console.log("✅ Puter authenticated!");
                                        window.puterReady = true;
                                    } else {
                                        console.error("❌ Puter not loaded!");
                                    }
                                } catch (err) {
                                    console.error("Auth error:", err);
                                }
                            };

                            window.askPuter = async (text, persona) => {
                                console.log("🤖 Asking Puter...");
                                
                                if (typeof puter === 'undefined') {
                                    return "Error: Puter library not loaded.";
                                }

                                try {
                                    const res = await puter.ai.chat([
                                        { role: 'system', content: persona },
                                        { role: 'user', content: text }
                                    ], {
                                        model: 'gpt-4o-mini'
                                    });
                                    
                                    console.log("✅ Response received");
                                    return res.message.content;
                                } catch (err) {
                                    console.error("❌ Puter error:", err);
                                    return "Error: " + err.message;
                                }
                            };
                        </script>
                    </body>
                </html>
            `;

            await this.page.setContent(html);

            // Wait for Puter to load and authenticate
            console.log("⏳ Waiting for Puter authentication...");
            await this.page.waitForFunction(() => window.puterReady === true, { timeout: 60000 });

            // Extra time for initialization
            await new Promise(resolve => setTimeout(resolve, 2000));

            this.isReady = true;
            console.log("✅ Puter.js Ready (Authenticated - Unlimited GPT-4o)");
        } catch (err) {
            console.error("❌ Initialization failed:", err.message);
            if (this.browser) await this.browser.close();
            throw err;
        }
    }

    async generate(userMessage, systemContext) {
        if (!this.isReady) await this.init();

        try {
            console.log("🤖 Requesting AI response...");

            this.page.setDefaultTimeout(60000);

            const result = await this.page.evaluate(async ({ msg, sys }) => {
                return await window.askPuter(msg, sys);
            }, { msg: userMessage, sys: systemContext });

            console.log("✅ Response received");

            if (!result || result.startsWith("Error:")) {
                throw new Error(result || "Empty response");
            }

            return result;
        } catch (err) {
            console.error("❌ AI request failed:", err.message);
            throw err;
        }
    }

    async shutdown() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.isReady = false;
            console.log("🔌 AI Engine shutdown");
        }
    }
}

module.exports = new AIEngine();
