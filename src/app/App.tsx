// Copyright © 2026 PACTResearch.net. All rights reserved.
// pactresearch.net
import React, { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import type { SerializedContentBlock } from "../types/contentBlock";
import Explorer from "./Explorer";
import { useExplorer } from "./useExplorer";
import { corePrompts } from "../prompts/core";
import Setup, { type SetupData, type ExecutionMode } from "./setup";

type LLMModel = "gpt" | "claude";
type Tier = "economy" | "standard";

const MODEL_TIERS: Record<Tier, Record<LLMModel, string>> = {
  economy: { gpt: "gpt-4.1-mini", claude: "claude-haiku-4-5-20251001" },
  standard: { gpt: "gpt-4.1", claude: "claude-sonnet-4-6" },
};

type CellEvent =
  | { type: "cellStarted"; cellId: string; parentId?: string; label?: string; cellType?: string; promptText?: string; model?: string }
  | { type: "cellStream"; cellId: string; chunk: string }
  | { type: "cellCompleted"; cellId: string; elapsedMs: number }
  | { type: "discussionCellsLoaded"; cells: Cell[] }
  | { type: "discussionDeleted"; discussionId: string }
  | { type: "responsesCleared" }
  | { type: "draftLoaded"; discussionId: string; promptText: string | null }
  | { type: "cellError"; cellId: string; error: string }
  | { type: "showSetup" }
  | { type: "setupComplete" }
  | { type: "configLoaded"; name: string; email: string; context: string; anthropicApiKey: string; openaiApiKey: string; systemPrompt: string }
  | { type: "systemPromptUpdated"; notebookId: string }
  | { type: "iprMessagesLoaded"; notebookId: string; messages: { role: string; content: string }[] }
  | { type: "iprResponse"; content: string }
  | { type: "iprError"; error: string }
  | { type: "xmTocReady"; toc: string[]; completedSections: number[]; activeCellId: string; discussionId: string }
  | { type: "xmStateRestored"; toc: string[]; completedSections: number[]; activeCellId: string; discussionId: string };

type Cell = {
  id: string;
  parentId?: string;
  label?: string;
  promptText?: string;
  response: string;
  status?: string;
  elapsedMs?: number;
  error?: string;
  timestamp?: number;
  model?: string;
};

type TreeNode = Cell & {
  children: TreeNode[];
};

type XMState = {
  toc: string[];
  completedSections: number[];
  activeCellId: string | null;
  discussionId: string | null;
};

declare const acquireVsCodeApi: any;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/\b\w+\b/g) || []);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 0);
}

function computeWordDiff(textA: string, textB: string): { htmlA: string; htmlB: string } {
  const THRESHOLD = 0.4;
  const sentencesA = splitSentences(textA);
  const sentencesB = splitSentences(textB);
  const tokensA = sentencesA.map(tokenize);
  const tokensB = sentencesB.map(tokenize);
  const matchedB = new Set<number>();
  const aResults: { text: string; matched: boolean }[] = sentencesA.map((s, i) => {
    let bestSim = 0; let bestJ = -1;
    for (let j = 0; j < sentencesB.length; j++) {
      const sim = jaccard(tokensA[i], tokensB[j]);
      if (sim > bestSim) { bestSim = sim; bestJ = j; }
    }
    if (bestSim >= THRESHOLD) { matchedB.add(bestJ); return { text: s, matched: true }; }
    return { text: s, matched: false };
  });
  const bResults: { text: string; matched: boolean }[] = sentencesB.map((s, j) => ({ text: s, matched: matchedB.has(j) }));
  const escape = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const htmlA = aResults.map(r => r.matched ? escape(r.text) : `<span class="diff-del">${escape(r.text)}</span>`).join(" ");
  const htmlB = bResults.map(r => r.matched ? escape(r.text) : `<span class="diff-ins">${escape(r.text)}</span>`).join(" ");
  return { htmlA, htmlB };
}

function serializeComposer(el: HTMLDivElement): SerializedContentBlock[] {
  const blocks: SerializedContentBlock[] = [];
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text) { const last = blocks[blocks.length - 1]; if (last && last.type === "text") { last.text += text; } else { blocks.push({ type: "text", text }); } }
    } else if ((node as HTMLElement).tagName === "IMG") {
      const img = node as HTMLImageElement;
      const src = img.getAttribute("src") || "";
      const mimeType = img.getAttribute("data-mime") || "image/png";
      const base64 = src.split(",")[1] || "";
      if (base64) blocks.push({ type: "image", base64, mimeType });
    } else if ((node as HTMLElement).tagName === "BR") {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "text") { last.text += "\n"; } else { blocks.push({ type: "text", text: "\n" }); }
    } else { for (const child of Array.from(node.childNodes)) walk(child); }
  }
  walk(el);
  return blocks.filter(b => !(b.type === "text" && !b.text.trim()));
}

function insertImageAtCursor(base64: string, mimeType: string) {
  const img = document.createElement("img");
  img.src = `data:${mimeType};base64,${base64}`;
  img.setAttribute("data-mime", mimeType);
  img.style.cssText = "max-height:120px;max-width:100%;display:block;margin:4px auto;border-radius:4px;border:1px solid #666;";
  img.contentEditable = "false";
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents(); range.insertNode(img);
    range.setStartAfter(img); range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
  }
}

