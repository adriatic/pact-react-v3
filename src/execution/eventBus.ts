// Copyright © 2026 PACTResearch.net. All rights reserved.
// pactresearch.net
export type CellType = "tutorial" | "user";

export type ExecutionEvent =
  | { type: "cellStarted"; cellId: string; parentId?: string; label?: string; cellType: CellType; promptText?: string }
  | { type: "cellStream"; cellId: string; chunk: string }
  | { type: "cellCompleted"; cellId: string; elapsedMs: number }
  | { type: "cellError"; cellId: string; error: string }
  | { type: "cellPaused"; cellId: string; stoppedAfterSection: number; totalSections: number }
  | { type: "xmTocReady"; toc: string[]; completedSections: number[]; activeCellId: string; discussionId: string }
  | { type: "xmStateRestored"; toc: string[]; completedSections: number[]; activeCellId: string; discussionId: string };

type Listener = (event: ExecutionEvent) => void;

class EventBus {
  private listeners: Listener[] = [];

  emit(event: ExecutionEvent) {
    for (const l of this.listeners) l(event);
  }

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

export const eventBus = new EventBus();
