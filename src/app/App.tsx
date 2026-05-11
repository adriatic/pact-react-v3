import React, { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import type { SerializedContentBlock } from "../types/contentBlock";
import Explorer from "./Explorer";
import { useExplorer } from "./useExplorer";
import { corePrompts } from "../prompts/core";

type LLMModel = "gpt" | "claude";

type CellEvent =
  | { type: "cellStarted"; cellId: string; parentId?: string; label?: string; cellType?: string; promptText?: string; model?: string }
  | { type: "cellStream"; cellId: string; chunk: string }
  | { type: "cellCompleted"; cellId: string; elapsedMs: number }
  | { type: "discussionCellsLoaded"; cells: Cell[] }
  | { type: "discussionDeleted"; discussionId: string }
  | { type: "responsesCleared" }
  | { type: "draftLoaded"; discussionId: string; promptText: string | null }
  | { type: "cellError"; cellId: string; error: string };

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

declare const acquireVsCodeApi: any;

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];


// ─── Jaccard sentence-level diff ─────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/\b\w+\b/g) || []);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function computeWordDiff(textA: string, textB: string): {
  htmlA: string;
  htmlB: string;
} {
  const THRESHOLD = 0.4;
  const sentencesA = splitSentences(textA);
  const sentencesB = splitSentences(textB);
  const tokensA = sentencesA.map(tokenize);
  const tokensB = sentencesB.map(tokenize);

  const matchedB = new Set<number>();
  const aResults: { text: string; matched: boolean }[] = sentencesA.map((s, i) => {
    let bestSim = 0;
    let bestJ = -1;
    for (let j = 0; j < sentencesB.length; j++) {
      const sim = jaccard(tokensA[i], tokensB[j]);
      if (sim > bestSim) { bestSim = sim; bestJ = j; }
    }
    if (bestSim >= THRESHOLD) {
      matchedB.add(bestJ);
      return { text: s, matched: true };
    }
    return { text: s, matched: false };
  });

  const bResults: { text: string; matched: boolean }[] = sentencesB.map((s, j) => ({
    text: s,
    matched: matchedB.has(j),
  }));

  const escape = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const htmlA = aResults
    .map(r => r.matched
      ? escape(r.text)
      : `<span class="diff-del">${escape(r.text)}</span>`)
    .join(" ");

  const htmlB = bResults
    .map(r => r.matched
      ? escape(r.text)
      : `<span class="diff-ins">${escape(r.text)}</span>`)
    .join(" ");

  return { htmlA, htmlB };
}

// ─── Serialize contenteditable DOM → ContentBlock[] ──────────────────────────

function serializeComposer(el: HTMLDivElement): SerializedContentBlock[] {
  const blocks: SerializedContentBlock[] = [];

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text) {
        const last = blocks[blocks.length - 1];
        if (last && last.type === "text") {
          last.text += text;
        } else {
          blocks.push({ type: "text", text });
        }
      }
    } else if ((node as HTMLElement).tagName === "IMG") {
      const img = node as HTMLImageElement;
      const src = img.getAttribute("src") || "";
      const mimeType = img.getAttribute("data-mime") || "image/png";
      const base64 = src.split(",")[1] || "";
      if (base64) {
        blocks.push({ type: "image", base64, mimeType });
      }
    } else if ((node as HTMLElement).tagName === "BR") {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "text") {
        last.text += "\n";
      } else {
        blocks.push({ type: "text", text: "\n" });
      }
    } else {
      for (const child of Array.from(node.childNodes)) {
        walk(child);
      }
    }
  }

  walk(el);

  return blocks.filter(b => !(b.type === "text" && !b.text.trim()));
}

// ─── Insert image at cursor ───────────────────────────────────────────────────

