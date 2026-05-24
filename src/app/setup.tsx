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

type SetupProps = {
  onSave: (data: SetupData) => void;
};

type Step = "form" | "verify";

export default function Setup({ onSave }: SetupProps) {
  const [step, setStep] = useState<Step>("form");
  const [form, setForm] = useState<SetupData>({
    name: "",
    email: "",
    context: "",
    anthropicApiKey: "",
    openaiApiKey: "",
  });
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [errors, setErrors] = useState<Partial<SetupData>>({});

  function validate(): boolean {
    const e: Partial<SetupData> = {};
    if (!form.name.trim()) e.name = "Required";
    if (!form.email.trim()) e.email = "Required";
    if (!form.email.includes("@")) e.email = "Enter a valid email";
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

  function handleNext() {
    if (validate()) setStep("verify");
  }

  function handleBack() {
    setStep("form");
  }

  function handleConfirm() {
    onSave(form);
  }

  function mask(key: string): string {
    if (!key) return "—";
    return key.substring(0, 10) + "••••••••••••••••" + key.slice(-4);
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
        width: 480,
        maxWidth: "95vw",
      }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: "1.2em", color: "#d4d4d4" }}>
            PACT Research
          </h2>
          <p style={{ margin: "6px 0 0", color: "#888", fontSize: "0.85em" }}>
            {step === "form"
              ? "First-time setup — your keys are stored locally and never shared."
              : "Please verify your details before saving."}
          </p>
          <div style={{
            display: "flex",
            gap: 6,
            marginTop: 14,
          }}>
            {(["form", "verify"] as Step[]).map((s, i) => (
              <div key={s} style={{
                height: 3,
                flex: 1,
                borderRadius: 2,
                background: step === s || (s === "form") ? "#0e639c" : "#444",
                opacity: step === "verify" && s === "form" ? 0.4 : 1,
              }} />
            ))}
          </div>
        </div>

        {/* ── Step 1: Form ── */}
        {step === "form" && (
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
                <span style={{ color: "#555" }}>(optional — helps Claude understand your context)</span>
              </label>
              <textarea
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  lineHeight: 1.5,
                  minHeight: 60,
                }}
                value={form.context}
                onChange={e => setForm(p => ({ ...p, context: e.target.value }))}
                placeholder="e.g. Researching cycling performance and nutrition..."
                rows={3}
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                Anthropic API key{" "}
                <a
                  href="https://console.anthropic.com"
                  style={{ color: "#0e639c", fontSize: "0.85em" }}
                >
                  Get one at console.anthropic.com
                </a>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  style={{
                    ...inputStyle,
                    borderColor: errors.anthropicApiKey ? "#e05252" : "#555",
                    paddingRight: 60,
                  }}
                  type={showAnthropicKey ? "text" : "password"}
                  value={form.anthropicApiKey}
                  onChange={e => setForm(p => ({ ...p, anthropicApiKey: e.target.value }))}
                  placeholder="sk-ant-..."
                />
                <button
                  onClick={() => setShowAnthropicKey(p => !p)}
                  style={{
                    position: "absolute", right: 8, top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none",
                    color: "#666", cursor: "pointer", fontSize: "0.75em",
                  }}
                >
                  {showAnthropicKey ? "hide" : "show"}
                </button>
              </div>
              {errors.anthropicApiKey && <div style={errorStyle}>{errors.anthropicApiKey}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>
                OpenAI API key{" "}
                <span style={{ color: "#555" }}>(optional — needed for GPT-4.1)</span>
              </label>
              <div style={{ position: "relative" }}>
                <input
                  style={{
                    ...inputStyle,
                    borderColor: errors.openaiApiKey ? "#e05252" : "#555",
                    paddingRight: 60,
                  }}
                  type={showOpenAIKey ? "text" : "password"}
                  value={form.openaiApiKey}
                  onChange={e => setForm(p => ({ ...p, openaiApiKey: e.target.value }))}
                  placeholder="sk-..."
                />
                <button
                  onClick={() => setShowOpenAIKey(p => !p)}
                  style={{
                    position: "absolute", right: 8, top: "50%",
                    transform: "translateY(-50%)",
                    background: "none", border: "none",
                    color: "#666", cursor: "pointer", fontSize: "0.75em",
                  }}
                >
                  {showOpenAIKey ? "hide" : "show"}
                </button>
              </div>
              {errors.openaiApiKey && <div style={errorStyle}>{errors.openaiApiKey}</div>}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleNext}
                style={{
                  background: "#0e639c", border: "none", borderRadius: 4,
                  color: "#fff", cursor: "pointer", padding: "7px 24px",
                  fontSize: "0.9em",
                }}
              >
                Review →
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Verify ── */}
        {step === "verify" && (
          <>
            <div style={{
              background: "#1e1e1e",
              border: "1px solid #444",
              borderRadius: 6,
              padding: 16,
              marginBottom: 20,
            }}>
              {[
                { label: "Name", value: form.name },
                { label: "Email", value: form.email },
                { label: "Context", value: form.context || "—" },
                { label: "Anthropic key", value: mask(form.anthropicApiKey) },
                { label: "OpenAI key", value: form.openaiApiKey ? mask(form.openaiApiKey) : "Not provided" },
              ].map(row => (
                <div key={row.label} style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr",
                  gap: 8,
                  marginBottom: 10,
                  fontSize: "0.85em",
                }}>
                  <span style={{ color: "#666" }}>{row.label}</span>
                  <span style={{ color: "#d4d4d4", wordBreak: "break-all" }}>{row.value}</span>
                </div>
              ))}
            </div>

            <p style={{ color: "#666", fontSize: "0.8em", marginBottom: 20, lineHeight: 1.6 }}>
              Your keys will be saved to <code style={{ color: "#888" }}>config.json</code> on
              your local machine only. They are never transmitted to PACTResearch.net or any
              third party. API calls go directly from your machine to Anthropic and OpenAI.
            </p>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={handleBack}
                style={{
                  background: "none", border: "1px solid #555", borderRadius: 4,
                  color: "#888", cursor: "pointer", padding: "7px 16px", fontSize: "0.9em",
                }}
              >
                ← Edit
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  background: "#1D9E75", border: "none", borderRadius: 4,
                  color: "#fff", cursor: "pointer", padding: "7px 24px", fontSize: "0.9em",
                }}
              >
                Save &amp; Start PACT
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
