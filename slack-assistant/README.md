# Local AI Slack Assistant Web Application

A local-first, interactive console for managing, searching, and summarizing your Slack workspace. The application interfaces with a Slack Model Context Protocol (MCP) server dynamically, routing user queries to appropriate tools via the Gemini LLM.

---

## 🛠️ Tech Stack & Architecture

- **Frontend:** React, Vite (port `3000`), custom responsive Markdown parser, and CSS variablescyber theme.
- **Backend:** Node.js, Express (port `3001`), using the official `@modelcontextprotocol/sdk` to bind stdio/SSE streams.
- **AI Core:** Prompt classification and tool routing run locally on Express, resolving completions with the Google Gemini API.

---

## 🚀 Quick Start Guide

### Step 1: Clone & Install Dependencies
Navigate to the directory in your terminal and run the helper installer script:
```bash
cd slack-assistant
npm run install:all
```
This automatically runs `npm install` in the root, `backend/`, and `frontend/` folders.

### Step 2: Configure Environment Keys
Duplicate the `.env.example` file and save it as `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in the required keys:
- **`GEMINI_API_KEY`:** Get a free API key from [Google AI Studio](https://aistudio.google.com/).
- **`SLACK_MCP_TRANSPORT`:** Set to `stdio` (launches local node process) or `sse` (connects to external port).
- **`SLACK_BOT_TOKEN`** & **`SLACK_APP_TOKEN`:** Add your credentials if using local Stdio transport.

### Step 3: Run the Application
Start the frontend and backend servers concurrently:
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!

---

## 💬 Sample Prompts to Try

Once launched, try typing these prompts into your local console:

### 1. Searching & Filtering
- *"Find all messages about Redis timeout from last week."*
- *"Find messages from Chandra about production deployment."*
- *"Show me recent messages mentioning billing errors."*

### 2. Summarization & Decision Extraction
- *"Summarize today's messages in #project-updates."*
- *"What decisions were made in the AEP launch thread?"*
- *"List all action items mentioned in #team-meeting yesterday."*

### 3. Safe Drafting & Confirmations
- *"Draft a message 'Urgent check needed on database connection pool' to #general."*
- *Watch the UI capture the intent, compile a card layout preview showing the destination, and prompt you to click "Confirm & Send" before executing.*

---

## 🔒 Safe Workspace Writes
The application strictly enforces a **no-direct-write** policy:
- Prompt completions that suggest writing messages (e.g. `slack_post_message`) will first return a `draft_preview` JSON structure to the frontend.
- The React client intercepts this draft and suspends the action inside a dedicated visual confirmation layout.
- The user can review the target recipient and message content, and click **Confirm & Send** to explicitly authorize the post, or **Cancel Draft** to discard.

---

## 🔑 Slack Token Scopes Reference
Ensure your Slack App has the following scopes authorized on your workspace:
- `channels:history` (read public channel messages)
- `groups:history` (read private channel messages)
- `chat:write` (post messages as the bot)
- `search:read` (execute keyword workspace searches)
- `users:read` (resolve user IDs to readable names)

---

## ⚡ Netlify Serverless Deployment

You can deploy this fullstack application directly to Netlify. The static React frontend will be built, and the Express backend routes will automatically be hosted as a **Netlify Serverless Function**.

### ⚠️ Critical Serverless Constraints
Because serverless functions are ephemeral, they cannot manage local child processes. Therefore:
1. **No Stdio Mode:** You cannot launch a local Stdio process on Netlify. You **must** use **SSE (Server-Sent Events) Mode** to connect to an external running Slack MCP server.
2. **Setup your Slack MCP server** on a persistent server (e.g., your local machine exposed via `ngrok` or a VPS) running in SSE mode.
3. Configure the Netlify environment variables to point to your public SSE server URL.

### Deployment Steps
1. Push this directory to a GitHub repository.
2. Link your repository in the **Netlify Dashboard**.
3. Netlify will automatically detect **`netlify.toml`** and apply the build configurations:
   * **Build Command:** `npm run build --prefix frontend`
   * **Publish Directory:** `frontend/dist`
   * **Functions Directory:** `netlify/functions`
4. Set the following **Environment Variables** in the Netlify settings under **Site configuration > Environment variables**:
   * `GEMINI_API_KEY`: *(Your Google Gemini API Key)*
   * `SLACK_MCP_TRANSPORT`: `sse`
   * `SLACK_MCP_SSE_URL`: *(Your public, running Slack MCP SSE URL, e.g. `https://your-mcp-server.com/sse`)*
5. Trigger a deploy. Your assistant will be live at `https://your-site-name.netlify.app`!
