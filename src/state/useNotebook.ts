// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
import { useState } from "react";
import type { Prompt, Run, ViewMode } from "../types/types";

function createInitialPrompt(): Prompt {
  return {
    id: crypto.randomUUID(),
    title: "prompt-01",
    draft: "Explain PACT architecture",
    runs: [],
  };
}

export function useNotebook() {
  const [prompts, setPrompts] = useState<Prompt[]>([
    createInitialPrompt(),
  ]);

  const [currentId, setCurrentId] = useState<string>(
    prompts[0].id
  );

  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("normal");

  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);

  const currentPrompt =
    prompts.find(p => p.id === currentId)!;

  function createPrompt() {
    const nextNumber = prompts.length + 1;

    const title = `prompt-${String(nextNumber).padStart(2, "0")}`;

    const newPrompt: Prompt = {
      id: crypto.randomUUID(),
      title,
      draft: "",
      runs: [],
    };

    setPrompts(prev => [...prev, newPrompt]);
    setCurrentId(newPrompt.id);
    setIsEditing(true);
    setSelectedRuns([]);
  }

  function selectPrompt(id: string) {
    setCurrentId(id);
    setIsEditing(true);
    setSelectedRuns([]);
  }

  function updateDraft(text: string) {
    setPrompts(prev =>
      prev.map(p =>
        p.id === currentId ? { ...p, draft: text } : p
      )
    );
  }

  function enableEdit() {
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  function runPrompt() {
    const version = currentPrompt.runs.length + 1;

    const newRun: Run = {
      id: crypto.randomUUID(),
      version,
      response: "Mock response",
      model: "GPT",
      timestamp: Date.now(),
    };

    setPrompts(prev =>
      prev.map(p =>
        p.id === currentId
          ? { ...p, runs: [...p.runs, newRun] }
          : p
      )
    );

    setIsEditing(false);
    setSelectedRuns([]);
  }

  function toggleRunSelection(id: string) {
    setSelectedRuns(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }

  function toggleView() {
    setViewMode(prev =>
      prev === "normal" ? "raw" : "normal"
    );
  }

  return {
    prompts,
    currentPrompt,
    currentId,

    isEditing,
    viewMode,

    selectedRuns,

    createPrompt,
    selectPrompt,
    updateDraft,
    enableEdit,
    cancelEdit,
    runPrompt,

    toggleView,
    toggleRunSelection,
    setViewMode
  };
}