// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
import { getDb } from "./db";

export type StoredResponse = {
  promptId: string;
  promptText: string;
  response: string;
  model: string;
  cellType: string;
  imageData?: string;
  imageMimeType?: string;
  createdAt: number;
  parentId?: string;
  discussionId?: string;
};

export class ResponseStore {
  private extensionPath: string;

  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  get(promptId: string): StoredResponse | null {
    const db = getDb(this.extensionPath);
    const row = db
      .prepare(`
      SELECT prompt_id, prompt_text, response, model, cell_type,
             image_data, image_mime_type, created_at, parent_id, discussion_id
      FROM responses
      WHERE prompt_id = ?
    `)
      .get(promptId) as any;

    if (!row) return null;
    return {
      promptId: row.prompt_id,
      promptText: row.prompt_text,
      response: row.response,
      model: row.model,
      cellType: row.cell_type,
      imageData: row.image_data ?? undefined,
      imageMimeType: row.image_mime_type ?? undefined,
      createdAt: row.created_at,
      parentId: row.parent_id ?? undefined,
      discussionId: row.discussion_id ?? undefined,
    };
  }

  save(
    promptId: string,
    promptText: string,
    response: string,
    model: string,
    cellType: string,
    imageData?: string,
    imageMimeType?: string,
    parentId?: string,
    discussionId?: string,
  ): void {
    const db = getDb(this.extensionPath);
    db.prepare(`
    INSERT OR REPLACE INTO responses
      (prompt_id, prompt_text, response, model, cell_type,
       image_data, image_mime_type, created_at, parent_id, discussion_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
      promptId,
      promptText,
      response,
      model,
      cellType,
      imageData ?? null,
      imageMimeType ?? null,
      Date.now(),
      parentId ?? null,
      discussionId ?? null,
    );
  }

}