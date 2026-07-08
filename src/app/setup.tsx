// Copyright © 2026 PACTResearch.net. All rights reserved.
// pactresearch.net
import React, { useState } from "react";

export type SetupData = {
  name: string;
  email: string;
  context: string;
  anthropicApiKey: string;
  openaiApiKey: string;
};

export type ExecutionMode = "table of content" | "interactive";

type Tab = "keys" | "profile" | "notebook";

type SetupProps = {
  onSave: (data: SetupData) => void;
  onUpdateSystemPrompt?: (systemPrompt: string) => void;
  onClose?: () => void;
  initialData?: Partial<SetupData & { systemPrompt: string; iprMessages: { role: string; content: string }[] }>;
  defaultTab?: Tab;
  isFirstRun?: boolean;
  onIprSend?: (messages: { role: string; content: string }[]) => void;
  onIprSaveMessages?: (messages: { role: string; content: string }[]) => void;
  iprPending?: boolean;
  iprLastResponse?: string;
  iprError?: string;
  onSaveExecutionMode?: (mode: ExecutionMode) => void;
  onSaveResearchQuestion?: (question: string) => void;
};

export default function Setup({
  onSave,
  onUpdateSystemPrompt,
  onClose,
  initialData = {},
  defaultTab = "keys",
  isFirstRun = false,
  onIprSend,
  onIprSaveMessages,
  iprPending = false,
  iprLastResponse,
  iprError,
  onSaveExecutionMode,
  onSaveResearchQuestion,
}: SetupProps) {

  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [form, setForm] = useState<SetupData>({
    name: initialData.name ?? "",
    email: initialData.email ?? "",
    context: initialData.context ?? "",
    anthropicApiKey: initialData.anthropicApiKey ?? "",
    openaiApiKey: initialData.openaiApiKey ?? "",
  });
  const [systemPrompt, setSystemPrompt] = useState(initialData.systemPrompt ?? "");
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [errors, setErrors] = useState<Partial<SetupData>>({});
  const [saved, setSaved] = useState(false);
  const [iprMessages, setIprMessages] = useState<{ role: string; content: string }[]>(
    initialData?.iprMessages ?? []
  );

  const [iprInput, setIprInput] = useState("");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("table of content");
  const [researchQuestion, setResearchQuestion] = useState("");

  // Sync incoming LLM response into local message history
  React.useEffect(() => {
    if (iprLastResponse) {
      setIprMessages(prev => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" &&
          prev[prev.length - 1].content === iprLastResponse) return prev;
        return [...prev, { role: "assistant", content: iprLastResponse }];
      });
    }
  }, [iprLastResponse]);
  function validateKeys(): boolean {
    const e: Partial<SetupData> = {};
    if (!form.anthropicApiKey.trim()) e.anthropicApiKey = "Required — get yours at console.anthropic.com";
    if (form.anthropicApiKey.trim() && !form.anthropicApiKey.startsWith("sk-ant-")) {
      e.anthropicApiKey = "Anthropic keys start with sk-ant-";
    }
    if (form.openaiApiKey.trim() && !form.openaiApiKey.startsWith("sk-")) {
      e.openaiApiKey = "OpenAI keys start with sk-";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateProfile(): boolean {
    const e: Partial<SetupData> = {};
    if (!form.name.trim()) e.name = "Required";
    if (!form.email.trim()) e.email = "Required";
    if (!form.email.includes("@")) e.email = "Enter a valid email";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSaveKeys() {
    if (!validateKeys()) return;
    onSave(form);
    flash();
  }

  function handleSaveProfile() {
    if (!validateProfile()) return;
    onSave(form);
    flash();
  }

  function handleSaveSystemPrompt() {
    onUpdateSystemPrompt?.(systemPrompt);
    flash();
  }

  function handleSaveExecutionMode() {
    onSaveExecutionMode?.(executionMode);
    flash();
  }

  function handleSaveResearchQuestion() {
    onSaveResearchQuestion?.(researchQuestion);
    flash();
  }

  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#1e1e1e",
    border: "1px solid #555",
    borderRadius: 4,
    color: "#d4d4d4",
    padding: "7px 10px",
    fontSize: "0.9em",
    boxSizing: "border-box",
    fontFamily: "monospace",
  };

  const errorStyle: React.CSSProperties = {
    color: "#e05252",
    fontSize: "0.75em",
    marginTop: 3,
  };

  const labelStyle: React.CSSProperties = {
    color: "#888",
    fontSize: "0.8em",
    marginBottom: 4,
    display: "block",
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: 16,
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "keys", label: "Keys" },
    { id: "profile", label: "Profile" },
    { id: "notebook", label: "Execution mode" },
  ];

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      alignItems: "center",
      justifyContent: "center",
      background: "#1a1a1a",
      fontFamily: "monospace",
    }}>
      <div style={{
        background: "#2d2d2d",
        border: "1px solid #444",
        borderRadius: 8,
        padding: 32,
        width: 520,
        maxWidth: "95vw",
      }}>

        {/* Header */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: "1.2em", color: "#d4d4d4" }}>
              PACT Research
            </h2>
            <p style={{ margin: "6px 0 0", color: "#888", fontSize: "0.85em" }}>
              {isFirstRun
                ? "First-time setup — your keys are stored locally and never shared."
                : "Settings — changes are saved immediately."}
            </p>
          </div>
          {!isFirstRun && onClose && (
            <span
              onClick={onClose}
              style={{ color: "#555", cursor: "pointer", fontSize: "1.2em", lineHeight: 1, marginLeft: 12 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e05252")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}
            >✕</span>
          )}
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid #444",
          marginBottom: 24,
          gap: 0,
        }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setErrors({}); }}
              style={{
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.id ? "2px solid #0e639c" : "2px solid transparent",
                color: activeTab === tab.id ? "#d4d4d4" : "#666",
                cursor: "pointer",
                padding: "6px 16px",
                fontSize: "0.85em",
                marginBottom: -1,
              }}
            >{tab.label}</button>
          ))}
        </div>

        {/* ── Keys tab ── */}
        {activeTab === "keys" && (
          <>
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Anthropic API key{" "}
                <a href="https://console.anthropic.com" style={{ color: "#0e639c", fontSize: "0.85em" }}>
                  console.anthropic.com
                </a>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inputStyle, borderColor: errors.anthropicApiKey ? "#e05252" : "#555", paddingRight: 60 }}
                  type={showAnthropicKey ? "text" : "password"}
                  value={form.anthropicApiKey}
                  onChange={e => setForm(p => ({ ...p, anthropicApiKey: e.target.value }))}
                  placeholder="sk-ant-..."
                  autoFocus
                />
                <button onClick={() => setShowAnthropicKey(p => !p)} style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "0.75em",
                }}>{showAnthropicKey ? "hide" : "show"}</button>
              </div>
              {errors.anthropicApiKey && <div style={errorStyle}>{errors.anthropicApiKey}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                OpenAI API key{" "}
                <span style={{ color: "#555" }}>(optional — needed for GPT models)</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inputStyle, borderColor: errors.openaiApiKey ? "#e05252" : "#555", paddingRight: 60 }}
                  type={showOpenAIKey ? "text" : "password"}
                  value={form.openaiApiKey}
                  onChange={e => setForm(p => ({ ...p, openaiApiKey: e.target.value }))}
                  placeholder="sk-..."
                />
                <button onClick={() => setShowOpenAIKey(p => !p)} style={{
                  position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "0.75em",
                }}>{showOpenAIKey ? "hide" : "show"}</button>
              </div>
              {errors.openaiApiKey && <div style={errorStyle}>{errors.openaiApiKey}</div>}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
              {saved && <span style={{ color: "#1D9E75", fontSize: "0.8em" }}>✓ Saved</span>}
              <button onClick={handleSaveKeys} style={{
                background: "#0e639c", border: "none", borderRadius: 4,
                color: "#fff", cursor: "pointer", padding: "7px 24px", fontSize: "0.9em",
              }}>Save</button>
            </div>
          </>
        )}

        {/* ── Profile tab ── */}
        {activeTab === "profile" && (
          <>
            <div style={fieldStyle}>
              <label style={labelStyle}>Your name</label>
              <input
                style={{ ...inputStyle, borderColor: errors.name ? "#e05252" : "#555" }}
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Barry Smith"
                autoFocus
              />
              {errors.name && <div style={errorStyle}>{errors.name}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Email address</label>
              <input
                style={{ ...inputStyle, borderColor: errors.email ? "#e05252" : "#555" }}
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="e.g. barry@example.com"
              />
              {errors.email && <div style={errorStyle}>{errors.email}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                What will you use PACT for?{" "}
                <span style={{ color: "#555" }}>(optional)</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, minHeight: 60 }}
                value={form.context}
                onChange={e => setForm(p => ({ ...p, context: e.target.value }))}
                placeholder="e.g. Researching cycling performance and nutrition..."
                rows={3}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
              {saved && <span style={{ color: "#1D9E75", fontSize: "0.8em" }}>✓ Saved</span>}
              <button onClick={handleSaveProfile} style={{
                background: "#0e639c", border: "none", borderRadius: 4,
                color: "#fff", cursor: "pointer", padding: "7px 24px", fontSize: "0.9em",
              }}>Save</button>
            </div>
          </>
        )}

        {/* ── Notebook tab ── */}
        {activeTab === "notebook" && (
          <>
            {/* Execution mode selector */}
            <div style={fieldStyle}>
              <label style={labelStyle}>Execution mode</label>
              <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                {(["table of content", "interactive"] as ExecutionMode[]).map(m => (
                  <label key={m} style={{ display: "flex", alignItems: "center", gap: 6, color: "#ccc", fontSize: "0.85em", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="executionMode"
                      checked={executionMode === m}
                      onChange={() => setExecutionMode(m)}
                    />
                    {m === "table of content" ? "Table of content" : "Interactive"}
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
                {saved && <span style={{ color: "#1D9E75", fontSize: "0.8em" }}>✓ Saved</span>}
                <button onClick={handleSaveExecutionMode} style={{
                  background: "#0e639c", border: "none", borderRadius: 4,
                  color: "#fff", cursor: "pointer", padding: "7px 24px", fontSize: "0.9em",
                }}>Save</button>
              </div>
            </div>

            {/* Research question */}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Research question{" "}
                <span style={{ color: "#555" }}>(pre-populates the prompt composer)</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5, minHeight: 60 }}
                value={researchQuestion}
                onChange={e => setResearchQuestion(e.target.value)}
                placeholder="e.g. What are the cardiovascular effects of..."
                rows={3}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center", marginTop: 8 }}>
                {saved && <span style={{ color: "#1D9E75", fontSize: "0.8em" }}>✓ Saved</span>}
                <button onClick={handleSaveResearchQuestion} style={{
                  background: "#0e639c", border: "none", borderRadius: 4,
                  color: "#fff", cursor: "pointer", padding: "7px 24px", fontSize: "0.9em",
                }}>Save</button>
              </div>
            </div>

            {/* IPR Chat */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>
                Refine with AI{" "}
                <span style={{ color: "#555" }}>(describe your domain and let PACT help craft the system prompt)</span>
              </label>

              {/* Message history */}
              {iprMessages.length > 0 && (
                <div style={{
                  background: "#1a1a1a", border: "1px solid #333", borderRadius: 4,
                  padding: "8px 10px", marginBottom: 8, maxHeight: 200, overflowY: "auto",
                  fontSize: "0.82em", lineHeight: 1.6,
                }}>
                  {iprMessages.map((m, i) => {
                    const displayContent = m.content
                      .replace(/SYSTEM_PROMPT_START[\s\S]*?SYSTEM_PROMPT_END/g, "")
                      .trim();
                    if (!displayContent) return null;
                    return (
                      <div key={i} style={{ marginBottom: 8 }}>
                        <span style={{ color: m.role === "user" ? "#4ec94e" : "#888", fontWeight: "bold" }}>
                          {m.role === "user" ? "You" : "PACT"}
                        </span>
                        <span style={{ color: "#bbb", marginLeft: 8, whiteSpace: "pre-wrap" }}>{displayContent}</span>
                      </div>
                    );
                  })}

                  {iprPending && (
                    <div style={{ color: "#555", fontStyle: "italic" }}>PACT is thinking...</div>
                  )}
                  {iprError && (
                    <div style={{ color: "#e05252", fontSize: "0.85em" }}>{iprError}</div>
                  )}
                </div>
              )}

              {/* Input */}
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  style={{ ...inputStyle, resize: "none", flex: 1, minHeight: 44, lineHeight: 1.5 }}
                  value={iprInput}
                  onChange={e => setIprInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!iprInput.trim() || iprPending) return;
                      const updated = [...iprMessages, { role: "user", content: iprInput.trim() }];
                      setIprMessages(updated);
                      setIprInput("");
                      onIprSend?.(updated);
                      onIprSaveMessages?.(updated);
                    }
                  }}
                  placeholder="Describe your research domain... (Enter to send)"
                  rows={2}
                />
                <button
                  onClick={() => {
                    if (!iprInput.trim() || iprPending) return;
                    const updated = [...iprMessages, { role: "user", content: iprInput.trim() }];
                    setIprMessages(updated);
                    setIprInput("");
                    onIprSend?.(updated);
                    onIprSaveMessages?.(updated);
                  }}
                  style={{
                    background: "#0e639c", border: "none", borderRadius: 4,
                    color: "#fff", cursor: "pointer", padding: "0 14px", fontSize: "0.85em",
                    alignSelf: "stretch",
                  }}
                >→</button>
              </div>

              {/* Use this prompt button */}
              {iprMessages.some(m => m.role === "assistant" && m.content.includes("SYSTEM_PROMPT_START")) && (
                <button
                  onClick={() => {
                    const last = [...iprMessages].reverse().find(m =>
                      m.role === "assistant" && m.content.includes("SYSTEM_PROMPT_START")
                    );
                    if (last) {
                      const match = last.content.match(/SYSTEM_PROMPT_START\n?([\s\S]*?)\nSYSTEM_PROMPT_END/);
                      if (match) setSystemPrompt(match[1].trim());
                    }
                  }}
                  style={{
                    marginTop: 6, background: "#1D9E75", border: "none", borderRadius: 4,
                    color: "#fff", cursor: "pointer", padding: "4px 14px", fontSize: "0.82em",
                  }}
                >↓ Use this prompt</button>
              )}
            </div>

            {/* System prompt textarea */}
            <div style={fieldStyle}>
              <label style={labelStyle}>
                System prompt{" "}
                <span style={{ color: "#555" }}>(edit directly or use AI refinement above)</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, minHeight: 140 }}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="Describe the research domain, your role, and the analytical stance PACT should take..."
                rows={6}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
              {saved && <span style={{ color: "#1D9E75", fontSize: "0.8em" }}>✓ Saved</span>}
              <button onClick={handleSaveSystemPrompt} style={{
                background: "#0e639c", border: "none", borderRadius: 4,
                color: "#fff", cursor: "pointer", padding: "7px 24px", fontSize: "0.9em",
              }}>Save</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}