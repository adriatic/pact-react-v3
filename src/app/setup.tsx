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

export type ExecutionMode = "index" | "interactive";

type SetupProps = {
  onUpdateSystemPrompt?: (systemPrompt: string) => void;
  onClose?: () => void;
  initialData?: { systemPrompt?: string; iprMessages?: { role: string; content: string }[] };
  onIprSend?: (messages: { role: string; content: string }[]) => void;
  onIprSaveMessages?: (messages: { role: string; content: string }[]) => void;
  iprPending?: boolean;
  iprLastResponse?: string;
  iprError?: string;
};

export default function Setup({
  onUpdateSystemPrompt,
  onClose,
  initialData = {},
  onIprSend,
  onIprSaveMessages,
  iprPending = false,
  iprLastResponse,
  iprError,
}: SetupProps) {

  const [systemPrompt, setSystemPrompt] = useState(initialData.systemPrompt ?? "");
  const [saved, setSaved] = useState(false);
  const [iprMessages, setIprMessages] = useState<{ role: string; content: string }[]>(
    initialData?.iprMessages ?? []
  );

  const [iprInput, setIprInput] = useState("");

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

  function handleSaveSystemPrompt() {
    onUpdateSystemPrompt?.(systemPrompt);
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

  const labelStyle: React.CSSProperties = {
    color: "#888",
    fontSize: "0.8em",
    marginBottom: 4,
    display: "block",
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: 16,
  };

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
              System Prompt
            </h2>
            <p style={{ margin: "6px 0 0", color: "#888", fontSize: "0.85em" }}>
              Notebook settings — changes are saved immediately.
            </p>
          </div>
          {onClose && (
            <span
              onClick={onClose}
              style={{ color: "#555", cursor: "pointer", fontSize: "1.2em", lineHeight: 1, marginLeft: 12 }}
              onMouseEnter={e => (e.currentTarget.style.color = "#e05252")}
              onMouseLeave={e => (e.currentTarget.style.color = "#555")}
            >✕</span>
          )}
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

      </div>
    </div>
  );
}
