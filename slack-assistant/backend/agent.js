import dotenv from "dotenv";
import { mcpClientManager } from "./mcp-client.js";

dotenv.config();

/**
 * Calls the Gemini API directly using native fetch.
 * This is fast, robust, and requires zero external SDK dependencies.
 */
async function callGemini(contents, systemInstruction, forceJson = true) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in the environment.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const body = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    generationConfig: {
      temperature: 0.1 // Low temperature for consistent tool calling
    }
  };

  if (forceJson) {
    body.generationConfig.responseMimeType = "application/json";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

/**
 * Agent orchestrator that runs the prompt-routing & tool-execution loop.
 */
export async function runSlackAgent(userPrompt, conversationHistory = []) {
  // 1. Retrieve current Slack MCP tools
  const tools = await mcpClientManager.listTools();
  
  // Format tool definitions for the LLM
  const mcpStatus = mcpClientManager.getStatus();
  if (!mcpStatus.connected) {
    return {
      type: "reply",
      content: `❌ **Slack MCP Server is Offline.**\n\nI cannot access Slack details right now. Please check your settings and make sure the Slack MCP server is running.\n\n*Error Detail:* \`${mcpStatus.error || "Unknown connection error"}\``
    };
  }

  const systemInstruction = `You are a local AI assistant designed to manage a Slack workspace using MCP tools.
You are running on a local server and have access to the following Slack MCP tools:
${JSON.stringify(tools, null, 2)}

Given the user's prompt, decide if you need to run one of these tools or if you can answer directly.
If you need to query Slack, find the most appropriate tool and call it. 

IMPORTANT DIRECTIVES:
1. For queries mentioning channel names (like "#general" or "#team"), look at the list of tools to see if there is a tool to list channels or search channels (e.g. "slack_list_channels", "list_channels", "get_channels", "channels"). If so, use it first to resolve the channel name to a channel ID.
2. For drafting or sending messages (e.g. "Draft message 'Hello' to #general" or "Send 'urgent update' to general"), DO NOT call the post message tool directly. Instead, generate a "draft_preview" response so the user can verify it in the UI.
3. Keep track of date ranges: "today" is ${new Date().toLocaleDateString()}, "yesterday" is ${new Date(Date.now() - 86400000).toLocaleDateString()}.
4. Group summaries logically by topics, highlighting blocker issues, decisions, and action items with owners.

You must respond ONLY with a JSON object in one of the following formats:

Format A: If you need to call a tool:
{
  "type": "tool_call",
  "tool": "mcp_tool_name_here",
  "args": {
    "arg_name": "arg_value"
  }
}

Format B: If you want to draft a message to post (DO NOT post directly!):
{
  "type": "draft_preview",
  "recipient": "#general", // Name of target channel or user
  "content": "Message content draft...",
  "mcpTool": "slack_post_message", // Name of the tool used for posting (e.g. post_message, send_message)
  "args": {
    "channelId": "C123456", // Resolved channel ID
    "text": "Message content draft..."
  }
}

Format C: If you have all details and are ready to compile the final answer:
{
  "type": "reply",
  "content": "Your final detailed Markdown response. Use headings, lists, source references, and bold terms. When citing messages, show the channel name, sender, and timestamp."
}
`;

  // Assemble the message history for Gemini
  // Gemini requires roles to be "user" or "model"
  const contents = [];
  
  // Format prior history
  conversationHistory.forEach(msg => {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    });
  });

  // Append current user prompt
  contents.push({
    role: "user",
    parts: [{ text: userPrompt }]
  });

  const maxSteps = 4;
  let currentStep = 0;
  const traces = [];

  while (currentStep < maxSteps) {
    currentStep++;
    console.log(`Agent Loop: Step ${currentStep}`);
    
    try {
      const llmResult = await callGemini(contents, systemInstruction, true);
      const parsed = JSON.parse(llmResult);
      
      if (parsed.type === "reply") {
        traces.push({ step: currentStep, type: "reply" });
        return {
          type: "reply",
          content: parsed.content,
          traces
        };
      }
      
      if (parsed.type === "draft_preview") {
        traces.push({ step: currentStep, type: "draft", tool: parsed.mcpTool, recipient: parsed.recipient });
        return {
          type: "draft_preview",
          recipient: parsed.recipient,
          content: parsed.content,
          mcpTool: parsed.mcpTool,
          args: parsed.args,
          traces
        };
      }
      
      if (parsed.type === "tool_call") {
        const { tool, args } = parsed;
        traces.push({ step: currentStep, type: "tool_call", tool, args });
        
        // Execute the MCP tool
        let toolOutput;
        try {
          const mcpResponse = await mcpClientManager.callTool(tool, args);
          toolOutput = JSON.stringify(mcpResponse);
        } catch (mcpErr) {
          toolOutput = `Error calling tool "${tool}": ${mcpErr.message}`;
        }
        
        // Log the tool calling interaction back into the LLM context
        contents.push({
          role: "model",
          parts: [{ text: llmResult }]
        });
        
        contents.push({
          role: "user",
          parts: [{ text: `Tool Output for ${tool}: ${toolOutput}` }]
        });
      } else {
        throw new Error(`Invalid response type: ${parsed.type}`);
      }
    } catch (err) {
      console.error(`Agent loop step ${currentStep} error:`, err);
      return {
        type: "reply",
        content: `⚠️ **Agent Error during execution:**\n\n\`${err.message}\`\n\nHere are the logs up to this point:\n${traces.map(t => `- Step ${t.step}: ${t.type} ${t.tool || ""}`).join("\n")}`,
        traces
      };
    }
  }

  return {
    type: "reply",
    content: "⚠️ **Agent execution timed out.** It made too many sequential tool calls without compiling a final reply.",
    traces
  };
}
