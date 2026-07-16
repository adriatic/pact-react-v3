// Copyright © 2026 PACTResearch.net. All rights reserved.
// pactresearch.net
import { eventBus, CellType } from "./eventBus";
import { LLMRouter, LLMModel } from "../llm/llmRouter";
import { ResponseStore } from "../storage/responseStore";
import { NotebookStore } from "../storage/notebookStore";
import type { SerializedContentBlock } from "../types/contentBlock";

export type ImageAttachment = {
  base64: string;
  mimeType: string;
};

type Cell = {
  id: string;
  parentId?: string;
  prompt: string;
  label?: string;
  cellType: CellType;
  promptId?: string;
  blocks: SerializedContentBlock[];
  model: LLMModel;
  discussionId: string;
};

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseTocFromContent(content: string): string[] {
  const titles: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^\d+\.\s+(.+)/);
    if (match) {
      titles.push(match[1].trim());
    } else if (titles.length > 0) {
      break;
    }
  }
  return titles;
}

export class ExecutionEngine {
  private cells: Record<string, Cell> = {};
  private isRunning = false;
  private router: LLMRouter;
  private store: ResponseStore;
  private notebookStore: NotebookStore;
  private toc: string[] = [];

  // XM continuation state
  private xmActiveCellId: string | null = null;
  private xmCompletedSections: number[] = [];
  private xmElapsedMs: number = 0;
  private xmNotebookId: string | null = null;
  private xmDiscussionId: string | null = null;
  private xmCellContent: string = "";

  constructor(router: LLMRouter, extensionPath: string) {
    this.router = router;
    this.store = new ResponseStore(extensionPath);
    this.notebookStore = new NotebookStore(extensionPath);
  }

  private async getSystemPrompt(discussionId: string): Promise<string | null> {
    const db = this.notebookStore;
    const notebooks = db.getAllNotebooks();
    for (const notebook of notebooks) {
      const discussions = db.getDiscussionsForNotebook(notebook.id);
      if (discussions.some(d => d.id === discussionId)) {
        return db.getSystemPrompt(notebook.id);
      }
    }
    return null;
  }

  private getNotebookId(discussionId: string): string | null {
    return this.notebookStore.getNotebookIdForDiscussion(discussionId);
  }

  private getExecutionMode(discussionId: string): "interactive" | "index" {
    const notebookId = this.getNotebookId(discussionId);
    if (!notebookId) return "index";
    return this.notebookStore.getExecutionMode(notebookId);
  }

  private saveXmState(discussionId: string): void {
    if (!this.xmActiveCellId || !this.toc.length) return;
    const notebookId = this.xmNotebookId ?? this.getNotebookId(discussionId);
    if (!notebookId) return;
    this.notebookStore.saveXmState(notebookId, {
      toc: this.toc,
      completedSections: this.xmCompletedSections,
      activeCellId: this.xmActiveCellId,
      discussionId,
      elapsedMs: this.xmElapsedMs,
      savedAt: Date.now(),
    });
    console.log("PACT XM state saved — completed:", this.xmCompletedSections.length, "of", this.toc.length);
  }

  private saveXmCellContent(cellId: string, discussionId: string): void {
    const cell = this.cells[cellId];
    if (!cell) {
      console.warn("PACT saveXmCellContent: cell not found in memory for", cellId);
      return;
    }
    if (!this.xmCellContent) {
      console.warn("PACT saveXmCellContent: no content to save for", cellId);
      return;
    }
    const image = cell.blocks.find(b => b.type === "image") as any;
    this.store.save(
      cellId, cell.prompt, this.xmCellContent, cell.model, "user",
      image?.base64, image?.mimeType, undefined, discussionId,
    );
    console.log("PACT XM cell content saved — length:", this.xmCellContent.length);
  }

  restoreXmState(notebookId: string): void {
    const state = this.notebookStore.getXmState(notebookId);
    if (!state) return;

    this.toc = state.toc;
    this.xmActiveCellId = state.activeCellId;
    this.xmCompletedSections = state.completedSections;
    this.xmElapsedMs = state.elapsedMs;
    this.xmNotebookId = notebookId;
    this.xmDiscussionId = state.discussionId;

    const stored = this.store.get(state.activeCellId);
    this.xmCellContent = stored?.response ?? "";

    // Reconstruct cell so continueRun can find it after restart
    if (stored) {
      this.cells[state.activeCellId] = {
        id: state.activeCellId,
        prompt: stored.promptText,
        label: stored.model === "claude" ? "Claude" : "GPT",
        cellType: "user",
        blocks: [],
        model: stored.model as LLMModel,
        discussionId: state.discussionId,
      };
      console.log("PACT XM cell reconstructed from SQLite — content length:", this.xmCellContent.length);
    } else {
      console.warn("PACT XM restore: no stored cell found for", state.activeCellId);
    }

    console.log("PACT XM state restored for notebook:", notebookId, "discussion:", state.discussionId, "sections:", state.toc.length, "completed:", state.completedSections.length, "content length:", this.xmCellContent.length);

    eventBus.emit({
      type: "xmStateRestored",
      notebookId,
      toc: state.toc,
      completedSections: state.completedSections,
      activeCellId: state.activeCellId,
      discussionId: state.discussionId,
    });
  }

