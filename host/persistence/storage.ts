// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
// Copyright © 2026 Pact Research LLC. All rights reserved.\n// pactresearch.net
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// 🔥 Root storage folder (NO workspace dependency)
export function getPactRoot(): string {
  const homeDir = os.homedir();
  const pactRoot = path.join(homeDir, "pact-data");

  ensureDir(pactRoot);

  return pactRoot;
}

// 🔥 Ensure directory exists
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 🔥 Notebook root folder
export function getNotebookRoot(): string {
  const root = path.join(getPactRoot(), "notebooks");
  ensureDir(root);
  return root;
}

// 🔥 Specific notebook folder
export function getNotebookFolder(notebookId: string): string {
  const folder = path.join(getNotebookRoot(), notebookId);
  ensureDir(folder);
  return folder;
}

// 🔥 Identify system notebooks (read-only later)
export function isSystemNotebook(notebookId: string): boolean {
  return notebookId.startsWith("core-") || notebookId.startsWith("system-");
}