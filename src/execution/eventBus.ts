// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
export type CellType = "tutorial" | "user";

export type ExecutionEvent =
  | { type: "cellStarted"; cellId: string; parentId?: string; label?: string; cellType: CellType; promptText?: string }
  | { type: "cellStream"; cellId: string; chunk: string }
  | { type: "cellCompleted"; cellId: string; elapsedMs: number }
  | { type: "cellError"; cellId: string; error: string };
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