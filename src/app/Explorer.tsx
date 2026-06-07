// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
import React, { useState, useEffect } from "react";

export type Notebook = {
    id: string;
    name: string;
    isSystem: boolean;
};

export type Discussion = {
    id: string;
    notebookId: string;
    parentId?: string;
    name: string;
    totalTimeMs: number;
};

type Props = {
    notebooks: Notebook[];
    discussions: Discussion[];
    activeDiscussionId: string | null;
    onSelectDiscussion: (discussion: Discussion) => void;
    onCreateNotebook: (name: string) => void;
    onCreateDiscussion: (notebookId: string, name: string) => void;
    corePrompts: { id: string; title: string; teaser: string; text: string }[];
    onSelectPrompt: (text: string) => void;
    onDeleteDiscussion: (discussionId: string) => void;
    onDeleteNotebook: (notebookId: string) => void;
    onExportNotebook: (notebookId: string) => void;
    onExportObsidian: (notebookId: string) => void;
    onImportNotebook: () => void;
};

export default function Explorer({
    notebooks,
    discussions,
    activeDiscussionId,
    onSelectDiscussion,
    onCreateDiscussion,
    corePrompts,
    onSelectPrompt,
    onDeleteDiscussion,
    onDeleteNotebook,
    onExportNotebook,
    onExportObsidian,
}: Props) {
    const [exportMenuId, setExportMenuId] = useState<string | null>(null);
    useEffect(() => {
        function handleClickOutside() { setExportMenuId(null); }
        if (exportMenuId) {
            document.addEventListener("click", handleClickOutside);
            return () => document.removeEventListener("click", handleClickOutside);
        }
    }, [exportMenuId]); const [expandedNotebooks, setExpandedNotebooks] = useState<Record<string, boolean>>(
        { "notebook-tutorial": false, "notebook-general": true }
    );
    const [newDiscussionName, setNewDiscussionName] = useState("");
    const [newDiscussionTarget, setNewDiscussionTarget] = useState<string | null>(null);

    const [hoveredId, setHoveredId] = useState<string | null>(null);

    function toggleNotebook(id: string) {
        setExpandedNotebooks(prev => ({ ...prev, [id]: !prev[id] }));
    }

    function submitNewDiscussion(notebookId: string) {
        const name = newDiscussionName.trim();
        if (!name) return;
        onCreateDiscussion(notebookId, name);
        setNewDiscussionName("");
        setNewDiscussionTarget(null);
    }

    function formatTime(ms: number): string {
        if (ms < 1000) return "";
        const s = Math.round(ms / 1000);
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m ${s % 60}s`;
    }

    return (
        <div style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: "#1a1a1a",
            borderRight: "1px solid #333",
            overflow: "hidden",
        }}>
            {/* Explorer header — label only */}
            <div style={{
                padding: "10px 12px",
                fontSize: "0.75em",
                color: "#888",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                borderBottom: "1px solid #333",
                flexShrink: 0,
            }}>
                <span>Explorer</span>
            </div>

            {/* Notebook tree */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {notebooks.map(notebook => {
                    const isExpanded = expandedNotebooks[notebook.id] ?? false;
                    const notebookDiscussions = discussions.filter(
                        d => d.notebookId === notebook.id
                    );

                    return (
                        <div key={notebook.id}>
                            {/* Notebook row */}
                            <div
                                onMouseEnter={() => setHoveredId(notebook.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onClick={() => toggleNotebook(notebook.id)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 12px",
                                    cursor: "pointer",
                                    color: "#ccc",
                                    fontSize: "0.9em",
                                    userSelect: "none",
                                }}
                            >
                                <span style={{ fontSize: "0.7em", opacity: 0.6 }}>
                                    {isExpanded ? "▼" : "▶"}
                                </span>
                                <span>{notebook.isSystem ? "🔒" : "📓"}</span>
                                <span style={{ flex: 1 }}>{notebook.name}</span>
                                {!notebook.isSystem && (
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                        <div style={{ position: "relative" }}>
                                            <span
                                                onClick={e => { e.stopPropagation(); setExportMenuId(exportMenuId === notebook.id ? null : notebook.id); }}
                                                title="Export"
                                                style={{ color: "#888", fontSize: "1.4em", padding: "0 2px", cursor: "pointer", lineHeight: 1 }}
                                            >↑</span>
                                            {exportMenuId === notebook.id && (
                                                <div style={{
                                                    position: "absolute", right: 0, top: "100%", zIndex: 100,
                                                    background: "#1e1e1e", border: "1px solid #444", borderRadius: 6,
                                                    padding: "6px 0", minWidth: 120, boxShadow: "0 4px 12px rgba(0,0,0,0.4)"
                                                }}>
                                                    <div
                                                        onClick={e => { e.stopPropagation(); onExportNotebook(notebook.id); setExportMenuId(null); }}
                                                        style={{ padding: "6px 14px", cursor: "pointer", color: "#4ec94e", fontSize: "0.9em" }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = "#2a2a2a")}
                                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                                    >↑ Export .pact</div>
                                                    <div
                                                        onClick={e => { e.stopPropagation(); onExportObsidian(notebook.id); setExportMenuId(null); }}
                                                        style={{ padding: "6px 14px", cursor: "pointer", color: "#a78bfa", fontSize: "0.9em" }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = "#2a2a2a")}
                                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                                    >↑ Export Obsidian</div>
                                                </div>
                                            )}
                                        </div>
                                        <span
                                            onClick={e => { e.stopPropagation(); onDeleteNotebook(notebook.id); }}
                                            style={{ color: "#777", fontSize: "1.4em", padding: "0 2px", cursor: "pointer", lineHeight: 1 }}
                                            onMouseEnter={e => (e.currentTarget.style.color = "#e05252")}
                                            onMouseLeave={e => (e.currentTarget.style.color = "#777")}
                                        >✕</span>
                                    </div>
                                )}
                            </div>

                            {/* Discussions */}
                            {isExpanded && (
                                <div>
                                    {notebookDiscussions.map(discussion => {
                                        const isActive = discussion.id === activeDiscussionId;
                                        const time = formatTime(discussion.totalTimeMs);

                                        return (
                                            <div
                                                key={discussion.id}
                                                onMouseEnter={() => setHoveredId(discussion.id)}
                                                onMouseLeave={() => setHoveredId(null)}
                                                onClick={() => {
                                                    onSelectDiscussion(discussion);
                                                    const match = discussion.id.match(/^discussion-tutorial-(\d+)$/);
                                                    if (match) {
                                                        const id = match[1];
                                                        const prompt = corePrompts.find(p => p.id === id);
                                                        if (prompt) onSelectPrompt(prompt.teaser);
                                                    }
                                                }}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                    padding: "3px 12px 3px 28px",
                                                    cursor: "pointer",
                                                    background: isActive ? "#094771" : "transparent",
                                                    color: isActive ? "#fff" : "#aaa",
                                                    fontSize: "0.85em",
                                                    userSelect: "none",
                                                }}
                                            >
                                                <span>💬</span>
                                                <span style={{ flex: 1 }}>{discussion.name}</span>
                                                {time && hoveredId !== discussion.id && (
                                                    <span style={{ fontSize: "0.8em", opacity: 0.6 }}>
                                                        {time}
                                                    </span>
                                                )}
                                                {hoveredId === discussion.id && (!notebook.isSystem || notebook.id === "notebook-drafts") && (
                                                    <span
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            onDeleteDiscussion(discussion.id);
                                                        }}
                                                        style={{
                                                            color: "#777", fontSize: "1.1em",
                                                            padding: "0 2px", cursor: "pointer", lineHeight: 1,
                                                        }}
                                                        onMouseEnter={e => (e.currentTarget.style.color = "#e05252")}
                                                        onMouseLeave={e => (e.currentTarget.style.color = "#777")}
                                                    >✕</span>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* New discussion input */}
                                    {newDiscussionTarget === notebook.id ? (
                                        <div style={{ padding: "4px 12px 4px 28px" }}>
                                            <input
                                                autoFocus
                                                value={newDiscussionName}
                                                onChange={e => setNewDiscussionName(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") submitNewDiscussion(notebook.id);
                                                    if (e.key === "Escape") setNewDiscussionTarget(null);
                                                }}
                                                placeholder="Discussion name..."
                                                style={{
                                                    width: "100%",
                                                    background: "#2d2d2d",
                                                    border: "1px solid #555",
                                                    borderRadius: 3,
                                                    color: "#ccc",
                                                    padding: "2px 6px",
                                                    fontSize: "0.85em",
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        !notebook.isSystem && (
                                            <div
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setNewDiscussionTarget(notebook.id);
                                                    setNewDiscussionName("");
                                                }}
                                                style={{
                                                    padding: "2px 12px 2px 28px",
                                                    color: "#555",
                                                    fontSize: "0.8em",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                + New Discussion
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
