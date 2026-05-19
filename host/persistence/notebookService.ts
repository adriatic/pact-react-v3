// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
// Copyright © 2026 Pact Research LLC. All rights reserved.\n// pactresearch.net
import * as fs from "fs";
import * as path from "path";
import { getPactRoot, ensureDir, isSystemNotebook } from "./storage";

export function listNotebooks(): string[] {
  const root = getPactRoot();

  return fs.readdirSync(root).filter(name => {
    const fullPath = path.join(root, name);
    return fs.statSync(fullPath).isDirectory();
  });
}

export function createUserNotebook(): string {
  const root = getPactRoot();

  const existing = listNotebooks()
    .filter(n => n.startsWith("notebook-"));

  const nextIndex = existing.length + 1;
  const notebookId = `notebook-${nextIndex}`;

  const notebookPath = path.join(root, notebookId);
  ensureDir(notebookPath);

  return notebookId;
}

export function getNotebookPath(notebookId: string): string {
  return path.join(getPactRoot(), notebookId);
}

export function assertWritable(notebookId: string) {
  if (isSystemNotebook(notebookId)) {
    throw new Error(`Notebook ${notebookId} is read-only`);
  }
}