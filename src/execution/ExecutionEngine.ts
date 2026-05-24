// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
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

export class ExecutionEngine {
  private cells: Record<string, Cell> = {};
  private isRunning = false;
  private router: LLMRouter;
  private store: ResponseStore;
  private notebookStore: NotebookStore;

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
      eventBus.emit({
        type: "cellError",
        cellId: "",
        error: "Execution already in progress",
      });
      return;
    }

    this.isRunning = true;

    const cellId = generateId();
    const cellLabel = label ?? (model === "claude" ? "Claude" : "GPT");
    const startTime = Date.now();

    this.cells[cellId] = {
      id: cellId,
      parentId,
      prompt,
      label: cellLabel,
      cellType,
      promptId,
      blocks,
      model,
      discussionId,
    };

    try {
      eventBus.emit({
        type: "cellStarted",
        cellId,
        parentId,
        label: cellLabel,
        cellType,
        promptText: prompt,
      });

      const notebookSystemPrompt = await this.getSystemPrompt(discussionId);

      const systemPrompt = [userSystemPrompt, notebookSystemPrompt]
        .filter(Boolean)
        .join("\n\n") || undefined;

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
          }, blocks, systemPrompt, resolvedModel);

          const image = blocks.find(b => b.type === "image") as any;
          this.store.save(
            cellId, prompt, full, model, cellType,
            image?.base64, image?.mimeType,
            parentId, discussionId,
          );
        }
      } else {
        let full = "";
await this.router.run(model, prompt, (token) => {
            full += token;
            eventBus.emit({ type: "cellStream", cellId, chunk: token });
          }, blocks, systemPrompt, resolvedModel); 

        const image = blocks.find(b => b.type === "image") as any;
        this.store.save(
          cellId, prompt, full, model, cellType,
          image?.base64, image?.mimeType,
          parentId, discussionId,
        );
      }

      const elapsedMs = Date.now() - startTime;
      this.notebookStore.addTime(discussionId, elapsedMs);

      eventBus.emit({
        type: "cellCompleted",
        cellId,
        elapsedMs,
      });

    } catch (err: any) {
      eventBus.emit({
        type: "cellError",
        cellId,
        error: err?.message || "LLM error",
      });
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
      original.prompt,
      cellId,
      label,
      original.cellType,
      original.promptId,
      original.blocks,
      effectiveModel,
      original.discussionId,
    );
  }
}