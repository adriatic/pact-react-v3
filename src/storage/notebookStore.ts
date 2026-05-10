import { getDb } from "./db";

export type Notebook = {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: number;
};

export type Discussion = {
  id: string;
  notebookId: string;
  parentId?: string;
  name: string;
  createdAt: number;
  totalTimeMs: number;
};

export type PactExport = {
  version: number;
  exportedAt: number;
  notebook: {
    name: string;
    systemPrompt: string | null;
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
    }));
  }

  createNotebook(name: string, systemPrompt: string | null = null): Notebook {
    const db = getDb(this.extensionPath);
    const id = `notebook-${Date.now()}`;
    const createdAt = Date.now();

    db.prepare(`
    INSERT INTO notebooks (id, name, is_system, created_at, system_prompt)
    VALUES (?, ?, 0, ?, ?)
  `).run(id, name, createdAt, systemPrompt);

    return { id, name, isSystem: false, createdAt };
  }

  // ── Discussions ───────────────────────────────────────────────────────────

  getDiscussionsForNotebook(notebookId: string): Discussion[] {
    const db = getDb(this.extensionPath);

    const rows = db
      .prepare(`
        SELECT * FROM discussions
        WHERE notebook_id = ?
        ORDER BY created_at ASC
      `)
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
      .prepare(`
      SELECT * FROM responses
      WHERE discussion_id = ?
      ORDER BY created_at ASC
    `)
      .all(discussionId) as any[];

    return rows.map(r => ({
      id: r.prompt_id,
      parentId: r.parent_id ?? undefined,
      response: r.response,
      status: "done",
      elapsedMs: 0,
      label: r.cell_type === "tutorial" ? r.prompt_id : undefined,
      promptText: r.prompt_text,
      model: r.model,
      timestamp: r.created_at,
    }));
  }

  createDiscussion(
    notebookId: string,
    name: string,
    parentId?: string,
  ): Discussion {
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

    // Ensure a discussion record exists in the Drafts notebook for this discussion
    const existing = db
      .prepare("SELECT id FROM discussions WHERE id = ?")
      .get(draftId) as { id: string } | undefined;

    if (!existing) {
      db.prepare(`
        INSERT INTO discussions (id, notebook_id, parent_id, name, created_at, total_time_ms)
        VALUES (?, 'notebook-drafts', NULL, ?, ?, 0)
      `).run(draftId, discussionId, Date.now());
    }

    // Upsert the draft response record
    db.prepare(`
      INSERT OR REPLACE INTO responses
        (prompt_id, prompt_text, response, model, cell_type, created_at, discussion_id, parent_id)
      VALUES (?, ?, '', 'gpt', 'draft', ?, ?, NULL)
    `).run(draftId, promptText, Date.now(), draftId);
  }

  getDraft(discussionId: string): string | null {
    const db = getDb(this.extensionPath);
    const draftId = `draft-${discussionId}`;

    const row = db
      .prepare("SELECT prompt_text FROM responses WHERE prompt_id = ?")
      .get(draftId) as { prompt_text: string } | undefined;

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

    db.prepare(`
      UPDATE discussions
      SET total_time_ms = total_time_ms + ?
      WHERE id = ?
    `).run(elapsedMs, discussionId);
  }

  getDefaultDiscussionId(): string {
    return "discussion-default";
  }

  getSystemPrompt(notebookId: string): string | null {
    const db = getDb(this.extensionPath);

    const row = db
      .prepare("SELECT system_prompt FROM notebooks WHERE id = ?")
      .get(notebookId) as { system_prompt: string | null } | undefined;

    return row?.system_prompt ?? null;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportNotebook(notebookId: string): PactExport | null {
    const db = getDb(this.extensionPath);

    const notebookRow = db
      .prepare("SELECT * FROM notebooks WHERE id = ?")
      .get(notebookId) as any;

    if (!notebookRow) return null;

    const discussionRows = db
      .prepare("SELECT * FROM discussions WHERE notebook_id = ? ORDER BY created_at ASC")
      .all(notebookId) as any[];

    const discussionIds = discussionRows.map((d: any) => d.id);

    const cellRows = discussionIds.length > 0
      ? db.prepare(`
          SELECT * FROM responses
          WHERE discussion_id IN (${discussionIds.map(() => "?").join(",")})
          ORDER BY created_at ASC
        `).all(...discussionIds) as any[]
      : [];

    return {
      version: 1,
      exportedAt: Date.now(),
      notebook: {
        name: notebookRow.name,
        systemPrompt: notebookRow.system_prompt ?? null,
      },
      discussions: discussionRows.map((d: any) => ({
        id: d.id,
        name: d.name,
        createdAt: d.created_at,
        totalTimeMs: d.total_time_ms,
      })),
      cells: cellRows.map((c: any) => ({
        id: c.prompt_id,
        discussionId: c.discussion_id,
        parentId: c.parent_id ?? null,
        promptText: c.prompt_text,
        response: c.response,
        model: c.model,
        cellType: c.cell_type,
        createdAt: c.created_at,
      })),
    };
  }

  // ── Import ────────────────────────────────────────────────────────────────

  importNotebook(data: PactExport): Notebook {
    const db = getDb(this.extensionPath);

    const notebookId = `notebook-${Date.now()}`;
    const createdAt = Date.now();

    db.prepare(`
      INSERT INTO notebooks (id, name, is_system, created_at, system_prompt)
      VALUES (?, ?, 0, ?, ?)
    `).run(notebookId, data.notebook.name, createdAt, data.notebook.systemPrompt ?? null);

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
      const newCellId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      cellIdMap[c.id] = newCellId;
    }

    for (const c of data.cells) {
      const newCellId = cellIdMap[c.id];
      const newDiscussionId = discussionIdMap[c.discussionId] ?? null;
      const newParentId = c.parentId ? (cellIdMap[c.parentId] ?? null) : null;

      db.prepare(`
        INSERT INTO responses
          (prompt_id, prompt_text, response, model, cell_type,
           created_at, discussion_id, parent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newCellId,
        c.promptText,
        c.response,
        c.model,
        c.cellType,
        c.createdAt,
        newDiscussionId,
        newParentId,
      );
    }

    return {
      id: notebookId,
      name: data.notebook.name,
      isSystem: false,
      createdAt,
    };
  }
}
