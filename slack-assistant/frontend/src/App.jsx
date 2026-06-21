import React, { useState, useEffect, useRef } from "react";
import "./App.css";

// Preset helper prompts for the quick select UI
const SUGGESTED_PROMPTS = [
  { label: "Summarize Today's Updates", prompt: "Summarize today's messages in #general." },
  { label: "Find Blocker Logs", prompt: "Find all messages about Redis timeout or database errors from last week." },
  { label: "Action Items & Decisions", prompt: "What decisions were made and are there any action items assigned to someone?" },
  { label: "Draft general update", prompt: "Draft a message to #general: 'Team, the production deployment is complete.'" }
];

export default function App() {
  // State
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content: "👋 Welcome to your local **Slack AI Assistant** console. I connect directly to your local Slack MCP server. Ask me to search messages, summarize discussions, analyze blockers, or draft notifications.",
      type: "reply"
    }
  ]);
  const [promptInput, setPromptInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [backendUrl, setBackendUrl] = useState(localStorage.getItem("slack_assistant_backend_url") || "");
  const [tempBackendUrl, setTempBackendUrl] = useState(localStorage.getItem("slack_assistant_backend_url") || "");

  const getApiUrl = (endpoint) => {
    if (backendUrl) {
      const base = backendUrl.replace(/\/$/, "");
      return `${base}${endpoint}`;
    }
    return endpoint;
  };
  
  // Health & MCP Diagnostics State
  const [health, setHealth] = useState({
    connected: false,
    transport: "stdio",
    toolsCount: 0,
    error: null,
    logs: []
  });
  const [tools, setTools] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Settings edit state
  const [settingsForm, setSettingsForm] = useState({
    transport: "stdio",
    command: "npx",
    args: "-y,@modelcontextprotocol/server-slack",
    botToken: "",
    appToken: "",
    sseUrl: "http://localhost:3010/sse",
    geminiApiKey: ""
  });

  const chatEndRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load diagnostics and health indicators on mount
  useEffect(() => {
    fetchHealth();
    fetchTools();
    const interval = setInterval(() => {
      fetchHealth();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchHealth = async (overrideUrl) => {
    try {
      const url = overrideUrl !== undefined 
        ? (overrideUrl ? `${overrideUrl.replace(/\/$/, "")}/api/health` : "/api/health") 
        : getApiUrl("/api/health");
      const res = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();
      if (data.mcp) {
        setHealth(data.mcp);
        // Pre-populate settings form fields once if empty
        setSettingsForm(prev => ({
          ...prev,
          transport: data.mcp.transport || prev.transport,
          botToken: data.env.botTokenSet ? "••••••••" : prev.botToken,
          appToken: data.env.appTokenSet ? "••••••••" : prev.appToken,
          geminiApiKey: data.env.geminiApiKeySet ? "••••••••" : prev.geminiApiKey
        }));
      }
    } catch (err) {
      console.warn("Health check unreachable:", err);
      setHealth(prev => ({ ...prev, connected: false, error: "Backend server offline." }));
    }
  };

  const fetchTools = async (overrideUrl) => {
    try {
      const url = overrideUrl !== undefined 
        ? (overrideUrl ? `${overrideUrl.replace(/\/$/, "")}/api/mcp/tools` : "/api/mcp/tools") 
        : getApiUrl("/api/mcp/tools");
      const res = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();
      if (data.success) {
        setTools(data.tools || []);
      }
    } catch (err) {
      console.warn("Failed to fetch tool definitions:", err);
    }
  };

  const handleSendPrompt = async (promptText) => {
    if (!promptText.trim() || isLoading) return;
    
    // Add user query message
    const userMsg = { id: Date.now().toString(), role: "user", content: promptText, type: "reply" };
    setMessages(prev => [...prev, userMsg]);
    setPromptInput("");
    setIsLoading(true);

    // Format chat history context
    const history = messages
      .filter(m => m.id !== "welcome" && m.status !== "draft_cancelled")
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(getApiUrl("/api/chat"), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ prompt: promptText, history })
      });
      const data = await res.json();

      if (data.success) {
        const assistantMsg = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.content || "",
          type: data.type, // 'reply' or 'draft_preview'
          recipient: data.recipient,
          mcpTool: data.mcpTool,
          args: data.args,
          traces: data.traces,
          status: "pending_confirm" // for draft states
        };
        setMessages(prev => [...prev, assistantMsg]);
      } else {
        throw new Error(data.error || "Failed to process query.");
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: `❌ **Failed to analyze prompt:**\n\n\`${err.message}\``,
          type: "reply"
        }
      ]);
    } finally {
      setIsLoading(false);
      fetchHealth(); // refresh tools logs
    }
  };

  // Safe Slack Message Posting Flows
  const handleConfirmSend = async (msgId, mcpTool, args) => {
    setMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, status: "sending" } : m))
    );

    try {
      const res = await fetch(getApiUrl("/api/slack/send-confirm"), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ mcpTool, args })
      });
      const data = await res.json();

      if (data.success) {
        setMessages(prev =>
          prev.map(m =>
            m.id === msgId
              ? {
                  ...m,
                  status: "sent",
                  content: `✅ **Message successfully posted to Slack!**\n\n*Recipients:* \`${m.recipient}\`\n*Channel ID:* \`${args.channelId || args.channel || ""}\`\n\n*Draft content posted:* \n> ${m.args.text || m.args.message || m.content}`
                }
              : m
          )
        );
      } else {
        throw new Error(data.error || "Slack API tools rejected write call.");
      }
    } catch (err) {
      console.error(err);
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId
            ? {
                ...m,
                status: "failed",
                content: `❌ **Failed to send to Slack:**\n\n\`${err.message}\``
              }
            : m
        )
      );
    }
  };

  const handleCancelDraft = (msgId) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === msgId
          ? {
              ...m,
              status: "draft_cancelled",
              content: "🚫 *Message draft cancelled by user.*"
            }
          : m
      )
    );
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      // Save backend URL locally
      localStorage.setItem("slack_assistant_backend_url", tempBackendUrl);
      setBackendUrl(tempBackendUrl);

      const targetBase = tempBackendUrl ? tempBackendUrl.replace(/\/$/, "") : "";
      const updateEndpoint = targetBase ? `${targetBase}/api/settings/update` : "/api/settings/update";

      const res = await fetch(updateEndpoint, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify(settingsForm)
      });
      const data = await res.json();
      if (data.success) {
        alert("Settings updated! MCP Client reconnected.");
        setShowSettings(false);
        // Refresh with new URL directly
        fetchHealth(tempBackendUrl);
        fetchTools(tempBackendUrl);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      alert(`Failed to save settings: ${err.message}`);
    }
  };

  // Custom Inline Styles parser for bold (**text**) and code (`code`)
  const parseInline = (text) => {
    if (!text) return "";
    const regex = /(\*\*.*?\*\*|`.*?`)/g;
    const splitParts = text.split(regex);
    return splitParts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  // Custom Markdown lines compiler
  const renderMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    let inList = false;
    const listItems = [];
    const elements = [];

    const flushList = (key) => {
      if (listItems.length > 0) {
        elements.push(<ul key={`list-${key}`} className="md-ul">{[...listItems]}</ul>);
        listItems.length = 0;
      }
    };

    lines.forEach((line, idx) => {
      if (line.startsWith("- ") || line.startsWith("* ")) {
        inList = true;
        listItems.push(<li key={`li-${idx}`} className="md-li">{parseInline(line.substring(2))}</li>);
      } else {
        if (inList) {
          flushList(idx);
          inList = false;
        }

        if (line.startsWith("### ")) {
          elements.push(<h4 key={idx} className="md-h4">{parseInline(line.substring(4))}</h4>);
        } else if (line.startsWith("## ")) {
          elements.push(<h3 key={idx} className="md-h3">{parseInline(line.substring(3))}</h3>);
        } else if (line.startsWith("# ")) {
          elements.push(<h2 key={idx} className="md-h2">{parseInline(line.substring(2))}</h2>);
        } else if (line.startsWith("> ")) {
          elements.push(<blockquote key={idx} className="md-quote">{parseInline(line.substring(2))}</blockquote>);
        } else if (line.trim() === "") {
          elements.push(<div key={idx} className="md-spacing" />);
        } else {
          elements.push(<p key={idx} className="md-p">{parseInline(line)}</p>);
        }
      }
    });

    if (inList) {
      flushList("end");
    }

    return elements;
  };

  return (
    <div id="slack-assistant-app">
      {/* 1. Sidebar Container */}
      <aside id="app-sidebar" className="glass-panel">
        <div id="sidebar-header">
          <div className="app-logo">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path fill="var(--slack-aubergine)" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523 2.528 2.528 0 0 1-2.522-2.523 2.528 2.528 0 0 1 2.522-2.52h2.52v2.52zm1.261 0a2.528 2.528 0 0 1 2.52-2.52h5.043a2.528 2.528 0 0 1 2.522 2.52v5.042a2.528 2.528 0 0 1-2.522 2.52H8.824a2.528 2.528 0 0 1-2.52-2.52v-5.042zM8.824 5.043a2.528 2.528 0 0 1-2.52-2.52A2.528 2.528 0 0 1 8.824 0a2.528 2.528 0 0 1 2.52 2.522v2.52h-2.52zm0 1.261a2.528 2.528 0 0 1 2.52 2.52v5.043a2.528 2.528 0 0 1-2.52 2.522H3.782a2.528 2.528 0 0 1-2.52-2.522 2.528 2.528 0 0 1 2.52-2.52h5.042zm10.134 3.782a2.528 2.528 0 0 1 2.52-2.522 2.528 2.528 0 0 1 2.522 2.522 2.528 2.528 0 0 1-2.522 2.52h-2.52v-2.52zm-1.262 0a2.528 2.528 0 0 1-2.52 2.522h-5.043a2.528 2.528 0 0 1-2.522-2.522V3.783a2.528 2.528 0 0 1 2.522-2.52h5.043a2.528 2.528 0 0 1 2.52 2.52v5.043zm-3.782 10.134a2.528 2.528 0 0 1 2.52 2.52 2.528 2.528 0 0 1-2.52 2.523 2.528 2.528 0 0 1-2.522-2.523v-2.52h2.522zm0-1.262a2.528 2.528 0 0 1-2.522-2.52v-5.043a2.528 2.528 0 0 1 2.522-2.52h5.043a2.528 2.528 0 0 1 2.52 2.52v5.043a2.528 2.528 0 0 1-2.52 2.52h-5.043z" />
            </svg>
            <span className="logo-text">SLACK AI</span>
          </div>
          <span className="local-tag">LOCAL</span>
        </div>

        {/* Connection status card */}
        <div className={`status-badge-card ${health.connected ? "connected" : "disconnected"}`}>
          <div className="status-indicator">
            <span className={`status-dot ${health.connected ? "pulse-green" : "pulse-red"}`}></span>
            <span className="status-label">
              {health.connected ? "SLACK MCP CONNECTED" : "SLACK MCP OFFLINE"}
            </span>
          </div>
          <span className="transport-mode">
            TRANSPORT: {health.transport.toUpperCase()}
          </span>
        </div>

        {/* Sidebar Nav */}
        <nav className="sidebar-nav">
          <button className={`nav-item active`}>
            <span>💬 Prompt Console</span>
          </button>
          <button className="nav-item" onClick={() => setShowSettings(true)}>
            <span>⚙️ Config Settings</span>
          </button>
        </nav>

        {/* Discovery Tools Panel */}
        <div className="discovery-tools-section">
          <h3>DISCOVERED MCP TOOLS ({tools.length})</h3>
          <div className="tools-list scroll-container">
            {tools.length === 0 ? (
              <span className="tools-empty">No tools found. Connect server.</span>
            ) : (
              tools.map((t, idx) => (
                <div key={idx} className="tool-card" title={t.description}>
                  <span className="tool-name">🛠️ {t.name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Toggleable diagnostics logs */}
        <div className="diagnostics-logs-toggle">
          <button className="text-btn" onClick={() => setShowLogs(!showLogs)}>
            {showLogs ? "▼ Hide Connection Logs" : "▶ Show Connection Logs"}
          </button>
          {showLogs && (
            <div className="diagnostics-log-box scroll-container">
              {health.logs.length === 0 ? (
                <span>No logs recorded yet...</span>
              ) : (
                health.logs.map((log, i) => (
                  <div key={i} className="log-line">{log}</div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      {/* 2. Main Prompt Chat Screen */}
      <main id="prompt-workspace">
        <header id="workspace-header" className="glass-panel">
          <h1>Prompt Interface</h1>
          <button className="glow-btn" style={{ padding: "8px 16px", fontSize: "0.8rem", borderRadius: "6px" }} onClick={() => setShowSettings(true)}>
            MCP Settings
          </button>
        </header>

        {/* Messages Stack */}
        <div id="messages-container" className="scroll-container">
          {messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === "assistant" ? "🤖" : "👤"}
              </div>
              <div className="message-bubble glass-panel">
                <div className="message-body">
                  {renderMarkdown(msg.content)}
                </div>

                {/* Agent Call traces logs */}
                {msg.traces && msg.traces.length > 0 && (
                  <div className="agent-trace-logs">
                    <h4>AGENT WORKFLOW TRACE</h4>
                    <ol>
                      {msg.traces.map((t, i) => (
                        <li key={i}>
                          {t.type === "tool_call" && (
                            <span>Called MCP Tool: <code>{t.tool}</code></span>
                          )}
                          {t.type === "draft" && (
                            <span>Created message draft for <code>{t.recipient}</code></span>
                          )}
                          {t.type === "reply" && (
                            <span>Compiled final response.</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Safe Confirm Preview Card */}
                {msg.type === "draft_preview" && msg.status === "pending_confirm" && (
                  <div className="slack-preview-card">
                    <div className="preview-header">
                      <span className="recipient-label">TO SLACK RECIPIENT:</span>
                      <span className="recipient-value">{msg.recipient}</span>
                    </div>
                    <div className="preview-text-body">
                      {msg.args.text || msg.args.message || msg.content}
                    </div>
                    <div className="preview-warning">
                      ⚠️ Explicit approval required. This drafts a real message to your active Slack workspace.
                    </div>
                    <div className="preview-actions">
                      <button className="preview-btn cancel" onClick={() => handleCancelDraft(msg.id)}>
                        Cancel Draft
                      </button>
                      <button className="preview-btn confirm glow-btn animate-glow" onClick={() => handleConfirmSend(msg.id, msg.mcpTool, msg.args)}>
                        Confirm & Send
                      </button>
                    </div>
                  </div>
                )}

                {/* Draft states messages */}
                {msg.type === "draft_preview" && msg.status === "sending" && (
                  <div className="draft-status-indicator">
                    <div className="spinner-small"></div>
                    <span>Delivering message packet to Slack...</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-row assistant">
              <div className="message-avatar">🤖</div>
              <div className="message-bubble glass-panel loader-bubble">
                <div className="agent-thinking">
                  <div className="thinking-dot"></div>
                  <div className="thinking-dot"></div>
                  <div className="thinking-dot"></div>
                  <span style={{ fontSize: "0.8rem", color: "#a0aec0", marginLeft: "10px" }}>AI agent routing tools...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Quick select suggestions list */}
        {messages.length === 1 && (
          <div id="quick-prompt-selector">
            <h3>SELECT A SAMPLE PROMPT TO TEST:</h3>
            <div className="suggestions-grid">
              {SUGGESTED_PROMPTS.map((p, idx) => (
                <button key={idx} className="suggestion-card glass-panel" onClick={() => { setPromptInput(p.prompt); handleSendPrompt(p.prompt); }}>
                  <span className="suggestion-label">{p.label}</span>
                  <span className="suggestion-text">"{p.prompt}"</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input box */}
        <footer id="workspace-input-area" className="glass-panel">
          <form onSubmit={(e) => { e.preventDefault(); handleSendPrompt(promptInput); }} style={{ display: "flex", width: "100%", gap: "10px" }}>
            <input type="text" value={promptInput} onChange={(e) => setPromptInput(e.target.value)} placeholder="Type a prompt (e.g. summarize today's messages in #general)..." disabled={isLoading} />
            <button type="submit" className="glow-btn" disabled={isLoading || !promptInput.trim()}>
              SEND
            </button>
          </form>
        </footer>
      </main>

      {/* 3. Settings Modal */}
      {showSettings && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel">
            <h2>⚙️ Slack MCP & LLM Configuration</h2>
            
            {/* Section 1: Frontend Proxy URL */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "20px", marginBottom: "20px" }}>
              <div className="form-group">
                <label>BACKEND API URL (Optional - e.g. https://xxxx.ngrok-free.dev)</label>
                <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                  <input 
                    type="url" 
                    value={tempBackendUrl} 
                    onChange={(e) => setTempBackendUrl(e.target.value)} 
                    placeholder="Leave empty for Netlify serverless functions" 
                    style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#222", color: "#fff" }} 
                  />
                  <button 
                    type="button" 
                    className="glow-btn" 
                    style={{ padding: "8px 16px", borderRadius: "4px" }}
                    onClick={() => {
                      localStorage.setItem("slack_assistant_backend_url", tempBackendUrl);
                      setBackendUrl(tempBackendUrl);
                      alert("Backend URL saved! Connecting...");
                      fetchHealth(tempBackendUrl);
                      fetchTools(tempBackendUrl);
                    }}
                  >
                    Save URL
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: Backend Credentials Form */}
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label>GEMINI API KEY</label>
                <input type="password" value={settingsForm.geminiApiKey} onChange={(e) => setSettingsForm({ ...settingsForm, geminiApiKey: e.target.value })} placeholder="Keep empty to preserve current value" />
              </div>

              <div className="form-group">
                <label>TRANSPORT TYPE</label>
                <select value={settingsForm.transport} onChange={(e) => setSettingsForm({ ...settingsForm, transport: e.target.value })}>
                  <option value="stdio">Stdio (Launch Local Process)</option>
                  <option value="sse">SSE (Connect to active port)</option>
                </select>
              </div>

              {settingsForm.transport === "stdio" ? (
                <>
                  <div className="form-group">
                    <label>STDIO COMMAND</label>
                    <input type="text" value={settingsForm.command} onChange={(e) => setSettingsForm({ ...settingsForm, command: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>STDIO ARGS (Comma separated)</label>
                    <input type="text" value={settingsForm.args} onChange={(e) => setSettingsForm({ ...settingsForm, args: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>SLACK BOT TOKEN (xoxb-...)</label>
                    <input type="password" value={settingsForm.botToken} onChange={(e) => setSettingsForm({ ...settingsForm, botToken: e.target.value })} placeholder="Keep empty to preserve current value" />
                  </div>
                  <div className="form-group">
                    <label>SLACK APP TOKEN (xapp-...)</label>
                    <input type="password" value={settingsForm.appToken} onChange={(e) => setSettingsForm({ ...settingsForm, appToken: e.target.value })} placeholder="Keep empty to preserve current value" />
                  </div>
                </>
              ) : (
                <div className="form-group">
                  <label>SSE SERVER URL</label>
                  <input type="url" value={settingsForm.sseUrl} onChange={(e) => setSettingsForm({ ...settingsForm, sseUrl: e.target.value })} required />
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="preview-btn cancel" onClick={() => setShowSettings(false)}>
                  Close
                </button>
                <button type="submit" className="preview-btn confirm glow-btn">
                  Save & Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
