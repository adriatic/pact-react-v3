// Copyright © 2026 PACTResearch.net. All rights reserved.
import { getDb } from "./db";

const SIGN_SERVER = process.env.PACT_SIGN_SERVER ?? "https://sign.pactresearch.net";

export type ExecutionMode = "express" | "xm";

export type Notebook = {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: number;
  executionMode: ExecutionMode;
};

export type Discussion = {
  id: string;
  notebookId: string;
  parentId?: string;
  name: string;
  createdAt: number;
  totalTimeMs: number;
};

export type XMPersistedState = {
  toc: string[];
  completedSections: number[];
  activeCellId: string;
  discussionId: string;
  elapsedMs: number;
  savedAt: number;
};

export type PactExport = {
  version: number;
  exportedAt: number;
  notebook: {
    name: string;
    systemPrompt: string | null;
    executionMode?: ExecutionMode;
  };
  discussions: {
    id: string;
    name: string;
    createdAt: number;
    totalTimeMs: number;
  }[];
  cells: {
    id: string;
    discussionId: string;
    parentId: string | null;
    promptText: string;
    response: string;
    model: string;
    cellType: string;
    createdAt: number;
  }[];
};

export type SignedPactExport = {
  version: number;
  signedAt: number;
  signer: string;
  signature: string;
  payload: PactExport;
};

export type VerifyResult = {
  valid: boolean;
  reason: string | null;
};

export class NotebookStore {
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  // ── Notebooks ─────────────────────────────────────────────────────────────

