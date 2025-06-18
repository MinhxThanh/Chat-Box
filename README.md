<div align="center">
<img width="214" alt="Screenshot 2025-06-07 at 11 50 22" src="https://github.com/user-attachments/assets/3ed1045a-9bf0-46b5-bf15-677cb7076d02" />
</div>

---
<div align="center">
  <img width="1095" alt="Chat Box Description Image" src="https://github.com/user-attachments/assets/2cd01baf-ba5c-46c9-995a-323fdc7bd2fb" />
</div>

***Chat Box*** is a browser extension that streamlines your online experience by integrating AI chat, advanced web search, document interaction, and more into a convenient sidebar.

## Key Features

Chat Box offers a rich set of functionalities to streamline your AI interactions and information gathering:

-   **🌙 Modern Dark UI**: Sleek and intuitive interface built with Shadcn UI and Tailwind CSS.
-   **💬 AI Chat**: Engage in conversations with various AI models directly from the sidebar.
-   **📚 Chat History**: Easily access and manage multiple past conversations.
-   **⚙️ Flexible API Configuration**:
    -   Configure API keys and endpoints for various AI providers.
    -   Supports major providers like **OpenAI, DeepSeek, Claude (Anthropic), Groq**, as well as **Local LLMs (via Ollama)** and **Custom OpenAI-compatible endpoints**.
    -   Load and select from available AI models from your configured provider.
-   **🚀 Advanced Web Search & Scraping**:
    -   Integrates with **Firecrawl** and **Jina AI** for superior web search results.
    -   Requires configuring your Firecrawl or Jina API key in settings for these features.
    -   Defaults to **DuckDuckGo** for web searches if Firecrawl/Jina are not configured.
    -   Leverage AI (including **Local LLMs**) to refine search queries or process search results for enhanced information gathering.
    -   Scrape and summarize content directly from URLs to use as context in your chat.
-   **📄 Document Chat Powerhouse**:
    -   Upload and interact with various document types including DOCX, TXT, HTML, CSS, JS, MD, and JSON.
    -   Utilizes semantic chunking to handle large documents effectively.
    -   View document context (name, size, estimated tokens) directly in the chat interface.
-   **🖼️ Multimedia & Contextual Awareness**:
    -   Upload images to include in your conversations with AI models that support vision.
    -   **📺 YouTube Video Chat**: Detects YouTube video pages to provide contextual chat options about the video content.
-   **🔒 Secure Local Storage**: Your API credentials and conversations are stored securely in your browser's local storage.

## Installation

### Development Mode

1.  Clone this repository:
    ```bash
    git clone https://github.com/MinhxThanh/Chat-Box.git
    cd Chat-Box
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Build the extension:
    ```bash
    npm run build
    ```
4.  Load the extension in Chrome:
    -   Open Chrome and navigate to `chrome://extensions/`.
    -   Enable "Developer mode" in the top-right corner.
    -   Click "Load unpacked" and select the `dist` directory from this project.

## Usage

1.  Pin the extension icon to your browser toolbar for easy access.
2.  Click the extension icon in your browser toolbar to open the chat sidebar.
3.  Use the right navigation panel to access different features:
    -   💬 **Chat**: Return to the main chat interface.
    -   📚 **History**: Access your previous conversations.
    -   ➕ **New Chat**: Start a fresh conversation.
    -   ⚙️ **Settings**: Configure API keys and preferences.
4.  In **Settings**, configure your APIs:
    -   **AI Provider**:
        -   Enter your AI provider API key.
        -   Specify the base API endpoint (e.g., `https://api.openai.com/v1`).
        -   Click "Load Models" to fetch and select your desired AI model.
    -   **Custom Search Engine (Optional but Recommended)**:
        -   Choose between Firecrawl, Jina, or Default.
        -   Enter the API key for your selected search engine (Firecrawl or Jina) to enable advanced web search and URL scraping features.
4.  Start chatting with the AI, searching the web, or interacting with your documents!

### Using with Local LLMs (e.g., Ollama)

You can configure Chat Box to work with local LLMs like those served by Ollama.

1.  **Run your Ollama server**:
    Open your terminal and run the following command. This makes Ollama accessible to the extension.
    ```bash
    OLLAMA_HOST=0.0.0.0 OLLAMA_PORT=11434 OLLAMA_ORIGINS='*' ollama serve
    ```
    *   `OLLAMA_HOST=0.0.0.0`: Allows connections from any network interface.
    *   `OLLAMA_PORT=11434`: Standard Ollama port.
    *   `OLLAMA_ORIGINS='*'`: Allows requests from any origin, necessary for the Chrome extension to connect.

2.  **Configure Chat Box Settings**:
    -   Go to the Chat Box **Settings** panel.
    -   For **Endpoint**, enter: `http://localhost:11434/v1`
    -   For **API Key**, enter: `no-key` (Ollama's OpenAI-compatible endpoint doesn't strictly require a key, but the field might be mandatory in the UI. Any non-empty string should work).
    -   Click "Load Models" to see models available from your Ollama instance.


## To-Do Plan

- [x] Add custom provider
- [x] Improve search
- [x] Improve UI when chat with image
- [x] Improve store history chat
- [ ] Public to Chrome Web Store
- [ ] Chat support file pdf
- [ ] Better generate chat title
- [ ] Using on Firefox
- [ ] Custom UI
...

## Technologies Used

-   React
-   Tailwind CSS
-   Shadcn UI
-   Chrome Extension APIs (Manifest V3)
-   Firecrawl API (for web search/scraping)
-   Jina AI API (for web search/scraping)