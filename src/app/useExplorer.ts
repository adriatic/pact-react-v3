// Copyright © 2026 PACTResearch.net. All rights reserved.
import { useEffect, useState } from "react";
import type { Notebook, Discussion } from "./Explorer";

type ExplorerMessage =
    | { type: "notebooksLoaded"; notebooks: Notebook[]; discussions: Discussion[] }
    | { type: "notebookCreated"; notebook: Notebook; discussions?: Discussion[] }
    | { type: "notebookImported"; notebook: Notebook; discussions: Discussion[] }
    | { type: "discussionCreated"; discussion: Discussion }
    | { type: "discussionDeleted"; discussionId: string }
    | { type: "notebookDeleted"; notebookId: string }
    | { type: "discussionsImported"; notebookId: string; discussions: Discussion[] };

declare const acquireVsCodeApi: any;

export function useExplorer(vscode: any) {
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [discussions, setDiscussions] = useState<Discussion[]>([]);
    const [activeDiscussionId, setActiveDiscussionId] = useState<string | null>(
        "discussion-tutorial-00"
    );
    const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null);

    // Request initial data on mount
    useEffect(() => {
        vscode.postMessage({ type: "EXPLORER_LOAD" });
    }, []);

    // Handle messages from extension host
    useEffect(() => {
        function handler(event: MessageEvent) {
            const data: ExplorerMessage = event.data;

            switch (data.type) {
                case "notebooksLoaded":
                    setNotebooks(data.notebooks);
                    setDiscussions(data.discussions);
                    break;

                case "notebookCreated": {
                    setNotebooks(prev => [...prev, data.notebook]);
                    setActiveNotebookId(data.notebook.id);

                    const newDiscussions = data.discussions ?? [];
                    if (newDiscussions.length > 0) {
                        setDiscussions(prev => [...prev, ...newDiscussions]);
                        // Index-mode notebooks arrive with exactly one seed discussion —
                        // auto-select it, mirroring what a manual Explorer click does,
                        // so the composer pre-populates without any user action.
                        const seed = newDiscussions[0];
                        setActiveDiscussionId(seed.id);
                        vscode.postMessage({ type: "LOAD_DISCUSSION_CELLS", discussionId: seed.id });
                    }
                    // Interactive-mode notebooks arrive with zero discussions —
                    // notebook is selected, but no discussion is auto-selected,
                    // leaving the user to create their own first discussion.
                    break;
                }

                case "notebookImported": {
                    // notebooksLoaded (sent just before this) already replaced
                    // the full notebooks/discussions lists — this only sets
                    // which notebook/discussion should now be active, so the
                    // composer reflects the import instead of leaving whatever
                    // discussion happened to be active beforehand.
                    setActiveNotebookId(data.notebook.id);
                    if (data.discussions.length > 0) {
                        const first = data.discussions[0];
                        setActiveDiscussionId(first.id);
                        vscode.postMessage({ type: "LOAD_DISCUSSION_CELLS", discussionId: first.id });
                    }
                    break;
                }

                case "discussionCreated":
                    setDiscussions(prev => [...prev, data.discussion]);
                    setActiveDiscussionId(data.discussion.id);
                    break;

                case "discussionDeleted":
                    setDiscussions(prev => prev.filter(d => d.id !== data.discussionId));
                    setActiveDiscussionId(prev =>
                        prev === data.discussionId ? null : prev
                    );
                    break;

                case "notebookDeleted":
                    setDiscussions(prev => {
                        const remaining = prev.filter(d => d.notebookId !== data.notebookId);
                        // If active discussion belonged to deleted notebook, clear it
                        setActiveDiscussionId(active => {
                            const activeWasInNotebook = prev.some(
                                d => d.id === active && d.notebookId === data.notebookId
                            );
                            return activeWasInNotebook ? null : active;
                        });
                        return remaining;
                    });
                    setNotebooks(prev => prev.filter(n => n.id !== data.notebookId));
                    break;

                case "discussionsImported":
                    setDiscussions(prev => [...prev, ...data.discussions]);
                    break;
            }
        }

        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, []);

    function selectDiscussion(discussion: Discussion) {
        setActiveDiscussionId(discussion.id);
        setActiveNotebookId(discussion.notebookId);
        if (!discussion.id.startsWith("discussion-tutorial-") &&
            !discussion.id.startsWith("draft-")) {
            vscode.postMessage({ type: "LOAD_DISCUSSION_CELLS", discussionId: discussion.id });
        }
    }

    function createNotebook(name: string) {
        vscode.postMessage({ type: "CREATE_NOTEBOOK", name });
    }

    function createDiscussion(notebookId: string, name: string) {
        vscode.postMessage({ type: "CREATE_DISCUSSION", notebookId, name });
    }

    function deleteDiscussion(discussionId: string) {
        vscode.postMessage({ type: "DELETE_DISCUSSION", discussionId });
    }

    function deleteNotebook(notebookId: string) {
        vscode.postMessage({ type: "DELETE_NOTEBOOK", notebookId });
    }

    function exportNotebook(notebookId: string) {
        console.log("exportNotebook called:", notebookId);
        vscode.postMessage({ type: "EXPORT_NOTEBOOK", notebookId });
    }

    function importNotebook() {
        vscode.postMessage({ type: "IMPORT_NOTEBOOK" });
    }

    function exportObsidian(notebookId: string) {
        vscode.postMessage({ type: "EXPORT_OBSIDIAN", notebookId });
    }

    return {
        notebooks,
        discussions,
        activeDiscussionId,
        activeNotebookId,
        selectDiscussion,
        createNotebook,
        createDiscussion,
        deleteDiscussion,
        deleteNotebook,
        exportNotebook,
        importNotebook,
        exportObsidian,
    };
}