  getAllNotebooks(): Notebook[] {
    const db = getDb(this.extensionPath);
    const rows = db
      .prepare("SELECT * FROM notebooks ORDER BY CASE id WHEN 'notebook-tutorial' THEN 0 WHEN 'notebook-drafts' THEN 1 ELSE 2 END, name ASC")
      .all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      isSystem: r.is_system === 1,
      createdAt: r.created_at,
      executionMode: (r.execution_mode ?? "xm") as ExecutionMode,
    }));
  }

  createNotebook(name: string, systemPrompt: string | null = null): Notebook {
    const db = getDb(this.extensionPath);
    const id = `notebook-${Date.now()}`;
    const createdAt = Date.now();
    db.prepare(`
      INSERT INTO notebooks (id, name, is_system, created_at, system_prompt, execution_mode)
      VALUES (?, ?, 0, ?, ?, 'xm')
    `).run(id, name, createdAt, systemPrompt);
    return { id, name, isSystem: false, createdAt, executionMode: "xm" };
  }

  // ── Execution Mode ────────────────────────────────────────────────────────

  getExecutionMode(notebookId: string): ExecutionMode {
    const db = getDb(this.extensionPath);
    const row = db
      .prepare("SELECT execution_mode FROM notebooks WHERE id = ?")
      .get(notebookId) as { execution_mode: string | null } | undefined;
    return (row?.execution_mode ?? "xm") as ExecutionMode;
  }

  saveExecutionMode(notebookId: string, mode: ExecutionMode): void {
    const db = getDb(this.extensionPath);
    db.prepare("UPDATE notebooks SET execution_mode = ? WHERE id = ?").run(mode, notebookId);
  }

  // ── IPR Research Question ─────────────────────────────────────────────────

  saveIprResearchQuestion(notebookId: string, question: string | null): void {
    const db = getDb(this.extensionPath);
    db.prepare("UPDATE notebooks SET ipr_research_question = ? WHERE id = ?").run(question ?? null, notebookId);
  }

  getIprResearchQuestion(notebookId: string): string | null {
    const db = getDb(this.extensionPath);
    const row = db
      .prepare("SELECT ipr_research_question FROM notebooks WHERE id = ?")
      .get(notebookId) as { ipr_research_question: string | null } | undefined;
    return row?.ipr_research_question ?? null;
  }

  // ── Discussions ───────────────────────────────────────────────────────────

  getDiscussionsForNotebook(notebookId: string): Discussion[] {
    const db = getDb(this.extensionPath);
    const rows = db
      .prepare("SELECT * FROM discussions WHERE notebook_id = ? ORDER BY created_at ASC")
      .all(notebookId) as any[];
    return rows.map(r => ({
      id: r.id,
      notebookId: r.notebook_id,
      parentId: r.parent_id ?? undefined,
      name: r.name,
      createdAt: r.created_at,
      totalTimeMs: r.total_time_ms,
    }));
  }

  getCellsForDiscussion(discussionId: string): any[] {
    const db = getDb(this.extensionPath);
    const rows = db
      .prepare("SELECT * FROM responses WHERE discussion_id = ? ORDER BY created_at ASC")
      .all(discussionId) as any[];
    return rows.map(r => ({
      id: r.prompt_id,
      parentId: r.parent_id ?? undefined,
      response: r.response,
      status: "done",
      elapsedMs: 0,
      label: r.cell_type === "tutorial" ? r.prompt_id : r.model === "claude" ? "Claude" : "GPT",
      promptText: r.prompt_text,
      model: r.model,
      timestamp: r.created_at,
    }));
  }

  getCellById(cellId: string): { promptText: string; response: string } | null {
    const db = getDb(this.extensionPath);
    const row = db
      .prepare("SELECT prompt_text, response FROM responses WHERE prompt_id = ?")
      .get(cellId) as { prompt_text: string; response: string } | undefined;
    if (!row) return null;
    return { promptText: row.prompt_text, response: row.response };
  }

  createDiscussion(notebookId: string, name: string, parentId?: string): Discussion {
    const db = getDb(this.extensionPath);
    const id = `discussion-${Date.now()}`;
    const createdAt = Date.now();
    db.prepare(`
      INSERT INTO discussions (id, notebook_id, parent_id, name, created_at, total_time_ms)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(id, notebookId, parentId ?? null, name, createdAt);
    return { id, notebookId, parentId, name, createdAt, totalTimeMs: 0 };
  }

  deleteDiscussion(discussionId: string): void {
    const db = getDb(this.extensionPath);
    db.prepare("DELETE FROM responses WHERE discussion_id = ?").run(discussionId);
    db.prepare("DELETE FROM discussions WHERE id = ?").run(discussionId);
  }

  deleteNotebook(notebookId: string): void {
    const db = getDb(this.extensionPath);
    db.prepare(`
      DELETE FROM responses WHERE discussion_id IN (
        SELECT id FROM discussions WHERE notebook_id = ?
      )
    `).run(notebookId);
    db.prepare("DELETE FROM discussions WHERE notebook_id = ?").run(notebookId);
    db.prepare("DELETE FROM notebooks WHERE id = ?").run(notebookId);
  }

  clearResponses(discussionId: string): void {
    const db = getDb(this.extensionPath);
    db.prepare("DELETE FROM responses WHERE discussion_id = ?").run(discussionId);
  }

  // ── Drafts ────────────────────────────────────────────────────────────────

  saveDraft(discussionId: string, promptText: string): void {
    const db = getDb(this.extensionPath);
    const draftId = `draft-${discussionId}`;
    const existing = db.prepare("SELECT id FROM discussions WHERE id = ?").get(draftId) as { id: string } | undefined;
    if (!existing) {
      db.prepare(`
        INSERT INTO discussions (id, notebook_id, parent_id, name, created_at, total_time_ms)
        VALUES (?, 'notebook-drafts', NULL, ?, ?, 0)
      `).run(draftId, discussionId, Date.now());
    }
    db.prepare(`
      INSERT OR REPLACE INTO responses
        (prompt_id, prompt_text, response, model, cell_type, created_at, discussion_id, parent_id)
      VALUES (?, ?, '', 'gpt', 'draft', ?, ?, NULL)
    `).run(draftId, promptText, Date.now(), draftId);
  }

  getDraft(discussionId: string): string | null {
    const db = getDb(this.extensionPath);
    const draftId = `draft-${discussionId}`;
    const row = db.prepare("SELECT prompt_text FROM responses WHERE prompt_id = ?").get(draftId) as { prompt_text: string } | undefined;
    return row?.prompt_text ?? null;
  }

  deleteDraft(discussionId: string): void {
    const db = getDb(this.extensionPath);
    const draftId = `draft-${discussionId}`;
    db.prepare("DELETE FROM responses WHERE prompt_id = ?").run(draftId);
    db.prepare("DELETE FROM discussions WHERE id = ?").run(draftId);
  }

  addTime(discussionId: string, elapsedMs: number): void {
    const db = getDb(this.extensionPath);
    db.prepare("UPDATE discussions SET total_time_ms = total_time_ms + ? WHERE id = ?").run(elapsedMs, discussionId);
  }

  getDefaultDiscussionId(): string {
    return "discussion-default";
  }

  getSystemPrompt(notebookId: string): string | null {
    const db = getDb(this.extensionPath);
    const row = db.prepare("SELECT system_prompt FROM notebooks WHERE id = ?").get(notebookId) as { system_prompt: string | null } | undefined;
    return row?.system_prompt ?? null;
  }

  updateSystemPrompt(notebookId: string, systemPrompt: string | null): void {
    const db = getDb(this.extensionPath);
    db.prepare("UPDATE notebooks SET system_prompt = ? WHERE id = ?").run(systemPrompt ?? null, notebookId);
  }

  getIprMessages(notebookId: string): any[] {
    const db = getDb(this.extensionPath);
    const row = db.prepare("SELECT ipr_messages FROM notebooks WHERE id = ?").get(notebookId) as { ipr_messages: string | null } | undefined;
    if (!row?.ipr_messages) return [];
    try { return JSON.parse(row.ipr_messages); } catch { return []; }
  }

  saveIprMessages(notebookId: string, messages: any[]): void {
    const db = getDb(this.extensionPath);
    db.prepare("UPDATE notebooks SET ipr_messages = ? WHERE id = ?").run(JSON.stringify(messages), notebookId);
  }

  // ── XM State ─────────────────────────────────────────────────────────────

  saveXmState(notebookId: string, state: XMPersistedState): void {
    const db = getDb(this.extensionPath);
    db.prepare("UPDATE notebooks SET xm_state = ? WHERE id = ?").run(JSON.stringify({ ...state, savedAt: Date.now() }), notebookId);
  }

  getXmState(notebookId: string): XMPersistedState | null {
    const db = getDb(this.extensionPath);
    const row = db.prepare("SELECT xm_state FROM notebooks WHERE id = ?").get(notebookId) as { xm_state: string | null } | undefined;
    if (!row?.xm_state) return null;
    try { return JSON.parse(row.xm_state) as XMPersistedState; } catch { return null; }
  }

  clearXmState(notebookId: string): void {
    const db = getDb(this.extensionPath);
    db.prepare("UPDATE notebooks SET xm_state = NULL WHERE id = ?").run(notebookId);
  }

  getNotebookIdForDiscussion(discussionId: string): string | null {
    const db = getDb(this.extensionPath);
    const row = db.prepare("SELECT notebook_id FROM discussions WHERE id = ?").get(discussionId) as { notebook_id: string } | undefined;
    return row?.notebook_id ?? null;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportNotebook(notebookId: string): PactExport | null {
    const db = getDb(this.extensionPath);
    const notebookRow = db.prepare("SELECT * FROM notebooks WHERE id = ?").get(notebookId) as any;
    if (!notebookRow) return null;

    const discussionRows = db
      .prepare("SELECT * FROM discussions WHERE notebook_id = ? ORDER BY created_at ASC")
      .all(notebookId) as any[];
    const discussionIds = discussionRows.map((d: any) => d.id);
    const cellRows = discussionIds.length > 0
      ? db.prepare(`SELECT * FROM responses WHERE discussion_id IN (${discussionIds.map(() => "?").join(",")}) ORDER BY created_at ASC`).all(...discussionIds) as any[]
      : [];

    return {
      version: 1,
      exportedAt: Date.now(),
      notebook: {
        name: notebookRow.name,
        systemPrompt: notebookRow.system_prompt ?? null,
        executionMode: (notebookRow.execution_mode ?? "xm") as ExecutionMode,
      },
      discussions: discussionRows.map((d: any) => ({ id: d.id, name: d.name, createdAt: d.created_at, totalTimeMs: d.total_time_ms })),
      cells: cellRows.map((c: any) => ({
        id: c.prompt_id, discussionId: c.discussion_id, parentId: c.parent_id ?? null,
        promptText: c.prompt_text, response: c.response, model: c.model,
        cellType: c.cell_type, createdAt: c.created_at,
      })),
    };
  }

  async exportNotebookSigned(notebookId: string): Promise<SignedPactExport | null> {
    const pactExport = this.exportNotebook(notebookId);
    if (!pactExport) return null;
    try {
      const response = await fetch(`${SIGN_SERVER}/sign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pactExport),
      });
      if (!response.ok) throw new Error(`Sign server responded with ${response.status}`);
      return response.json() as Promise<SignedPactExport>;
    } catch (e: any) {
      throw new Error(`Notebook signing failed: ${e.message}`);
    }
  }

  exportNotebookAsMarkdown(notebookId: string): string | null {
    const data = this.exportNotebook(notebookId);
    if (!data) return null;
    const lines: string[] = [];
    lines.push(`# ${data.notebook.name}`);
    if (data.notebook.systemPrompt) lines.push(`\n> **System Prompt:** ${data.notebook.systemPrompt}`);
    lines.push("");
    for (const discussion of data.discussions) {
      lines.push(`## ${discussion.name}`);
      lines.push("");
      const cells = data.cells.filter(c => c.discussionId === discussion.id);
      for (const cell of cells) {
        lines.push(`**Prompt:** ${cell.promptText}`);
        lines.push("");
        lines.push(`**Response:** ${cell.response}`);
        lines.push("");
        lines.push("---");
        lines.push("");
      }
    }
    return lines.join("\n");
  }

  async verifySignature(signed: SignedPactExport): Promise<VerifyResult> {
    try {
      const response = await fetch(`${SIGN_SERVER}/verify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signed),
      });
      if (!response.ok) return { valid: false, reason: `Verify server responded with ${response.status}` };
      return response.json() as Promise<VerifyResult>;
    } catch (e: any) {
      return { valid: false, reason: `Verification failed: ${e.message}` };
    }
  }

  importNotebook(data: PactExport): Notebook {
    const db = getDb(this.extensionPath);
    const notebookId = `notebook-${Date.now()}`;
    const createdAt = Date.now();
    // Imported notebooks from app.pactresearch.net default to Express mode
    const executionMode: ExecutionMode = data.notebook.executionMode ?? "express";

    db.prepare(`
      INSERT INTO notebooks (id, name, is_system, created_at, system_prompt, execution_mode)
      VALUES (?, ?, 0, ?, ?, ?)
    `).run(notebookId, data.notebook.name, createdAt, data.notebook.systemPrompt ?? null, executionMode);

    const discussionIdMap: Record<string, string> = {};
    for (const d of data.discussions) {
      const newId = `discussion-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      discussionIdMap[d.id] = newId;
      db.prepare(`
        INSERT INTO discussions (id, notebook_id, parent_id, name, created_at, total_time_ms)
        VALUES (?, ?, NULL, ?, ?, ?)
      `).run(newId, notebookId, d.name, d.createdAt, d.totalTimeMs);
    }

    const cellIdMap: Record<string, string> = {};
    for (const c of data.cells) {
      cellIdMap[c.id] = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
    for (const c of data.cells) {
      db.prepare(`
        INSERT INTO responses (prompt_id, prompt_text, response, model, cell_type, created_at, discussion_id, parent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        cellIdMap[c.id], c.promptText, c.response, c.model, c.cellType,
        c.createdAt, discussionIdMap[c.discussionId] ?? null,
        c.parentId ? (cellIdMap[c.parentId] ?? null) : null,
      );
    }

    return { id: notebookId, name: data.notebook.name, isSystem: false, createdAt, executionMode };
  }

  async importNotebookSigned(data: SignedPactExport): Promise<Notebook> {
    const result = await this.verifySignature(data);
    if (!result.valid) throw new Error(`Cannot import notebook: ${result.reason ?? "signature verification failed"}`);
    return this.importNotebook(data.payload);
  }
}
