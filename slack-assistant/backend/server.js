import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { mcpClientManager } from "./mcp-client.js";
import { runSlackAgent } from "./agent.js";

import path from "path";
import { fileURLToPath } from "url";

let envPath;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  envPath = path.resolve(__dirname, "../.env");
} catch (e) {
  envPath = "./.env";
}
dotenv.config({ path: envPath });

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Boot MCP Client on startup
mcpClientManager.connect();

/**
 * GET /api/health
 * Returns status info for backend, MCP connection, and environment state
 */
app.get("/api/health", (req, res) => {
  const mcpStatus = mcpClientManager.getStatus();
  res.json({
    status: "OK",
    time: new Date(),
    mcp: mcpStatus,
    env: {
      geminiApiKeySet: !!process.env.GEMINI_API_KEY,
      botTokenSet: !!process.env.SLACK_BOT_TOKEN,
      appTokenSet: !!process.env.SLACK_APP_TOKEN,
      geminiModel: process.env.GEMINI_MODEL || "gemini-1.5-flash"
    }
  });
});

/**
 * GET /api/mcp/tools
 * Lists tools dynamically exposed by the active Slack MCP server
 */
app.get("/api/mcp/tools", async (req, res) => {
  try {
    const tools = await mcpClientManager.listTools();
    res.json({ success: true, tools });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/chat
 * Route prompt queries through the Gemini LLM tool-routing loop
 */
app.post("/api/chat", async (req, res) => {
  const { prompt, history } = req.body;
  if (!prompt) {
    return res.status(400).json({ success: false, error: "Prompt is required." });
  }

  try {
    const response = await runSlackAgent(prompt, history || []);
    res.json({ success: true, ...response });
  } catch (err) {
    console.error("Chat completion failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/slack/send-confirm
 * Executes the actual message posting after explicit user confirmation in the UI
 */
app.post("/api/slack/send-confirm", async (req, res) => {
  const { mcpTool, args } = req.body;
  
  if (!mcpTool || !args) {
    return res.status(400).json({ success: false, error: "mcpTool and args are required." });
  }

  try {
    mcpClientManager.log(`Direct execution: running Slack post via ${mcpTool}`);
    const result = await mcpClientManager.callTool(mcpTool, args);
    res.json({ success: true, result });
  } catch (err) {
    console.error("Failed to post message:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/settings/update
 * Updates transport configurations dynamically from the frontend settings panel
 */
app.post("/api/settings/update", async (req, res) => {
  const { transport, command, args, botToken, appToken, sseUrl, geminiApiKey, geminiModel } = req.body;

  try {
    mcpClientManager.log("Updating environment settings dynamically...");
    
    // Update active memory environment variables (ignoring bullet placeholders)
    if (transport) process.env.SLACK_MCP_TRANSPORT = transport;
    if (command) process.env.SLACK_MCP_COMMAND = command;
    if (args) process.env.SLACK_MCP_ARGS = args;
    if (botToken && botToken !== "••••••••") process.env.SLACK_BOT_TOKEN = botToken;
    if (appToken && appToken !== "••••••••") process.env.SLACK_APP_TOKEN = appToken;
    if (sseUrl) process.env.SLACK_MCP_SSE_URL = sseUrl;
    if (geminiApiKey && geminiApiKey !== "••••••••") process.env.GEMINI_API_KEY = geminiApiKey;
    if (geminiModel) process.env.GEMINI_MODEL = geminiModel;

    mcpClientManager.log("Reconnecting MCP Client with new settings...");
    await mcpClientManager.disconnect();
    await mcpClientManager.connect();

    const status = mcpClientManager.getStatus();
    res.json({ success: true, status });
  } catch (err) {
    console.error("Failed to update settings:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server (only if not running inside Netlify Serverless Functions)
let server;
if (!process.env.NETLIFY) {
  server = app.listen(PORT, () => {
    console.log(`🚀 Slack Assistant Backend running at http://localhost:${PORT}`);
  });

  // Handle graceful shutdown
  process.on("SIGTERM", () => {
    console.log("Shutting down...");
    server.close(async () => {
      await mcpClientManager.disconnect();
      process.exit(0);
    });
  });
}

export default app;
