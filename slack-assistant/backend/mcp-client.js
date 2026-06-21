import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import dotenv from "dotenv";

dotenv.config();

class MCPClientManager {
  constructor() {
    this.client = null;
    this.connected = false;
    this.tools = [];
    this.error = null;
    this.logs = [];
  }

  log(msg) {
    const time = new Date().toLocaleTimeString();
    const formatted = `[${time}] ${msg}`;
    console.log(formatted);
    this.logs.push(formatted);
    if (this.logs.length > 50) this.logs.shift(); // Keep last 50 logs
  }

  async connect() {
    if (this.connected) return;

    this.log("Initializing MCP Client...");
    const transportType = process.env.SLACK_MCP_TRANSPORT || "stdio";
    this.log(`Selected transport: ${transportType.toUpperCase()}`);

    try {
      this.client = new Client(
        { name: "slack-assistant-backend", version: "1.0.0" },
        { capabilities: {} }
      );

      let transport;
      if (transportType === "stdio") {
        const command = process.env.SLACK_MCP_COMMAND || "npx";
        const argsStr = process.env.SLACK_MCP_ARGS || "-y,@modelcontextprotocol/server-slack";
        const args = argsStr.split(",").filter(a => a.trim() !== "");

        this.log(`Launching local Stdio server: ${command} ${args.join(" ")}`);
        
        // Pass Slack tokens to the child process env
        const spawnEnv = {
          ...process.env,
          SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
          SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN
        };

        transport = new StdioClientTransport({
          command,
          args,
          env: spawnEnv
        });
      } else if (transportType === "sse") {
        const urlStr = process.env.SLACK_MCP_SSE_URL || "http://localhost:3010/sse";
        this.log(`Connecting to SSE server: ${urlStr}`);
        transport = new SSEClientTransport(new URL(urlStr));
      } else {
        throw new Error(`Unsupported transport type: ${transportType}`);
      }

      await this.client.connect(transport);
      this.connected = true;
      this.error = null;
      this.log("Connected to MCP server successfully!");

      // Fetch tools
      this.log("Retrieving tool list from MCP server...");
      const toolsResponse = await this.client.listTools();
      this.tools = toolsResponse.tools || [];
      this.log(`Discovered ${this.tools.length} tools: ${this.tools.map(t => t.name).join(", ")}`);
    } catch (err) {
      this.connected = false;
      this.error = err.message;
      this.log(`Connection Error: ${err.message}`);
      console.error(err);
      this.client = null;
    }
  }

  async listTools() {
    if (!this.connected) {
      await this.connect();
    }
    return this.tools;
  }

  async callTool(name, args = {}) {
    if (!this.connected) {
      await this.connect();
    }
    if (!this.connected) {
      throw new Error(`MCP Client is offline. Cannot call tool "${name}".`);
    }

    this.log(`Invoking tool: ${name} with args: ${JSON.stringify(args)}`);
    try {
      const response = await this.client.callTool({
        name,
        arguments: args
      });
      return response;
    } catch (err) {
      this.log(`Error calling tool "${name}": ${err.message}`);
      throw err;
    }
  }

  getStatus() {
    return {
      connected: this.connected,
      transport: process.env.SLACK_MCP_TRANSPORT || "stdio",
      toolsCount: this.tools.length,
      error: this.error,
      logs: this.logs
    };
  }

  async disconnect() {
    if (this.client) {
      this.log("Disconnecting from MCP server...");
      try {
        await this.client.close();
      } catch (err) {
        this.log(`Error closing client: ${err.message}`);
      }
      this.client = null;
      this.connected = false;
      this.log("Disconnected.");
    }
  }
}

export const mcpClientManager = new MCPClientManager();
