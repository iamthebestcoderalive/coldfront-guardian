# ColdFront Guardian (Birno)

**Birno** is the intelligent AI Support Bot for the ColdFront Minecraft Server. He uses a lightweight AI engine to assist players efficiently.

## Features:
- **Support Gate**: Birno handles ticket inquiries and general questions.
- **Smart Context**: He knows the latest server news and updates.
- **Lightweight**: Refactored to run on minimal resources without a browser.

## 📦 Installation

### Prerequisites
- Node.js 18.0.0 or higher
- A Discord Bot Token [Get it here](https://discord.com/developers/applications)

### Setup

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Configure Token**
    - Create a `.env` file:
      ```
      DISCORD_TOKEN=your_token_here
      ```

3.  **Install Chrome (if needed)**
    If you get a "Could not find Chrome" error:
    ```bash
    npx puppeteer browsers install chrome
    ```

### Run Birno
```bash
node index.js
```
or
```bash
npm start
```

## 🛠️ Configuration

Edit `index.js` to customize:
- `HANGOUT_TIME`: Duration conversation mode lasts (default: 3 mins)
- `SYSTEM_PROMPT`: The core personality instructions
- `SLURS`: The list of forbidden words

## 📁 File Structure

- `index.js`: Main bot logic (Social/Mod/Discord)
- `src/ai_engine.js`: Puppeteer Singleton Bridge
- `package.json`: Dependencies
- `.env`: Secrets

## 📝 License
Free to use.