function encodeFile(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_TYPES.includes(file.type)) { reject(new Error(`Unsupported image type: ${file.type}`)); return; }
    const reader = new FileReader();
    reader.onload = () => { const dataUrl = reader.result as string; resolve({ base64: dataUrl.split(",")[1], mimeType: file.type }); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildShareableMarkdown(node: Cell, discussionName: string): string {
  const model = node.label ?? "Claude";
  const date = node.timestamp
    ? new Date(node.timestamp).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const prompt = (node.promptText?.trim() ?? "");
  const hasRef = prompt.includes("[Referenced Cell]");
  const promptSection = (!hasRef && prompt) ? `**Prompt:** ${prompt}\n\n---\n\n` : "";
  return `# ${discussionName}\n\n*Generated by PACT Research · ${model} · ${date}*\n\n---\n\n${promptSection}${node.response}`;
}

function cleanResponse(response: string): string {
  return response.replace(/===TOC_END===/g, "").trimEnd();
}

function XMNavigationWarning({ notebookName, onDismiss }: { notebookName: string; onDismiss: () => void }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300,
    }}>
      <div style={{
        background: "#2d2d2d", border: "1px solid #e05252", borderRadius: 6,
        padding: 24, maxWidth: 380, width: "90%",
      }}>
        <div style={{ color: "#e05252", fontWeight: "bold", marginBottom: 10, fontSize: "0.95em" }}>
          XM Session In Progress
        </div>
        <div style={{ color: "#c8c8c8", lineHeight: 1.6, marginBottom: 20, fontSize: "0.88em" }}>
          An XM research session is active on <strong>{notebookName}</strong>. Use <strong>Stop</strong> to pause and navigate away, or <strong>Abort</strong> to end the session before switching.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onDismiss}
            autoFocus
            style={{
              background: "#0e639c", border: "none", borderRadius: 4,
              color: "#fff", cursor: "pointer", padding: "6px 24px", fontSize: "0.9em",
            }}
          >OK</button>
        </div>
      </div>
    </div>
  );
}

