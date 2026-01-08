const axios = require('axios');

class AIEngine {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isReady = false;
    }

    async init() {
        if (this.isReady) return;
        console.log("⚙️  Initializing Headless Browser...");

        // CRITICAL: Crash-Proof Launch Arguments
        try {
            this.browser = await puppeteer.launch({
                headless: "new",
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // FIXES CRASHES on low-resource PCs
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--no-first-run'
                ]
            });

            this.page = await this.browser.newPage();

            // Inject the Puter Library directly
            const html = `
                <!DOCTYPE html>
                <html>
                    <head><script src="https://js.puter.com/v2/"></script></head>
                    <body>
                        <script>
                            // The "Bridge" Function
                            window.askPuter = async (text, systemPrompt) => {
                                try {
                                    const res = await puter.ai.chat(
                                        [
                                            { role: "system", content: systemPrompt },
                                            { role: "user", content: text }
                                        ],
                                        { model: 'gpt-4o-mini' }
                                    );
                                    return res.message.content;
                                } catch (err) { return "Error: " + err.message; }
                            };
                        </script>
                    </body>
                </html>
            `;

            await this.page.setContent(html);

            // Wait for Puter to load
            await this.page.waitForFunction(() => typeof puter !== 'undefined', { timeout: 30000 });

            this.isReady = true;
            console.log("✅ AI Engine Online & Stabilized.");
        } catch (error) {
            console.error("❌ Failed to initialize AI Engine:", error);
        }
    }

    async generate(prompt, systemPrompt) {
        if (!this.isReady) await this.init();

        try {
            // Re-use the SAME page context
            return await this.page.evaluate(async (p, s) => {
                return await window.askPuter(p, s);
            }, prompt, systemPrompt);
        } catch (error) {
            console.error("⚠️  Browser Glitch:", error.message);
            this.isReady = false; // Force re-init on next call
            return null; // Return null instead of error message for silent fail
        }
    }

    async shutdown() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            this.isReady = false;
            console.log("🔌 AI Engine shutdown.");
        }
    }
}

// Export ONE instance (Singleton)
module.exports = new AIEngine();