  async continueRun(
    selectedSections: number[],
    cellId: string,
    toc: string[],
    model: LLMModel,
    resolvedModel: string,
    discussionId: string,
    userSystemPrompt: string = "",
  ) {
    if (this.isRunning) {
      eventBus.emit({ type: "cellError", cellId, error: "Execution already in progress" });
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    this.xmActiveCellId = cellId;
    this.toc = toc;
    this.xmNotebookId = this.getNotebookId(discussionId);
    this.xmDiscussionId = discussionId;

    const originalPrompt = this.cells[cellId]?.prompt ?? "";

    console.log("PACT continueRun — cellId:", cellId, "sections:", selectedSections, "cell in memory:", !!this.cells[cellId], "content so far:", this.xmCellContent.length);
    console.log("PACT continueRun prompt length:", originalPrompt.length, "blocks:", this.cells[cellId]?.blocks?.length ?? 0, "resolvedModel:", resolvedModel);

    eventBus.emit({ type: "cellStarted", cellId, label: model === "claude" ? "Claude" : "GPT", cellType: "user" });

    try {
      const notebookSystemPrompt = await this.getSystemPrompt(discussionId);

      const sectionTitles = selectedSections
        .map(i => toc[i - 1])
        .filter(Boolean)
        .map((title, i) => `${selectedSections[i]}. ${title}`)
        .join("\n");

      const systemPrompt = [
        userSystemPrompt,
        notebookSystemPrompt,
        `You are continuing a research report on the following topic:\n${originalPrompt}\n\nWrite ONLY the following sections, using the exact headings listed below. Do not include a Table of Contents. Do not repeat any sections already written. Write each section in full. Do not add any transitional summaries, forward references, "document control" sections, or any text explaining what sections come next — end each section cleanly with its own content only.\n\n${sectionTitles}`,
      ].filter(Boolean).join("\n\n");

      let continuationContent = "";
      await this.router.run(
        model, originalPrompt, (token) => {
          continuationContent += token;
          eventBus.emit({ type: "cellStream", cellId, chunk: token });
        },
        this.cells[cellId]?.blocks ?? [], systemPrompt, resolvedModel, this.toc,
      );

      this.xmCellContent += "\n\n" + continuationContent;
      this.xmCompletedSections = [...new Set([...this.xmCompletedSections, ...selectedSections])].sort((a, b) => a - b);

      const elapsedMs = Date.now() - startTime;
      this.xmElapsedMs += elapsedMs;
      this.notebookStore.addTime(discussionId, elapsedMs);

      this.saveXmCellContent(cellId, discussionId);
      this.saveXmState(discussionId);

      const allDone = this.xmCompletedSections.length === toc.length;

      if (allDone) {
        const notice = `\n\n---\n*All ${toc.length} sections complete.*`;
        this.xmCellContent += notice;
        eventBus.emit({ type: "cellStream", cellId, chunk: notice });
        this.saveXmCellContent(cellId, discussionId);
        eventBus.emit({ type: "cellCompleted", cellId, elapsedMs: this.xmElapsedMs });

        // Persist and broadcast the final all-checked state instead of just
        // wiping it — otherwise a fully-completed run leaves nothing for the
        // Index button to show, and reopening it later does nothing at all.
        const notebookId = this.xmNotebookId ?? this.getNotebookId(discussionId);
        if (notebookId) {
          this.notebookStore.saveXmState(notebookId, {
            toc: this.toc,
            completedSections: this.xmCompletedSections,
            activeCellId: cellId,
            discussionId,
            elapsedMs: this.xmElapsedMs,
            savedAt: Date.now(),
          });
          eventBus.emit({
            type: "xmStateRestored",
            notebookId,
            toc: this.toc,
            completedSections: this.xmCompletedSections,
            activeCellId: cellId,
            discussionId,
          });
        } else {
          console.warn("PACT: continueRun completion — could not resolve notebookId to persist final state for", discussionId);
        }

        this.xmActiveCellId = null;
        this.xmCompletedSections = [];
        this.xmElapsedMs = 0;
        this.toc = [];
        this.xmNotebookId = null;
        this.xmDiscussionId = null;
        this.xmCellContent = "";
      } else {
        const resolvedNotebookId = this.getNotebookId(discussionId);
        if (!resolvedNotebookId) console.warn("PACT: xmTocReady (continueRun) — could not resolve notebookId for discussion", discussionId);
        eventBus.emit({
          type: "xmTocReady",
          notebookId: resolvedNotebookId ?? "",
          toc: this.toc,
          completedSections: this.xmCompletedSections,
          activeCellId: cellId,
          discussionId,
        });
      }

    } catch (err: any) {
      eventBus.emit({ type: "cellError", cellId, error: err?.message || "LLM error" });
    } finally {
      this.isRunning = false;
    }
  }

  abortRun(discussionId?: string): void {
    // Resolve the notebook to clear from whichever source is available:
    // the engine's own tracking first, falling back to a lookup via the
    // discussionId passed in (e.g. from the client's ABORT_RUN message).
    const notebookIdToClear = this.xmNotebookId ?? (discussionId ? this.getNotebookId(discussionId) : null);
    if (notebookIdToClear) {
      this.notebookStore.clearXmState(notebookIdToClear);
    } else {
      console.warn("PACT: abortRun could not resolve a notebookId to clear persisted XM state for");
    }
    this.xmActiveCellId = null;
    this.xmCompletedSections = [];
    this.xmElapsedMs = 0;
    this.toc = [];
    this.xmNotebookId = null;
    this.xmDiscussionId = null;
    this.xmCellContent = "";
  }

  async runPrompt(
    prompt: string,
    parentId?: string,
    label?: string,
    cellType: CellType = "user",
    promptId?: string,
    blocks: SerializedContentBlock[] = [],
    model: LLMModel = "gpt",
    discussionId: string = "discussion-default",
    userSystemPrompt: string = "",
    resolvedModel?: string,
  ) {
    if (this.isRunning) {
      eventBus.emit({ type: "cellError", cellId: "", error: "Execution already in progress" });
      return;
    }

    this.isRunning = true;

    // Reset XM state for a fresh run
    this.xmActiveCellId = null;
    this.xmCompletedSections = [];
    this.xmElapsedMs = 0;
    this.toc = [];
    this.xmNotebookId = null;
    this.xmDiscussionId = null;
    this.xmCellContent = "";

    const cellId = generateId();
    const cellLabel = label ?? (model === "claude" ? "Claude" : "GPT");
    const startTime = Date.now();

    this.cells[cellId] = {
      id: cellId, parentId, prompt, label: cellLabel,
      cellType, promptId, blocks, model, discussionId,
    };

    // Determine execution mode for this discussion's notebook
    const executionMode = this.getExecutionMode(discussionId);
    console.log("PACT runPrompt — mode:", executionMode, "cellType:", cellType);

    try {
      eventBus.emit({ type: "cellStarted", cellId, parentId, label: cellLabel, cellType, promptText: prompt });

      const notebookSystemPrompt = await this.getSystemPrompt(discussionId);

      // Index mode: inject ToC instruction and sentinel detection
      // Interactive mode: run straight through, no ToC interception
      const tocInstruction = (cellType !== "tutorial" && executionMode === "index")
        ? "Always begin your response with a concise Table of Contents listing only the major top-level sections (not subsections), numbered, one per line. Use the exact headings that will appear in the document body. Immediately after the last ToC entry, output the exact line ===TOC_END=== on its own line, with nothing else on that line. Then continue with the full report without pausing, asking for confirmation, or waiting for a response. Do not add any transitional summaries, forward references, \"document control\" sections, or any text explaining what sections come next — end each section cleanly with its own content only."
        : null;

      const systemPrompt = [userSystemPrompt, notebookSystemPrompt, tocInstruction]
        .filter(Boolean).join("\n\n") || undefined;

      if (cellType === "tutorial" && promptId) {
        const stored = this.store.get(promptId);
        if (stored && !parentId) {
          for (const char of stored.response) {
            eventBus.emit({ type: "cellStream", cellId, chunk: char });
          }
        } else {
          let full = "";
          await this.router.run(model, prompt, (token) => {
            full += token;
            eventBus.emit({ type: "cellStream", cellId, chunk: token });
          }, blocks, systemPrompt, resolvedModel, this.toc);
          const image = blocks.find(b => b.type === "image") as any;
          this.store.save(cellId, prompt, full, model, cellType,
            image?.base64, image?.mimeType, parentId, discussionId);
        }

      } else if (executionMode === "index") {
        // ── Index mode: sentinel-based ToC detection ─────────────────────
        const abortController = new AbortController();
        const TOC_END_MARKER = "===TOC_END===";
        let tocBuffer = "";
        let tocDetected = false;

        let full = "";
        const result = await this.router.run(model, prompt, (token) => {
          full += token;
          eventBus.emit({ type: "cellStream", cellId, chunk: token });
          if (!tocDetected) {
            tocBuffer += token;
            const markerIndex = tocBuffer.indexOf(TOC_END_MARKER);
            if (markerIndex !== -1) {
              tocDetected = true;
              this.toc = parseTocFromContent(tocBuffer.slice(0, markerIndex));
              console.log("PACT ToC complete (sentinel), aborting stream. Sections:", this.toc.length);
              abortController.abort();
            }
          }
        }, blocks, systemPrompt, resolvedModel, this.toc, abortController.signal);

        if (result.stopReason === "toc_complete") {
          this.xmActiveCellId = cellId;
          this.xmCompletedSections = [];
          this.xmElapsedMs = Date.now() - startTime;
          this.xmNotebookId = this.getNotebookId(discussionId);
          this.xmDiscussionId = discussionId;
          // Persist only what comes after the ToC + sentinel marker — the raw
          // planning list is already shown via the XM popup's checkboxes, and
          // the cell's stored content is eventually what gets delivered to
          // customers as a PDF, so it must never contain this internal artifact.
          const markerIndex = full.indexOf(TOC_END_MARKER);
          const cleanedContent = markerIndex !== -1
            ? full.slice(markerIndex + TOC_END_MARKER.length).replace(/^\s+/, "")
            : full;
          this.xmCellContent = cleanedContent;
          this.store.save(cellId, prompt, cleanedContent, model, "user",
            undefined, undefined, parentId, discussionId);
          this.saveXmState(discussionId);
          console.log("PACT emitting xmTocReady:", this.toc);
          const resolvedNotebookId = this.getNotebookId(discussionId);
          if (!resolvedNotebookId) console.warn("PACT: xmTocReady (runPrompt) — could not resolve notebookId for discussion", discussionId);
          eventBus.emit({
            type: "xmTocReady",
            notebookId: resolvedNotebookId ?? "",
            toc: this.toc,
            completedSections: [],
            activeCellId: cellId,
            discussionId,
          });
          this.isRunning = false;
          return;
        }

        if (this.toc.length === 0 && result.content.length > 0) {
          this.toc = parseTocFromContent(result.content);
        }

        const image = blocks.find(b => b.type === "image") as any;
        this.store.save(cellId, result.content, result.content, model, cellType,
          image?.base64, image?.mimeType, parentId, discussionId);

        if (result.stoppedAfterSection !== null && result.totalSections !== null) {
          eventBus.emit({ type: "cellPaused", cellId,
            stoppedAfterSection: result.stoppedAfterSection,
            totalSections: result.totalSections });
        }

      } else {
        // ── Interactive mode: run straight through, no ToC interception ──
        let full = "";
        const result = await this.router.run(model, prompt, (token) => {
          full += token;
          eventBus.emit({ type: "cellStream", cellId, chunk: token });
        }, blocks, systemPrompt, resolvedModel, []);

        const image = blocks.find(b => b.type === "image") as any;
        this.store.save(cellId, result.content, result.content, model, cellType,
          image?.base64, image?.mimeType, parentId, discussionId);
      }

      const elapsedMs = Date.now() - startTime;
      this.notebookStore.addTime(discussionId, elapsedMs);
      eventBus.emit({ type: "cellCompleted", cellId, elapsedMs });

    } catch (err: any) {
      eventBus.emit({ type: "cellError", cellId, error: err?.message || "LLM error" });
    } finally {
      this.isRunning = false;
    }
  }

  async retryCell(cellId: string, model?: LLMModel) {
    const original = this.cells[cellId];
    console.log("retryCell:", cellId, "requested model:", model, "cell type:", original.cellType, "model:", original?.model);
    if (!original) return;
    const effectiveModel = model ?? original.model;
    const label = effectiveModel === "claude" ? "Claude" : "GPT";
    return this.runPrompt(
      original.prompt, cellId, label, original.cellType,
      original.promptId, original.blocks, effectiveModel, original.discussionId,
    );
  }
}
