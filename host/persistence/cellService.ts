// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
// Copyright © 2026 Pact Research LLC. All rights reserved.\n// pactresearch.net
import * as fs from "fs";
import * as path from "path";

export function createNextCell(notebookPath: string) {
  const cells = fs.readdirSync(notebookPath)
    .filter(name => name.startsWith("cell-"));

  const nextIndex = cells.length + 1;
  const cellId = `cell-${String(nextIndex).padStart(2, "0")}`;

  const cellPath = path.join(notebookPath, cellId);
  fs.mkdirSync(cellPath);

  return { cellId, cellPath };
}

export function writePrompt(cellPath: string, content: string) {
  const filePath = path.join(cellPath, "prompt.json");

  fs.writeFileSync(filePath, JSON.stringify({
    timestamp: new Date().toISOString(),
    content,
    status: "completed"
  }, null, 2));
}

export function writeResponse(cellPath: string, content: string) {
  const filePath = path.join(cellPath, "response.json");

  fs.writeFileSync(filePath, JSON.stringify({
    timestamp: new Date().toISOString(),
    content,
    model: "mock-llm"
  }, null, 2));
}

export function readAllCells(notebookPath: string) {
  const fs = require("fs");
  const path = require("path");

  const cells = fs.readdirSync(notebookPath)
    .filter((name: string) => name.startsWith("cell-"))
    .sort();

  return cells.map((cellId: string) => {
    const cellPath = path.join(notebookPath, cellId);

    const promptPath = path.join(cellPath, "prompt.json");
    const responsePath = path.join(cellPath, "response.json");

    const prompt = fs.existsSync(promptPath)
      ? JSON.parse(fs.readFileSync(promptPath, "utf-8"))
      : null;

    const response = fs.existsSync(responsePath)
      ? JSON.parse(fs.readFileSync(responsePath, "utf-8"))
      : null;

    return {
      cellId,
      prompt,
      response
    };
  });
}