function XMPopup({
  xmState,
  onContinue,
  onStop,
  onAbort,
  onClose,
}: {
  xmState: XMState;
  onContinue: (selectedSections: number[]) => void;
  onStop: () => void;
  onAbort: () => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listRef.current || xmState.completedSections.length === 0) return;
    const lastCompleted = Math.max(...xmState.completedSections);
    const rowHeight = 32;
    const listHeight = listRef.current.clientHeight;
    const targetScrollTop = (lastCompleted - 1) * rowHeight - listHeight + rowHeight * 1.5;
    listRef.current.scrollTop = Math.max(0, targetScrollTop);
  }, []);

  function toggleSection(idx: number) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function handleContinue() {
    if (checked.size > 0) {
      onContinue([...checked].sort((a, b) => a - b));
    } else {
      const remaining = xmState.toc
        .map((_, i) => i + 1)
        .filter(i => !xmState.completedSections.includes(i));
      onContinue(remaining);
    }
  }

  const completedCount = xmState.completedSections.length;
  const totalCount = xmState.toc.length;
  const selectedCount = checked.size;
  const allDone = completedCount === totalCount;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#2d2d2d", border: "1px solid #555", borderRadius: 6,
          width: "90%", maxWidth: 520, display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          padding: "14px 18px 10px", borderBottom: "1px solid #444",
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
        }}>
          <span style={{ color: "#d4d4d4", fontSize: "0.9em", fontWeight: 500, letterSpacing: "0.05em" }}>XM</span>
          <span style={{ color: "#555", fontSize: "0.75em" }}>
            {selectedCount > 0
              ? `${selectedCount} section${selectedCount > 1 ? "s" : ""} selected`
              : allDone ? "all sections complete"
                : "select sections, or continue all"}
          </span>
        </div>

        <div ref={listRef} style={{ padding: "10px 0", maxHeight: 320, overflowY: "auto" }}>
          {xmState.toc.map((title, i) => {
            const idx = i + 1;
            const done = xmState.completedSections.includes(idx);
            const isChecked = done || checked.has(idx);
            return (
              <div
                key={idx}
                onClick={done ? undefined : () => toggleSection(idx)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "5px 18px",
                  cursor: done ? "default" : "pointer",
                  opacity: done ? 0.35 : 1,
                }}
                onMouseEnter={e => { if (!done) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={done}
                  onChange={done ? undefined : () => toggleSection(idx)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 14, height: 14, marginTop: 2, flexShrink: 0, accentColor: "#0e639c", cursor: done ? "default" : "pointer" }}
                />
                <span style={{
                  color: done ? "#888" : "#c8c8c8",
                  fontSize: "0.82em", lineHeight: 1.5,
                  textDecoration: done ? "line-through" : "none",
                  textDecorationColor: "#555",
                  userSelect: "none",
                }}>
                  {title}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{
          padding: "12px 18px", borderTop: "1px solid #444",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: "#555", fontSize: "0.75em" }}>
            {completedCount > 0
              ? `${completedCount} of ${totalCount} completed`
              : `${totalCount} sections · none completed`}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onAbort}
              title="Finish here — mark cell done, clear XM state"
              style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "4px 14px", fontSize: "0.85em" }}
            >Abort</button>
            <button
              onClick={onStop}
              title="Close dialog — resume later by clicking XM"
              style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "4px 14px", fontSize: "0.85em" }}
            >Stop</button>
            <button
              onClick={handleContinue}
              disabled={allDone}
              title={allDone ? "All sections complete" : "Run selected or all remaining sections"}
              style={{
                background: allDone ? "#1a3a52" : "#0e639c", border: "none", borderRadius: 4,
                color: allDone ? "#555" : "#fff",
                cursor: allDone ? "default" : "pointer",
                padding: "4px 16px", fontSize: "0.85em",
              }}
            >{allDone ? "Complete" : "Continue"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const vscode = acquireVsCodeApi();

  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [rawCells, setRawCells] = useState<Record<string, boolean>>({});
  const [copiedCells, setCopiedCells] = useState<Record<string, boolean>>({});
  const [model, setModel] = useState<LLMModel>("claude");
  const [tier, setTier] = useState<Tier>("standard");
  const [modelOpen, setModelOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showClearResponsesConfirm, setShowClearResponsesConfirm] = useState(false);
  const [showNewNotebookDialog, setShowNewNotebookDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [newNotebookSystemPrompt, setNewNotebookSystemPrompt] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const [showXMNavWarning, setShowXMNavWarning] = useState(false);

  const [diffMode, setDiffMode] = useState(false);
  const [diffCellA, setDiffCellA] = useState<string | null>(null);
  const [diffCellB, setDiffCellB] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const [runSeconds, setRunSeconds] = useState(0);
  const [finalSeconds, setFinalSeconds] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runSecondsRef = useRef(0);
  const xmElapsedMsRef = useRef(0);

  const [showXM, setShowXM] = useState(false);
  const [xmState, setXmState] = useState<XMState>({
    toc: [],
    completedSections: [],
    activeCellId: null,
    discussionId: null,
  });

  const explorer = useExplorer(vscode);
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [collapsed, setCollapsed] = useState(false);
  const isDraggingDivider = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newNotebookInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cellScrollRef = useRef<HTMLDivElement>(null);

  const hasActiveDiscussion = !!explorer.activeDiscussionId;
  const isActiveTutorial = explorer.activeDiscussionId?.startsWith("discussion-tutorial-");

  // Block navigation only when XM is active AND the user is trying to leave the XM discussion
  // Navigating INTO the XM discussion (or from no discussion) is always allowed
  const xmActive = xmState.toc.length > 0 && !!explorer.activeDiscussionId && explorer.activeDiscussionId !== xmState.discussionId;
  const xmButtonActive = xmState.toc.length > 0 && !isRunning;

  const activeNotebookName = explorer.notebooks.find(n => n.id === explorer.activeNotebookId)?.name ?? "this notebook";

  useEffect(() => {
    if (cellScrollRef.current) {
      cellScrollRef.current.scrollTop = cellScrollRef.current.scrollHeight;
    }
  }, [cells]);

  useEffect(() => {
    if (isRunning) {
      setRunSeconds(0); setFinalSeconds(null);
      timerRef.current = setInterval(() => { runSecondsRef.current += 1; setRunSeconds(runSecondsRef.current); }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  // Guard: block navigation away from the XM discussion
  // Allow navigation INTO the XM discussion (resume after restart)
  function guardedSelectDiscussion(discussion: any) {
    if (xmState.toc.length > 0 && !!explorer.activeDiscussionId && discussion.id !== xmState.discussionId) { setShowXMNavWarning(true); return; }
    setCells({});
    if (composerRef.current) composerRef.current.innerHTML = "";
    explorer.selectDiscussion(discussion);
  }

  function handleXMContinue(selectedSections: number[]) {
    setShowXM(false);
    setIsRunning(true);
    vscode.postMessage({
      type: "CONTINUE_RUN",
      selectedSections,
      cellId: xmState.activeCellId,
      toc: xmState.toc,
      model,
      resolvedModel: MODEL_TIERS[tier][model],
      discussionId: explorer.activeDiscussionId,
    });
  }

  function handleXMStop() {
    setShowXM(false);
  }

  function handleXMAbort() {
    setShowXM(false);
    if (xmState.activeCellId) {
      const completed = xmState.completedSections.length;
      const total = xmState.toc.length;
      const notice = `\n\n---\n*Stopped after ${completed} of ${total} sections.*`;
      setCells(prev => ({
        ...prev,
        [xmState.activeCellId!]: {
          ...prev[xmState.activeCellId!],
          response: (prev[xmState.activeCellId!]?.response ?? "") + notice,
          status: "done",
          elapsedMs: xmElapsedMsRef.current,
        },
      }));
      setFinalSeconds(Math.round(xmElapsedMsRef.current / 1000));
    }
    setXmState({ toc: [], completedSections: [], activeCellId: null, discussionId: null });
    xmElapsedMsRef.current = 0;
    vscode.postMessage({ type: "ABORT_RUN", discussionId: explorer.activeDiscussionId });
  }

  function handleXMClose() {
    setShowXM(false);
  }

  function toggleRaw(cellId: string) { setRawCells(prev => ({ ...prev, [cellId]: !prev[cellId] })); }

  function copyCell(node: Cell) {
    const discussionName = explorer.discussions.find(d => d.id === explorer.activeDiscussionId)?.name ?? "PACT Research";
    const md = buildShareableMarkdown(node, discussionName);
    navigator.clipboard.writeText(md);
    setCopiedCells(prev => ({ ...prev, [node.id]: true }));
    setTimeout(() => setCopiedCells(prev => ({ ...prev, [node.id]: false })), 2000);
  }

  function clearView() { setCells({}); if (composerRef.current) composerRef.current.innerHTML = ""; }

  function clearResponses() {
    vscode.postMessage({ type: "CLEAR_RESPONSES", discussionId: explorer.activeDiscussionId });
    setShowClearResponsesConfirm(false);
  }

  function submitNewNotebook() {
    const name = newNotebookName.trim();
    if (name) { const systemPrompt = newNotebookSystemPrompt.trim() || null; vscode.postMessage({ type: "CREATE_NOTEBOOK", name, systemPrompt }); }
    setNewNotebookName(""); setNewNotebookSystemPrompt(""); setShowNewNotebookDialog(false);
  }

  function closeDiff() { setShowDiff(false); setDiffMode(false); setDiffCellA(null); setDiffCellB(null); }

  function populateComposer(text: string) {
    const el = composerRef.current; if (!el) return;
    el.innerText = text; el.focus();
    const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
  }

  function handleComposerInput() {
    if (!explorer.activeDiscussionId) return;
    const el = composerRef.current; if (!el) return;
    const text = el.innerText?.trim(); if (!text) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      vscode.postMessage({ type: "SAVE_DRAFT", discussionId: explorer.activeDiscussionId, promptText: text });
    }, 1000);
  }

  function send() {
    if (!hasActiveDiscussion) return;
    const el = composerRef.current; if (!el) return;
    let blocks = serializeComposer(el);
    if (blocks.length === 0) { const text = el.innerText?.trim(); if (text) blocks = [{ type: "text", text }]; }
    if (blocks.length === 0) return;
    if (explorer.activeDiscussionId) vscode.postMessage({ type: "DELETE_DRAFT", discussionId: explorer.activeDiscussionId });
    xmElapsedMsRef.current = 0;
    runSecondsRef.current = 0;
    vscode.postMessage({ type: "RUN_REQUESTED", blocks, model, resolvedModel: MODEL_TIERS[tier][model], discussionId: explorer.activeDiscussionId });
    el.focus();
  }

  function retry(cellId: string) {
    const cell = cells[cellId];
    if (cell?.promptText && composerRef.current) populateComposer(cell.promptText);
    vscode.postMessage({ type: "RETRY_CELL", cellId, model });
  }

  function startDiff(cellId: string) { setDiffCellA(cellId); setDiffMode(true); }
  function selectDiffB(cellId: string) { setDiffCellB(cellId); setDiffMode(false); setShowDiff(true); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); send(); }
  }

  useEffect(() => {
    const el = composerRef.current; if (!el) return;
    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items; if (!items) return;
      for (const item of Array.from(items)) {
        if (ACCEPTED_TYPES.includes(item.type)) {
          e.preventDefault(); const file = item.getAsFile(); if (!file) continue;
          try { const { base64, mimeType } = await encodeFile(file); insertImageAtCursor(base64, mimeType); } catch (err: any) { console.error("Paste error:", err.message); }
          return;
        }
      }
    }
    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, []);

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function handleDragLeave() { setIsDragging(false); }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0]; if (!file) return;
    try { const { base64, mimeType } = await encodeFile(file); composerRef.current?.focus(); insertImageAtCursor(base64, mimeType); }
    catch (err: any) { console.error("Drop error:", err.message); }
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const { base64, mimeType } = await encodeFile(file); composerRef.current?.focus(); insertImageAtCursor(base64, mimeType); }
    catch (err: any) { console.error("File input error:", err.message); }
    e.target.value = "";
  }

  useEffect(() => { vscode.postMessage({ type: "CHECK_CONFIG" }); vscode.postMessage({ type: "EXPLORER_LOAD" }); }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      console.log("PACT message received:", event.data?.type, event.data);
      const data: CellEvent = event.data;
      switch (data.type) {
        case "cellStarted":
          setIsRunning(true);
          setCells(prev => {
            if (prev[data.cellId]) {
              return { ...prev, [data.cellId]: { ...prev[data.cellId], status: "running" } };
            }
            return { ...prev, [data.cellId]: { id: data.cellId, parentId: data.parentId, label: data.label, promptText: data.promptText, response: "", status: "running", timestamp: Date.now(), model: data.model } };
          });
          break;
        case "cellStream":
          setCells(prev => ({
            ...prev,
            [data.cellId]: {
              ...prev[data.cellId],
              response: (prev[data.cellId]?.response || "") + data.chunk,
              status: "running",
            },
          }));
          break;
        case "cellCompleted":
          setIsRunning(false);
          xmElapsedMsRef.current += data.elapsedMs;
          setCells(prev => ({
            ...prev,
            [data.cellId]: {
              ...prev[data.cellId],
              status: "done",
              elapsedMs: xmElapsedMsRef.current,
            },
          }));
          setFinalSeconds(Math.round(xmElapsedMsRef.current / 1000));
          break;
        case "discussionCellsLoaded":
          setCells(Object.fromEntries(data.cells.map((c: Cell) => [c.id, c])));
          if (data.cells.length > 0) { const firstRoot = data.cells.find((c: Cell) => !c.parentId); if (firstRoot?.promptText && composerRef.current) populateComposer(firstRoot.promptText); }
          break;
        case "discussionDeleted": setCells({}); if (composerRef.current) composerRef.current.innerHTML = ""; break;
        case "responsesCleared": setCells({}); break;
        case "draftLoaded": if (data.promptText) populateComposer(data.promptText); break;
        case "cellError":
          setIsRunning(false);
          setCells(prev => ({ ...prev, [data.cellId]: { ...prev[data.cellId], status: "error", error: data.error } }));
          break;
        case "showSetup": setShowSetup(true); break;
        case "setupComplete": setShowSetup(false); break;
        case "configLoaded": setSettingsData(data); setShowSettings(true); break;
        case "systemPromptUpdated": setShowSettings(false); break;
        case "iprMessagesLoaded": setSettingsData((prev: any) => ({ ...prev, iprMessages: data.messages })); break;
        case "iprResponse":
          setSettingsData((prev: any) => {
            const updated = [...(prev.iprMessages ?? []), { role: "assistant", content: data.content }];
            vscode.postMessage({ type: "SAVE_IPR_MESSAGES", notebookId: explorer.activeNotebookId, messages: updated });
            return { ...prev, iprPending: false, iprLastResponse: data.content, iprMessages: updated };
          });
          break;
        case "iprError": setSettingsData((prev: any) => ({ ...prev, iprPending: false, iprError: data.error })); break;

        case "xmTocReady":
          setIsRunning(false);
          setXmState({
            toc: data.toc,
            completedSections: data.completedSections ?? [],
            activeCellId: data.activeCellId,
            discussionId: data.discussionId ?? null,
          });
          setShowXM(true);
          if (data.activeCellId) {
            setCells(prev => ({
              ...prev,
              [data.activeCellId]: { ...prev[data.activeCellId], status: "paused" },
            }));
          }
          break;

        case "xmStateRestored":
          // Silent restore on startup — activates XM button but does not open dialog
          setXmState({
            toc: data.toc,
            completedSections: data.completedSections ?? [],
            activeCellId: data.activeCellId,
            discussionId: data.discussionId ?? null,
          });
          // Reload cell content immediately so continuation appends correctly
          // without requiring the user to manually navigate to the discussion first
          if (data.discussionId) {
            vscode.postMessage({ type: "LOAD_DISCUSSION_CELLS", discussionId: data.discussionId });
          }
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!explorer.activeDiscussionId?.startsWith("discussion-tutorial-")) {
      setCells({}); if (composerRef.current) composerRef.current.innerHTML = "";
      xmElapsedMsRef.current = 0;
      if (explorer.activeDiscussionId) vscode.postMessage({ type: "GET_DRAFT", discussionId: explorer.activeDiscussionId });
    }
  }, [explorer.activeDiscussionId]);

  useEffect(() => { if (showNewNotebookDialog) { setTimeout(() => newNotebookInputRef.current?.focus(), 50); } }, [showNewNotebookDialog]);

  function onDividerMouseDown(e: React.MouseEvent) {
    isDraggingDivider.current = true; dragStartX.current = e.clientX; dragStartWidth.current = explorerWidth; e.preventDefault();
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingDivider.current) return;
      const delta = e.clientX - dragStartX.current;
      const newWidth = Math.max(140, Math.min(400, dragStartWidth.current + delta));
      setExplorerWidth(newWidth); setCollapsed(false);
    }
    function onMouseUp() { isDraggingDivider.current = false; }
    window.addEventListener("mousemove", onMouseMove); window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  function buildTree(): TreeNode[] {
    const map: Record<string, TreeNode> = {}; const roots: TreeNode[] = [];
    Object.values(cells).forEach(cell => { map[cell.id] = { ...cell, children: [] }; });
    Object.values(map).forEach(node => { if (node.parentId && map[node.parentId]) map[node.parentId].children.push(node); else roots.push(node); });
    return roots;
  }

  function renderNode(node: TreeNode, depth = 0) {
    if (!node.response?.trim() && node.status === "done") return null;
    const isRaw = rawCells[node.id] ?? false;
    const isCopied = copiedCells[node.id] ?? false;
    const cleaned = cleanResponse(node.response || "");
    const html = marked(cleaned) as string;
    const isDiffA = diffCellA === node.id;
    const isSelectable = diffMode && node.id !== diffCellA && node.status === "done";
    const isTutorial = explorer.activeDiscussionId?.startsWith("discussion-tutorial-");
    const isPaused = node.status === "paused";
    return (
      <div key={node.id} style={{ marginLeft: depth * 20 }}>
        <div style={{ border: isDiffA ? "1px solid #0e639c" : "1px solid #888", padding: 10, marginBottom: 10, background: isDiffA ? "#0e639c11" : "transparent" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <strong>{node.label || "GPT"}</strong>
            <div style={{ display: "flex", gap: 6 }}>
              {node.status === "done" && (
                <>
                  <button onClick={() => copyCell(node)} title="Copy as shareable markdown" style={{ fontSize: "0.75em", padding: "2px 8px", background: isCopied ? "#1D9E75" : undefined, color: isCopied ? "#fff" : undefined, border: isCopied ? "1px solid #1D9E75" : undefined, borderRadius: 3, transition: "background 0.2s, color 0.2s" }}>{isCopied ? "Copied ✓" : "Copy"}</button>
                  <button onClick={() => navigator.clipboard.writeText(`[Cell ${node.id}]`)} title="Copy cell reference" style={{ fontSize: "0.75em", padding: "2px 8px" }}>Copy Ref</button>
                </>
              )}
              <button onClick={() => toggleRaw(node.id)} style={{ fontSize: "0.75em", padding: "2px 8px" }}>{isRaw ? "Formatted" : "Raw"}</button>
            </div>
          </div>
          {isRaw ? (
            <div style={{ fontFamily: "monospace", fontSize: "0.85em", lineHeight: 2 }}>
              <div><span style={{ color: "#888" }}>Cell ID</span>{"  "}{node.id}</div>
              <div><span style={{ color: "#888" }}>Model{"   "}</span>{node.label ?? "—"}</div>
              <div><span style={{ color: "#888" }}>Time{"    "}</span>{node.timestamp ? new Date(node.timestamp).toLocaleTimeString() : "—"}</div>
              <div><span style={{ color: "#888" }}>Latency{"  "}</span>{node.elapsedMs !== undefined ? `${(node.elapsedMs / 1000).toFixed(1)}s` : "—"}</div>
              <div style={{ marginTop: 8 }}><button onClick={() => navigator.clipboard.writeText(`[Cell ${node.id}]`)} style={{ fontSize: "0.85em", padding: "2px 10px" }}>Copy Ref</button></div>
            </div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: 1.6 }} />
          )}
          {!isRaw && (
            <div style={{ marginTop: 6, fontSize: "0.85em", color: "#888", display: "flex", gap: 16 }}>
              <span>Status: {isPaused ? "awaiting XM" : node.status}</span>
              {node.elapsedMs !== undefined && <span>⏱ {(node.elapsedMs / 1000).toFixed(1)}s</span>}
              {node.status === "error" && node.error && <span style={{ color: "#e05252" }}>{node.error}</span>}
            </div>
          )}
          {node.status === "done" && !diffMode && !isRaw && !isTutorial && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button onClick={() => retry(node.id)}>Retry</button>
              <button onClick={() => startDiff(node.id)}>Diff</button>
            </div>
          )}
          {isDiffA && <div style={{ marginTop: 6, fontSize: "0.8em", color: "#0e639c" }}>Select another cell to compare →</div>}
          {isSelectable && <button onClick={() => selectDiffB(node.id)} style={{ marginTop: 6, background: "#0e639c", border: "none", borderRadius: 3, color: "#fff", cursor: "pointer", padding: "3px 10px", fontSize: "0.8em" }}>Compare</button>}
        </div>
        {node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  }

  function renderDiff() {
    const cellA = diffCellA ? cells[diffCellA] : null;
    const cellB = diffCellB ? cells[diffCellB] : null;
    if (!cellA || !cellB) return null;
    const { htmlA, htmlB } = computeWordDiff(cellA.response, cellB.response);
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #444", flexShrink: 0, background: "#1a1a1a" }}>
          <span style={{ color: "#e05252", fontSize: "0.9em", fontWeight: "bold" }}>← {cellA.label || "GPT"}</span>
          <button onClick={closeDiff} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "2px 12px", fontSize: "0.85em" }}>Close Diff</button>
          <span style={{ color: "#4ec94e", fontSize: "0.9em", fontWeight: "bold" }}>{cellB.label || "GPT"} →</span>
        </div>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, borderRight: "1px solid #444", fontFamily: "monospace", fontSize: "0.9em", lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#d4d4d4" }} dangerouslySetInnerHTML={{ __html: htmlA }} />
          <div style={{ flex: 1, overflowY: "auto", padding: 16, fontFamily: "monospace", fontSize: "0.9em", lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#d4d4d4" }} dangerouslySetInnerHTML={{ __html: htmlB }} />
        </div>
      </div>
    );
  }

  const tree = buildTree();

  if (showSettings && settingsData) {
    return (
      <Setup
        initialData={settingsData} defaultTab="keys" isFirstRun={false}
        onClose={() => setShowSettings(false)}
        onSave={(data: SetupData) => { vscode.postMessage({ type: "SAVE_CONFIG", name: data.name, email: data.email, context: data.context, anthropicApiKey: data.anthropicApiKey, openaiApiKey: data.openaiApiKey }); setShowSettings(false); }}
        onUpdateSystemPrompt={(systemPrompt: string) => { vscode.postMessage({ type: "UPDATE_SYSTEM_PROMPT", notebookId: explorer.activeNotebookId, systemPrompt }); }}
        onIprSend={(messages) => {
          setSettingsData((prev: any) => ({ ...prev, iprPending: true, iprError: undefined }));
          vscode.postMessage({ type: "IPR_REFINE", messages, model, resolvedModel: MODEL_TIERS[tier][model] });
        }}
        onIprSaveMessages={(messages) => { vscode.postMessage({ type: "SAVE_IPR_MESSAGES", notebookId: explorer.activeNotebookId, messages }); }}
        onSaveExecutionMode={(mode: ExecutionMode) => {
          vscode.postMessage({ type: "SAVE_EXECUTION_MODE", notebookId: explorer.activeNotebookId, mode });
        }}
        onSaveResearchQuestion={(question: string) => {
          vscode.postMessage({ type: "SAVE_IPR_RESEARCH_QUESTION", notebookId: explorer.activeNotebookId, question });
          // Pre-populate composer with the research question
          if (question) populateComposer(question);
        }}
        iprPending={settingsData.iprPending ?? false} iprLastResponse={settingsData.iprLastResponse} iprError={settingsData.iprError}
      />
    );
  }

  if (showSetup) {
    return (
      <Setup onSave={(data: SetupData) => {
        vscode.postMessage({ type: "SAVE_CONFIG", name: data.name, email: data.email, context: data.context, anthropicApiKey: data.anthropicApiKey, openaiApiKey: data.openaiApiKey });
      }} />
    );
  }

  const timerDisplay = isRunning
    ? `${runSeconds}s`
    : finalSeconds !== null ? `${finalSeconds}s` : "";

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "monospace", overflow: "hidden" }}>
      <style>{`
        [data-placeholder]:empty:before { content: attr(data-placeholder); color: #555; pointer-events: none; }
        span.diff-del { background: #5c1a1a; color: #ff9999; border-radius: 2px; }
        span.diff-ins { background: #1a3a1a; color: #99ff99; border-radius: 2px; }
        .composer-disabled { min-height: 60px; max-height: 200px; padding: 10px 12px; color: #555; font-style: italic; font-size: 0.9em; display: flex; align-items: center; user-select: none; cursor: default; }
        .composer-disabled:focus { outline: none; }
        .composer-toggle { background: none; border: 1px solid #444; border-radius: 3px; color: #888; cursor: pointer; font-size: 1em; padding: 1px 6px; line-height: 1; transition: color 0.15s, border-color 0.15s; }
        .composer-toggle:hover { color: #c8c8c8; border-color: #888; }
      `}</style>

      {showXMNavWarning && (
        <XMNavigationWarning
          notebookName={activeNotebookName}
          onDismiss={() => setShowXMNavWarning(false)}
        />
      )}

      {showXM && xmState.toc.length > 0 && (
        <XMPopup
          xmState={xmState}
          onContinue={handleXMContinue}
          onStop={handleXMStop}
          onAbort={handleXMAbort}
          onClose={handleXMClose}
        />
      )}

      {showClearResponsesConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#2d2d2d", border: "1px solid #555", borderRadius: 6, padding: 24, maxWidth: 360, width: "90%" }}>
            <div style={{ marginBottom: 16, lineHeight: 1.6, color: "#d4d4d4" }}>This will permanently delete all responses in this discussion. The prompt will be kept. This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowClearResponsesConfirm(false)} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em" }}>Cancel</button>
              <button onClick={clearResponses} style={{ background: "#c0392b", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em" }}>Clear Responses</button>
            </div>
          </div>
        </div>
      )}

      {showNewNotebookDialog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#2d2d2d", border: "1px solid #555", borderRadius: 6, padding: 24, maxWidth: 480, width: "90%" }}>
            <div style={{ marginBottom: 12, color: "#d4d4d4", fontSize: "0.95em", fontWeight: "bold" }}>New Notebook</div>
            <div style={{ marginBottom: 6, color: "#888", fontSize: "0.8em" }}>Name</div>
            <input ref={newNotebookInputRef} value={newNotebookName} onChange={e => setNewNotebookName(e.target.value)}
              onKeyDown={e => { if (e.key === "Escape") { setShowNewNotebookDialog(false); setNewNotebookName(""); setNewNotebookSystemPrompt(""); } }}
              placeholder="Notebook name..."
              style={{ width: "100%", background: "#1e1e1e", border: "1px solid #555", borderRadius: 4, color: "#d4d4d4", padding: "6px 10px", fontSize: "0.9em", marginBottom: 14, boxSizing: "border-box" }} />
            <div style={{ marginBottom: 6, color: "#888", fontSize: "0.8em" }}>System Prompt <span style={{ color: "#555" }}>(optional)</span></div>
            <textarea value={newNotebookSystemPrompt} onChange={e => setNewNotebookSystemPrompt(e.target.value)}
              placeholder="e.g. You are a clinical pharmacist specializing in drug interactions..." rows={5}
              style={{ width: "100%", background: "#1e1e1e", border: "1px solid #555", borderRadius: 4, color: "#d4d4d4", padding: "6px 10px", fontSize: "0.9em", marginBottom: 16, boxSizing: "border-box", resize: "vertical", fontFamily: "monospace", lineHeight: 1.5 }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowNewNotebookDialog(false); setNewNotebookName(""); setNewNotebookSystemPrompt(""); }} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em" }}>Cancel</button>
              <button onClick={submitNewNotebook} style={{ background: "#0e639c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em" }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {tierOpen && (
        <div onClick={() => setTierOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#2d2d2d", border: "1px solid #555", borderRadius: 6, padding: 24, maxWidth: 420, width: "90%" }}>
            <div style={{ marginBottom: 16, color: "#d4d4d4", fontSize: "0.95em", fontWeight: "bold" }}>Select Model Tier</div>
            {(["standard", "economy"] as Tier[]).map(t => (
              <div key={t} onClick={() => { setTier(t); setTierOpen(false); }}
                style={{ border: tier === t ? "1px solid #0e639c" : "1px solid #555", borderRadius: 5, padding: "12px 16px", marginBottom: 10, cursor: "pointer", background: tier === t ? "#0e639c18" : "transparent" }}>
                <div style={{ color: "#d4d4d4", fontWeight: "bold", marginBottom: 4 }}>{t === "standard" ? "Standard" : "Economy"}</div>
                <div style={{ color: "#888", fontSize: "0.85em" }}>GPT — {MODEL_TIERS[t].gpt} &nbsp;·&nbsp; Claude — {MODEL_TIERS[t].claude}</div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button onClick={() => setTierOpen(false)} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {!collapsed && (
        <div style={{ width: explorerWidth, flexShrink: 0, overflow: "hidden" }}>
          <Explorer
            notebooks={explorer.notebooks} discussions={explorer.discussions} activeDiscussionId={explorer.activeDiscussionId}
            onSelectDiscussion={guardedSelectDiscussion}
            onCreateNotebook={explorer.createNotebook} onCreateDiscussion={explorer.createDiscussion}
            onSelectPrompt={(text) => { setCells({}); populateComposer(text); }}
            corePrompts={corePrompts} onDeleteDiscussion={explorer.deleteDiscussion} onDeleteNotebook={explorer.deleteNotebook}
            onExportNotebook={explorer.exportNotebook} onImportNotebook={explorer.importNotebook} onExportObsidian={explorer.exportObsidian}
          />
        </div>
      )}

      <div onMouseDown={onDividerMouseDown} onDoubleClick={() => setCollapsed(p => !p)} title="Drag to resize, double-click to collapse"
        style={{ width: 4, cursor: "col-resize", background: "#333", flexShrink: 0, transition: "background 0.2s" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#0e639c")}
        onMouseLeave={e => (e.currentTarget.style.background = "#333")} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "8px 16px", borderBottom: "1px solid #333", flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: "1.1em" }}>PACT</h2>
          <button onClick={clearView} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em" }}>Clear</button>
          {explorer.activeDiscussionId && (
            <button onClick={() => setShowClearResponsesConfirm(true)} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em" }}>Clear Responses</button>
          )}
          <button onClick={() => setShowNewNotebookDialog(true)} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em" }}>+ Notebook</button>
          <button onClick={explorer.importNotebook} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em" }}>Import</button>
          {diffMode && (
            <button onClick={() => { setDiffMode(false); setDiffCellA(null); }} style={{ background: "none", border: "1px solid #e05252", borderRadius: 4, color: "#e05252", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em" }}>Cancel Diff</button>
          )}
          <button onClick={() => { vscode.postMessage({ type: "GET_CONFIG", notebookId: explorer.activeNotebookId ?? null }); }}
            style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em" }}>Settings</button>
          <button onClick={() => !isRunning && setTierOpen(true)}
            style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: isRunning ? "#444" : "#888", cursor: isRunning ? "default" : "pointer", padding: "2px 10px", fontSize: "0.85em" }}>Model</button>

          <button
            onClick={() => xmButtonActive && setShowXM(true)}
            title={xmButtonActive ? "Open Execution Manager" : "No ToC available"}
            style={{
              background: "none",
              border: `1px solid ${xmButtonActive ? "#0e639c" : "#555"}`,
              borderRadius: 4,
              color: xmButtonActive ? "#0e639c" : "#555",
              cursor: xmButtonActive ? "pointer" : "default",
              padding: "2px 10px", fontSize: "0.85em",
            }}
          >XM</button>

          <span style={{ marginLeft: "auto", color: "#555", fontSize: "0.85em" }}>v{(window as any).PACT_VERSION ?? "0.0.3"}</span>
        </div>

        <div style={{ padding: "5px 16px", borderBottom: "1px solid #444", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: "#888", fontSize: "0.85em" }}>
            {explorer.activeDiscussionId ? (explorer.discussions.find(d => d.id === explorer.activeDiscussionId)?.name ?? "") : ""}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "monospace", fontSize: "0.85em", color: isRunning ? "#e05252" : "#4ec94e", minWidth: "4ch", textAlign: "right" }}>
              {timerDisplay}
            </span>
            <div title={isRunning ? "Running" : "Idle"} style={{ width: 10, height: 10, borderRadius: "50%", background: isRunning ? "#e05252" : "#4ec94e", boxShadow: isRunning ? "0 0 6px #e05252" : "0 0 6px #4ec94e", transition: "background 0.3s, box-shadow 0.3s" }} />
          </div>
        </div>

        {showDiff ? renderDiff() : (
          <>
            {!composerCollapsed ? (
              <div style={{ flexShrink: 0, padding: "10px 16px", borderBottom: "1px solid #444" }}>
                <div onDragOver={hasActiveDiscussion ? handleDragOver : undefined} onDragLeave={hasActiveDiscussion ? handleDragLeave : undefined} onDrop={hasActiveDiscussion ? handleDrop : undefined}
                  style={{ border: isDragging ? "2px dashed #888" : "1px solid #444", borderRadius: 6, background: hasActiveDiscussion ? "#1e1e1e" : "#161616" }}>
                  {hasActiveDiscussion ? (
                    <div ref={composerRef} contentEditable suppressContentEditableWarning onKeyDown={handleKeyDown} onInput={handleComposerInput}
                      style={{ minHeight: 60, maxHeight: 200, overflowY: "auto", padding: "10px 12px", outline: "none", whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#d4d4d4" }}
                      data-placeholder="Enter prompt — Cmd+V to paste image, Cmd+Enter to send" />
                  ) : (
                    <div className="composer-disabled">Select or create a discussion to start researching.</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderTop: "1px solid #444" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => hasActiveDiscussion && fileInputRef.current?.click()} title="Attach image"
                        style={{ background: "none", border: "none", color: hasActiveDiscussion ? "#888" : "#444", cursor: hasActiveDiscussion ? "pointer" : "default", fontSize: "1.1em" }}>+</button>
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={handleFileInput} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ position: "relative" }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setModelOpen(false); }}>
                        <button onClick={() => setModelOpen(p => !p)} style={{ background: "none", border: "1px solid #555", borderRadius: 4, color: "#ccc", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em" }}>
                          {model === "gpt" ? (tier === "economy" ? "GPT-4.1 mini" : "GPT-4.1") : (tier === "economy" ? "Haiku" : "Sonnet")} ▾
                        </button>
                        {modelOpen && (
                          <div style={{ position: "absolute", bottom: "110%", right: 0, background: "#2d2d2d", border: "1px solid #555", borderRadius: 4, minWidth: 130, zIndex: 10 }}>
                            {(["gpt", "claude"] as LLMModel[]).map(m => (
                              <div key={m} onMouseDown={() => { setModel(m); setModelOpen(false); }}
                                style={{ padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: "#ccc" }}>
                                <span style={{ opacity: model === m ? 1 : 0 }}>✓</span>
                                {m === "gpt" ? (tier === "economy" ? "GPT-4.1 mini" : "GPT-4.1") : (tier === "economy" ? "Haiku" : "Sonnet")}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={send} title={hasActiveDiscussion && !isActiveTutorial ? "Send (Cmd+Enter)" : "Select a discussion first"}
                        style={{ background: hasActiveDiscussion && !isActiveTutorial ? "#0e639c" : "#333", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: hasActiveDiscussion && !isActiveTutorial ? "pointer" : "default", color: hasActiveDiscussion && !isActiveTutorial ? "#fff" : "#555", fontSize: "1em", display: "flex", alignItems: "center", justifyContent: "center" }}>↑</button>
                      <button
                        className="composer-toggle"
                        onClick={() => setComposerCollapsed(true)}
                        title="Hide prompt field"
                      >⌃</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flexShrink: 0, borderBottom: "1px solid #444", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "3px 16px", background: "#161616" }}>
                <button
                  className="composer-toggle"
                  onClick={() => setComposerCollapsed(false)}
                  title="Show prompt field"
                >⌄</button>
              </div>
            )}

            <div ref={cellScrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {tree.map(root => renderNode(root))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