function insertImageAtCursor(base64: string, mimeType: string) {
  const img = document.createElement("img");
  img.src = `data:${mimeType};base64,${base64}`;
  img.setAttribute("data-mime", mimeType);
  img.style.cssText =
    "max-height:120px;max-width:100%;display:block;margin:4px auto;border-radius:4px;border:1px solid #666;";
  img.contentEditable = "false";

  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(img);
    range.setStartAfter(img);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// ─── Encode file → base64 ────────────────────────────────────────────────────

function encodeFile(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      reject(new Error(`Unsupported image type: ${file.type}`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({ base64: dataUrl.split(",")[1], mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Resolve cell references ──────────────────────────────────────────────────

function resolveCellRefs(text: string, cells: Record<string, Cell>): string {
  const pattern = /\[Cell ([^\]]+)\]/g;
  let resolved = text;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const cellId = match[1];
    const cell = cells[cellId];
    if (cell) {
      const context =
        `[Referenced Cell]\nPrompt: ${cell.promptText ?? "(unknown)"}\nResponse: ${cell.response}\n---\n`;
      resolved = resolved.replace(match[0], context);
    }
  }

  return resolved;
}

// ─── App ─────────────────────────────────────────────────────────────────────

const vscode = acquireVsCodeApi();

export default function App() {
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [rawCells, setRawCells] = useState<Record<string, boolean>>({});
  const [model, setModel] = useState<LLMModel>("gpt");
  const [modelOpen, setModelOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showClearResponsesConfirm, setShowClearResponsesConfirm] = useState(false);
  const [showNewNotebookDialog, setShowNewNotebookDialog] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [newNotebookSystemPrompt, setNewNotebookSystemPrompt] = useState("");

  // Diff state
  const [diffMode, setDiffMode] = useState(false);
  const [diffCellA, setDiffCellA] = useState<string | null>(null);
  const [diffCellB, setDiffCellB] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  // Explorer
  const explorer = useExplorer(vscode);

  // Resizable panel
  const [explorerWidth, setExplorerWidth] = useState(220);
  const [collapsed, setCollapsed] = useState(false);
  const isDraggingDivider = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const composerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newNotebookInputRef = useRef<HTMLInputElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toggleRaw(cellId: string) {
    setRawCells(prev => ({ ...prev, [cellId]: !prev[cellId] }));
  }

  function clearView() {
    setCells({});
    if (composerRef.current) composerRef.current.innerHTML = "";
  }

  function clearResponses() {
    vscode.postMessage({
      type: "CLEAR_RESPONSES",
      discussionId: explorer.activeDiscussionId,
    });
    setShowClearResponsesConfirm(false);
  }

  function submitNewNotebook() {
    const name = newNotebookName.trim();
    if (name) {
      const systemPrompt = newNotebookSystemPrompt.trim() || null;
      vscode.postMessage({ type: "CREATE_NOTEBOOK", name, systemPrompt });
    }
    setNewNotebookName("");
    setNewNotebookSystemPrompt("");
    setShowNewNotebookDialog(false);
  }

  function closeDiff() {
    setShowDiff(false);
    setDiffMode(false);
    setDiffCellA(null);
    setDiffCellB(null);
  }

  // ── Populate composer ─────────────────────────────────────────────────────

  function populateComposer(text: string) {
    const el = composerRef.current;
    if (!el) return;
    el.innerText = text;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // ── Draft auto-save on composer input ─────────────────────────────────────

  function handleComposerInput() {
    if (!explorer.activeDiscussionId) return;
    const el = composerRef.current;
    if (!el) return;
    const text = el.innerText?.trim();
    if (!text) return;

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      vscode.postMessage({
        type: "SAVE_DRAFT",
        discussionId: explorer.activeDiscussionId,
        promptText: text,
      });
    }, 1000);
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  function send() {
    const el = composerRef.current;
    if (!el) return;

    let blocks = serializeComposer(el);

    if (blocks.length === 0) {
      const text = el.innerText?.trim();
      if (text) blocks = [{ type: "text", text }];
    }

    if (blocks.length === 0) return;

    blocks = blocks.map(block => {
      if (block.type === "text" && block.text.includes("[Cell ")) {
        return { ...block, text: resolveCellRefs(block.text, cells) };
      }
      return block;
    });

    // Delete draft on send
    if (explorer.activeDiscussionId) {
      vscode.postMessage({
        type: "DELETE_DRAFT",
        discussionId: explorer.activeDiscussionId,
      });
    }

    vscode.postMessage({
      type: "RUN_REQUESTED",
      blocks,
      model,
      discussionId: explorer.activeDiscussionId,
    });

    el.focus();
  }

  function retry(cellId: string) {
    const cell = cells[cellId];
    if (cell?.promptText && composerRef.current) {
      populateComposer(cell.promptText);
    }
    vscode.postMessage({ type: "RETRY_CELL", cellId, model });
  }

  function startDiff(cellId: string) {
    setDiffCellA(cellId);
    setDiffMode(true);
  }

  function selectDiffB(cellId: string) {
    setDiffCellB(cellId);
    setDiffMode(false);
    setShowDiff(true);
  }

  // ── Keyboard: Cmd+Enter to send ───────────────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      send();
    }
  }

  // ── Paste ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    async function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (ACCEPTED_TYPES.includes(item.type)) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          try {
            const { base64, mimeType } = await encodeFile(file);
            insertImageAtCursor(base64, mimeType);
          } catch (err: any) {
            console.error("Paste error:", err.message);
          }
          return;
        }
      }
    }

    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, []);

  // ── Drag and drop ─────────────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const { base64, mimeType } = await encodeFile(file);
      composerRef.current?.focus();
      insertImageAtCursor(base64, mimeType);
    } catch (err: any) {
      console.error("Drop error:", err.message);
    }
  }

  // ── File picker ───────────────────────────────────────────────────────────

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { base64, mimeType } = await encodeFile(file);
      composerRef.current?.focus();
      insertImageAtCursor(base64, mimeType);
    } catch (err: any) {
      console.error("File input error:", err.message);
    }
    e.target.value = "";
  }

  // ── Messages from extension host ──────────────────────────────────────────

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data: CellEvent = event.data;

      switch (data.type) {
        case "cellStarted":
          setIsRunning(true);
          setCells(prev => ({
            ...prev,
            [data.cellId]: {
              id: data.cellId,
              parentId: data.parentId,
              label: data.label,
              promptText: data.promptText,
              response: "",
              status: "running",
              timestamp: Date.now(),
              model: data.model,
            },
          }));
          break;

        case "cellStream":
          setCells(prev => ({
            ...prev,
            [data.cellId]: {
              ...prev[data.cellId],
              response: (prev[data.cellId]?.response || "") + data.chunk,
            },
          }));
          break;

        case "cellCompleted":
          setIsRunning(false);
          setCells(prev => ({
            ...prev,
            [data.cellId]: {
              ...prev[data.cellId],
              status: "done",
              elapsedMs: data.elapsedMs,
            },
          }));
          break;

        case "discussionCellsLoaded":
          setCells(Object.fromEntries(data.cells.map((c: Cell) => [c.id, c])));
          if (data.cells.length > 0) {
            const firstRoot = data.cells.find((c: Cell) => !c.parentId);
            if (firstRoot?.promptText && composerRef.current) {
              populateComposer(firstRoot.promptText);
            }
          }
          break;

        case "discussionDeleted":
          setCells({});
          if (composerRef.current) composerRef.current.innerHTML = "";
          break;

        case "responsesCleared":
          setCells({});
          break;

        case "draftLoaded":
          if (data.promptText) {
            populateComposer(data.promptText);
          }
          break;

        case "cellError":
          setIsRunning(false);
          setCells(prev => ({
            ...prev,
            [data.cellId]: { ...prev[data.cellId], status: "error", error: data.error },
          }));
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ── On discussion change: clear cells, clear composer, request draft ──────

  useEffect(() => {
    setCells({});
    if (composerRef.current) composerRef.current.innerHTML = "";
    if (explorer.activeDiscussionId) {
      vscode.postMessage({
        type: "GET_DRAFT",
        discussionId: explorer.activeDiscussionId,
      });
    }
  }, [explorer.activeDiscussionId]);

  // Auto-focus new notebook input when dialog opens
  useEffect(() => {
    if (showNewNotebookDialog) {
      setTimeout(() => newNotebookInputRef.current?.focus(), 50);
    }
  }, [showNewNotebookDialog]);

  // ── Divider drag ──────────────────────────────────────────────────────────

  function onDividerMouseDown(e: React.MouseEvent) {
    isDraggingDivider.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = explorerWidth;
    e.preventDefault();
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDraggingDivider.current) return;
      const delta = e.clientX - dragStartX.current;
      const newWidth = Math.max(140, Math.min(400, dragStartWidth.current + delta));
      setExplorerWidth(newWidth);
      setCollapsed(false);
    }

    function onMouseUp() {
      isDraggingDivider.current = false;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  // ── Tree ──────────────────────────────────────────────────────────────────

  function buildTree(): TreeNode[] {
    const map: Record<string, TreeNode> = {};
    const roots: TreeNode[] = [];

    Object.values(cells).forEach(cell => {
      map[cell.id] = { ...cell, children: [] };
    });

    Object.values(map).forEach(node => {
      if (node.parentId && map[node.parentId]) {
        map[node.parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  function renderNode(node: TreeNode, depth = 0) {
    const isRaw = rawCells[node.id] ?? false;
    const html = marked(node.response || "") as string;
    const isDiffA = diffCellA === node.id;
    const isSelectable = diffMode && node.id !== diffCellA && node.status === "done";

    return (
      <div key={node.id} style={{ marginLeft: depth * 20 }}>
        <div style={{
          border: isDiffA ? "1px solid #0e639c" : "1px solid #888",
          padding: 10,
          marginBottom: 10,
          background: isDiffA ? "#0e639c11" : "transparent",
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 6,
          }}>
            <strong>{node.label || "GPT"}</strong>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => toggleRaw(node.id)}
                style={{ fontSize: "0.75em", padding: "2px 8px" }}
              >
                {isRaw ? "Formatted" : "Raw"}
              </button>
            </div>
          </div>

          {isRaw ? (
            <div style={{ fontFamily: "monospace", fontSize: "0.85em", lineHeight: 2 }}>
              <div><span style={{ color: "#888" }}>Cell ID</span>{"  "}{node.id}</div>
              <div><span style={{ color: "#888" }}>Model{"   "}</span>{node.label ?? "—"}</div>
              <div><span style={{ color: "#888" }}>Time{"    "}</span>{node.timestamp ? new Date(node.timestamp).toLocaleTimeString() : "—"}</div>
              <div><span style={{ color: "#888" }}>Latency{"  "}</span>{node.elapsedMs !== undefined ? `${(node.elapsedMs / 1000).toFixed(1)}s` : "—"}</div>
              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(`[Cell ${node.id}]`)}
                  style={{ fontSize: "0.85em", padding: "2px 10px" }}
                >
                  Copy Ref
                </button>
              </div>
            </div>
          ) : (
            <div
              dangerouslySetInnerHTML={{ __html: html }}
              style={{ lineHeight: 1.6 }}
            />
          )}

          {!isRaw && (
            <div style={{
              marginTop: 6,
              fontSize: "0.85em",
              color: "#888",
              display: "flex",
              gap: 16,
            }}>
              <span>Status: {node.status}</span>
              {node.elapsedMs !== undefined && (
                <span>⏱ {(node.elapsedMs / 1000).toFixed(1)}s</span>
              )}
              {node.status === "error" && node.error && (
                <span style={{ color: "#e05252" }}>{node.error}</span>
              )}
            </div>
          )}

          {node.status === "done" && !diffMode && !isRaw &&
            !explorer.activeDiscussionId?.startsWith("discussion-tutorial-") && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <button onClick={() => retry(node.id)}>Retry</button>
                <button onClick={() => startDiff(node.id)}>Diff</button>
              </div>
            )}

          {isDiffA && (
            <div style={{ marginTop: 6, fontSize: "0.8em", color: "#0e639c" }}>
              Select another cell to compare →
            </div>
          )}

          {isSelectable && (
            <button
              onClick={() => selectDiffB(node.id)}
              style={{
                marginTop: 6,
                background: "#0e639c",
                border: "none",
                borderRadius: 3,
                color: "#fff",
                cursor: "pointer",
                padding: "3px 10px",
                fontSize: "0.8em",
              }}
            >
              Compare
            </button>
          )}
        </div>

        {node.children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  }

  // ── Diff view ─────────────────────────────────────────────────────────────

  function renderDiff() {
    const cellA = diffCellA ? cells[diffCellA] : null;
    const cellB = diffCellB ? cells[diffCellB] : null;
    if (!cellA || !cellB) return null;

    const { htmlA, htmlB } = computeWordDiff(cellA.response, cellB.response);

    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid #444",
          flexShrink: 0,
          background: "#1a1a1a",
        }}>
          <span style={{ color: "#e05252", fontSize: "0.9em", fontWeight: "bold" }}>
            ← {cellA.label || "GPT"}
          </span>
          <button
            onClick={closeDiff}
            style={{
              background: "none",
              border: "1px solid #555",
              borderRadius: 4,
              color: "#888",
              cursor: "pointer",
              padding: "2px 12px",
              fontSize: "0.85em",
            }}
          >
            Close Diff
          </button>
          <span style={{ color: "#4ec94e", fontSize: "0.9em", fontWeight: "bold" }}>
            {cellB.label || "GPT"} →
          </span>
        </div>

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              borderRight: "1px solid #444",
              fontFamily: "monospace",
              fontSize: "0.9em",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
              color: "#d4d4d4",
            }}
            dangerouslySetInnerHTML={{ __html: htmlA }}
          />
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              fontFamily: "monospace",
              fontSize: "0.9em",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
              color: "#d4d4d4",
            }}
            dangerouslySetInnerHTML={{ __html: htmlB }}
          />
        </div>
      </div>
    );
  }

  const tree = buildTree();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      fontFamily: "monospace",
      overflow: "hidden",
    }}>

      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #555;
          pointer-events: none;
        }
        span.diff-del {
          background: #5c1a1a;
          color: #ff9999;
          border-radius: 2px;
        }
        span.diff-ins {
          background: #1a3a1a;
          color: #99ff99;
          border-radius: 2px;
        }
      `}</style>

      {/* ── Clear Responses popup ── */}
      {showClearResponsesConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }}>
          <div style={{
            background: "#2d2d2d", border: "1px solid #555", borderRadius: 6,
            padding: 24, maxWidth: 360, width: "90%",
          }}>
            <div style={{ marginBottom: 16, lineHeight: 1.6, color: "#d4d4d4" }}>
              This will permanently delete all responses in this discussion.
              The prompt will be kept. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowClearResponsesConfirm(false)}
                style={{
                  background: "none", border: "1px solid #555", borderRadius: 4,
                  color: "#888", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em",
                }}
              >Cancel</button>
              <button
                onClick={clearResponses}
                style={{
                  background: "#c0392b", border: "none", borderRadius: 4,
                  color: "#fff", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em",
                }}
              >Clear Responses</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Notebook popup ── */}
      {showNewNotebookDialog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        }}>
          <div style={{
            background: "#2d2d2d", border: "1px solid #555", borderRadius: 6,
            padding: 24, maxWidth: 480, width: "90%",
          }}>
            <div style={{ marginBottom: 12, color: "#d4d4d4", fontSize: "0.95em", fontWeight: "bold" }}>
              New Notebook
            </div>
            <div style={{ marginBottom: 6, color: "#888", fontSize: "0.8em" }}>Name</div>
            <input
              ref={newNotebookInputRef}
              value={newNotebookName}
              onChange={e => setNewNotebookName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") { setShowNewNotebookDialog(false); setNewNotebookName(""); setNewNotebookSystemPrompt(""); }
              }}
              placeholder="Notebook name..."
              style={{
                width: "100%", background: "#1e1e1e", border: "1px solid #555",
                borderRadius: 4, color: "#d4d4d4", padding: "6px 10px",
                fontSize: "0.9em", marginBottom: 14, boxSizing: "border-box",
              }}
            />
            <div style={{ marginBottom: 6, color: "#888", fontSize: "0.8em" }}>
              System Prompt <span style={{ color: "#555" }}>(optional — sets the AI's role and context for all discussions in this notebook)</span>
            </div>
            <textarea
              value={newNotebookSystemPrompt}
              onChange={e => setNewNotebookSystemPrompt(e.target.value)}
              placeholder="e.g. You are a clinical pharmacist specializing in drug interactions. Always structure responses with severity ratings."
              rows={5}
              style={{
                width: "100%", background: "#1e1e1e", border: "1px solid #555",
                borderRadius: 4, color: "#d4d4d4", padding: "6px 10px",
                fontSize: "0.9em", marginBottom: 16, boxSizing: "border-box",
                resize: "vertical", fontFamily: "monospace", lineHeight: 1.5,
              }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowNewNotebookDialog(false); setNewNotebookName(""); setNewNotebookSystemPrompt(""); }}
                style={{
                  background: "none", border: "1px solid #555", borderRadius: 4,
                  color: "#888", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em",
                }}
              >Cancel</button>
              <button
                onClick={submitNewNotebook}
                style={{
                  background: "#0e639c", border: "none", borderRadius: 4,
                  color: "#fff", cursor: "pointer", padding: "4px 16px", fontSize: "0.9em",
                }}
              >Create</button>
            </div>
          </div>
        </div>
      )}

      {!collapsed && (
        <div style={{ width: explorerWidth, flexShrink: 0, overflow: "hidden" }}>
          <Explorer
            notebooks={explorer.notebooks}
            discussions={explorer.discussions}
            activeDiscussionId={explorer.activeDiscussionId}
            onSelectDiscussion={(discussion) => {
              setCells({});
              if (composerRef.current) composerRef.current.innerHTML = "";
              explorer.selectDiscussion(discussion);
            }}
            onCreateNotebook={explorer.createNotebook}
            onCreateDiscussion={explorer.createDiscussion}
            onSelectPrompt={(text) => {
              setCells({});
              populateComposer(text);
            }}
            corePrompts={corePrompts}
            onDeleteDiscussion={explorer.deleteDiscussion}
            onDeleteNotebook={explorer.deleteNotebook}
            onExportNotebook={explorer.exportNotebook}
            onImportNotebook={explorer.importNotebook}
          />
        </div>
      )}

      <div
        onMouseDown={onDividerMouseDown}
        onDoubleClick={() => setCollapsed(p => !p)}
        title="Drag to resize, double-click to collapse"
        style={{
          width: 4, cursor: "col-resize", background: "#333",
          flexShrink: 0, transition: "background 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#0e639c")}
        onMouseLeave={e => (e.currentTarget.style.background = "#333")}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── Line 1: global menu bar ── */}
        <div style={{
          padding: "8px 16px", borderBottom: "1px solid #333",
          flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
        }}>
          <h2 style={{ margin: 0, fontSize: "1.1em" }}>PACT</h2>
          <button onClick={clearView} style={{
            background: "none", border: "1px solid #555", borderRadius: 4,
            color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em",
          }}>Clear</button>
          {explorer.activeDiscussionId && (
            <button onClick={() => setShowClearResponsesConfirm(true)} style={{
              background: "none", border: "1px solid #555", borderRadius: 4,
              color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em",
            }}>Clear Responses</button>
          )}
          <button onClick={() => setShowNewNotebookDialog(true)} style={{
            background: "none", border: "1px solid #555", borderRadius: 4,
            color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em",
          }}>+ Notebook</button>
          <button onClick={explorer.importNotebook} style={{
            background: "none", border: "1px solid #555", borderRadius: 4,
            color: "#888", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em",
          }}>Import</button>
          {diffMode && (
            <button
              onClick={() => { setDiffMode(false); setDiffCellA(null); }}
              style={{
                background: "none", border: "1px solid #e05252", borderRadius: 4,
                color: "#e05252", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em",
              }}
            >Cancel Diff</button>
          )}
        </div>

        {/* ── Line 2: context bar ── */}
        <div style={{
          padding: "5px 16px", borderBottom: "1px solid #444",
          flexShrink: 0, display: "flex", alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ color: "#888", fontSize: "0.85em" }}>
            {explorer.activeDiscussionId
              ? (explorer.discussions.find(d => d.id === explorer.activeDiscussionId)?.name ?? "")
              : ""}
          </span>
          <div
            title={isRunning ? "Running" : "Idle"}
            style={{
              width: 10, height: 10, borderRadius: "50%",
              background: isRunning ? "#e05252" : "#4ec94e",
              boxShadow: isRunning ? "0 0 6px #e05252" : "0 0 6px #4ec94e",
              transition: "background 0.3s, box-shadow 0.3s",
            }}
          />
        </div>

        {showDiff ? renderDiff() : (
          <>
            <div style={{ flexShrink: 0, padding: "10px 16px", borderBottom: "1px solid #444" }}>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: isDragging ? "2px dashed #888" : "1px solid #666",
                  borderRadius: 6, background: "#1e1e1e",
                }}
              >
                <div
                  ref={composerRef}
                  contentEditable
                  suppressContentEditableWarning
                  onKeyDown={handleKeyDown}
                  onInput={handleComposerInput}
                  style={{
                    minHeight: 60, maxHeight: 200, overflowY: "auto",
                    padding: "10px 12px", outline: "none",
                    whiteSpace: "pre-wrap", lineHeight: 1.6, color: "#d4d4d4",
                  }}
                  data-placeholder="Enter prompt — Cmd+V to paste image, Cmd+Enter to send"
                />

                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "6px 10px", borderTop: "1px solid #444",
                }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach image"
                      style={{
                        background: "none", border: "none", color: "#888",
                        cursor: "pointer", fontSize: "1.1em",
                      }}
                    >+</button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: "none" }}
                      onChange={handleFileInput}
                    />
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => setModelOpen(p => !p)}
                        style={{
                          background: "none", border: "1px solid #555", borderRadius: 4,
                          color: "#ccc", cursor: "pointer", padding: "2px 10px", fontSize: "0.85em",
                        }}
                      >
                        {model === "gpt" ? "GPT-4.1" : "Claude"} ▾
                      </button>

                      {modelOpen && (
                        <div style={{
                          position: "absolute", bottom: "110%", right: 0,
                          background: "#2d2d2d", border: "1px solid #555",
                          borderRadius: 4, minWidth: 130, zIndex: 10,
                        }}>
                          {(["gpt", "claude"] as LLMModel[]).map(m => (
                            <div
                              key={m}
                              onClick={() => { setModel(m); setModelOpen(false); }}
                              style={{
                                padding: "6px 12px", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 8, color: "#ccc",
                              }}
                            >
                              <span style={{ opacity: model === m ? 1 : 0 }}>✓</span>
                              {m === "gpt" ? "GPT-4.1" : "Claude Sonnet"}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={send}
                      title="Send (Cmd+Enter)"
                      style={{
                        background: "#0e639c", border: "none", borderRadius: "50%",
                        width: 32, height: 32, cursor: "pointer", color: "#fff",
                        fontSize: "1em", display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >↑</button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {tree.map(root => renderNode(root))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
