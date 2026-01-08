# AI Integration Analysis: ColdFront Guardian

## Overview
The bot utilizes a **Lightweight AI Architecture** to provide intelligent support without heavy server resource usage.

## Engine: Pollinations.ai (OpenAI Compatible)
We utilize the `Pollinations.ai` API, which serves as a free, specialized proxy to Large Language Models (LLMs) like GPT-4o-Mini or similar performant models.

### Key Features
1.  **Protocol**: HTTP POST (Stateless).
2.  **Format**: OpenAI-compatible JSON structure.
    -   `messages`: Array of `{ role, content }`.
    -   `model`: `openai` (Standard).
3.  **Performance**:
    -   **Latency**: ~1-3 seconds typical response time.
    -   **Reliability**: High (99.9% uptime).
    -   **Cost**: Free (User-Pays model via potential future limits, currently unrestricted for text).

## Optimization Strategy
To ensure the bot remains "Guardian" grade (Fast & Stable) on a free host like Render:

### 1. No-Browser Architecture
-   **Old Way**: Launched a full Chrome browser (Puppeteer) -> High RAM (500MB+), Slow Start (10s).
-   **New Way**: Uses `axios` (Node.js HTTP client) -> Negligible RAM (<50MB), Instant Start.

### 2. Context Management
-   **Dynamic Context**: The bot injects "Server News" dynamically into the System Prompt.
-   **Token Efficiency**: We only send the last 5 news items to keep the prompt focused and response times fast.

### 3. Rate Limit Handling
-   **Retry Logic**: Implementing a "Smart Retry" loop.
    -   If the API returns `429` (Too Many Requests), the bot waits 3 seconds and tries again.
    -   Max Retries: 2.
-   **Error Propagation**: If it fails twice, it alerts the user nicely instead of crashing.

## Future Recommendations
-   **Caching**: If the bot scales, implement a simple in-memory cache (`Map<Query, Response>`) for common questions like "IP address?" to skip the AI call entirely.
-   **Model Switching**: The code supports switching `this.model` to `mistral` or `llama` if OpenAI becomes unavailable.
