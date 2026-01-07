const puppeteer = require('puppeteer');

class AIEngine {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isReady = false;
    }

    async init() {
        if (this.isReady) return;
        console.log("Initializing ColdFront Support Engine...");
        this.browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        this.page = await this.browser.newPage();
        
        // Inject Puter
        await this.page.setContent(`
            <!DOCTYPE html><html><head><script src="https://js.puter.com/v2/"></script></head>
            <body><script>
                window.askPuter = async (text, systemParams) => {
                    try {
                        const res = await puter.ai.chat(text, { 
                            model: 'gpt-4o-mini',
                            system: systemParams 
                        });
                        return res.message.content;
                    } catch (err) { return "Error: " + err.message; }
                };
            </script></body></html>
        `);
        this.isReady = true;
    }

    async generate(userMessage, systemContext) {
        if (!this.isReady) await this.init();
        
        // Using passed systemContext (Persona + News) directly
        return await this.page.evaluate(async (msg, sys) => {
            return await window.askPuter(msg, sys);
        }, userMessage, systemContext);
    }
}
module.exports = new AIEngine();
