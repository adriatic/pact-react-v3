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

type Tab = "keys" | "profile" | "notebook";

type SetupProps = {
  onSave: (data: SetupData) => void;
  onUpdateSystemPrompt?: (systemPrompt: string) => void;
  onClose?: () => void;
  initialData?: Partial<SetupData & { systemPrompt: string }>;
  defaultTab?: Tab;
  isFirstRun?: boolean;
};

export default function Setup({
  onSave,
  onUpdateSystemPrompt,
  onClose,
  initialData = {},
  defaultTab = "keys",
  isFirstRun = false,
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
    { id: "notebook", label: "Notebook" },
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
            <div style={fieldStyle}>
              <label style={labelStyle}>
                System prompt{" "}
                <span style={{ color: "#555" }}>(anchors all discussions in the active notebook)</span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, minHeight: 180 }}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="Describe the research domain, your role, and the analytical stance PACT should take..."
                rows={8}
                autoFocus
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