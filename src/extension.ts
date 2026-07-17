// Copyright © 2026 PACTResearch.net. All rights reserved.
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { eventBus } from "./execution/eventBus";
import { ExecutionEngine } from "./execution/ExecutionEngine";
import { LLMRouter } from "./llm/llmRouter";
import { corePrompts } from "./prompts/core";
import { NotebookStore } from "./storage/notebookStore";
import type { SerializedContentBlock } from "./types/contentBlock";

export function activate(context: vscode.ExtensionContext) {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8")
  );

  const panel = vscode.window.createWebviewPanel(
    "pact",
    "PACT",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "out")),
      ],
    }
  );

  const scriptUri = panel.webview.asWebviewUri(
    vscode.Uri.file(
      path.join(context.extensionPath, "out", "index.js")
    )
  );
  console.log("PACT scriptUri:", scriptUri.toString());

  panel.webview.html = `
    <!DOCTYPE html>
    <html>
      <body>
        <div id="root"></div>

        <script>
          (function () {
            const vscode = acquireVsCodeApi();
            window.vscode = vscode;
            window.acquireVsCodeApi = () => vscode;
            window.PACT_VERSION = "${version}";
          })();
        </script>

        <script src="${scriptUri}"></script>
      </body>
    </html>
  `;

  console.log("PACT: webview HTML set, length:", panel.webview.html.length);

  const router = new LLMRouter();
  // Ensure persistent config directory exists
  const globalStoragePath = context.globalStorageUri.fsPath;
  if (!fs.existsSync(globalStoragePath)) {
    fs.mkdirSync(globalStoragePath, { recursive: true });
  }
  const notebookStore = new NotebookStore(context.extensionPath);
  let userSystemPrompt: string = "";

  function initRouter() {
    try {
      const configPath = path.join(context.globalStorageUri.fsPath, "config.json"); if (!fs.existsSync(configPath)) {
        // No config at all — show setup
        panel.webview.postMessage({ type: "showSetup" });
        return;
      }
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (!config.anthropicApiKey && !config.openaiApiKey) {
        // Config exists but no keys — show setup
        panel.webview.postMessage({ type: "showSetup" });
        return;
      }
      router.setApiKey(config.openaiApiKey);
      router.setClaudeKey(config.anthropicApiKey);
      if (config.user) {
        userSystemPrompt =
          `The following is information about the user conducting this conversation:\n` +
          `Name: ${config.user.name}\n` +
          `Email: ${config.user.email}\n` +
          `Context: ${config.user.context}`;
      }
    } catch (err: any) {
      console.error("PACT: failed to load config.json:", err.message);
      panel.webview.postMessage({ type: "showSetup" });
    }
  }

  const engine = new ExecutionEngine(router, context.extensionPath);

  eventBus.subscribe((event) => {
    panel.webview.postMessage(event);
  });

  function resolvePrompt(raw: string): {
    text: string;
    label?: string;
    cellType: "tutorial" | "user";
    promptId?: string;
  } {
    const match = raw.match(/^\/prompt\s+(\d+)/i);

    if (match) {
      const id = match[1].padStart(2, "0");
      const found = corePrompts.find(p => p.id === id);

      if (found) {
        return {
          text: found.text,
          label: `${found.id} · ${found.title}`,
          cellType: "tutorial",
          promptId: found.id,
        };
      }
    }

    return { text: raw, cellType: "user" };
  }

  function resolveCellRefs(text: string): string {
    return text.replace(/\[Cell ([^\]]+)\]/g, (match, cellId) => {
      const cell = notebookStore.getCellById(cellId.trim());
      if (cell) {
        return `[Referenced Cell]\nPrompt: ${cell.promptText}\nResponse: ${cell.response}\n---\n`;
      }
      return match;
    });
  }

  panel.webview.onDidReceiveMessage(async (message) => {
    console.log("PACT: CHECK_CONFIG received");
    const configPath = path.join(context.globalStorageUri.fsPath, "config.json");
    if (message.type === "CHECK_CONFIG") {
      const needsSetup = !fs.existsSync(configPath) || (() => {
        try {
          const c = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          return !c.anthropicApiKey?.trim() && !c.openaiApiKey?.trim();
        } catch { return true; }
      })();

      if (needsSetup) {
        panel.webview.postMessage({ type: "showSetup" });
      } else {
        initRouter();
        panel.webview.postMessage({ type: "setupComplete" });
      }
      return;
    }

    if (message.type === "SAVE_CONFIG") {
      const configPath = path.join(context.globalStorageUri.fsPath, "config.json"); const config = {
        user: {
          name: message.name ?? "",
          email: message.email ?? "",
          context: message.context ?? "",
        },
        anthropicApiKey: message.anthropicApiKey ?? "",
        openaiApiKey: message.openaiApiKey ?? "",
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
      initRouter();
      panel.webview.postMessage({ type: "setupComplete" });
      return;
    }

    if (message.type === "GET_CONFIG") {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        const systemPrompt = message.notebookId
          ? notebookStore.getSystemPrompt(message.notebookId)
          : null;
        panel.webview.postMessage({
          type: "configLoaded",
          name: config.user?.name ?? "",
          email: config.user?.email ?? "",
          context: config.user?.context ?? "",
          anthropicApiKey: config.anthropicApiKey ?? "",
          openaiApiKey: config.openaiApiKey ?? "",
          systemPrompt: systemPrompt ?? "",
        });
      } catch {
        panel.webview.postMessage({
          type: "configLoaded",
          name: "", email: "", context: "",
          anthropicApiKey: "", openaiApiKey: "", systemPrompt: ""
        });
      }
      return;
    }

    if (message.type === "UPDATE_SYSTEM_PROMPT") {
      notebookStore.updateSystemPrompt(message.notebookId, message.systemPrompt ?? null);
      panel.webview.postMessage({ type: "systemPromptUpdated", notebookId: message.notebookId });
      return;
    }

    if (message.type === "GET_IPR_MESSAGES") {
      const messages = notebookStore.getIprMessages(message.notebookId);
      panel.webview.postMessage({ type: "iprMessagesLoaded", notebookId: message.notebookId, messages });
      return;
    }

    if (message.type === "SAVE_IPR_MESSAGES") {
      notebookStore.saveIprMessages(message.notebookId, message.messages);
      return;
    }

    if (message.type === "IPR_REFINE") {
      const messages = message.messages as { role: string; content: string }[];
      const model = message.model ?? "claude";
      const resolvedModel = message.resolvedModel;

      // Messages passed directly to runMultiTurn — no serialization needed

      const systemMsg = `You are helping a researcher define a system prompt for a PACT research notebook.
A PACT system prompt anchors all research discussions — it defines the researcher's role, domain, analytical stance, and constraints.

RULES:
- Ask clarifying questions first. Do not generate a system prompt until you know: (1) the research domain, (2) the researcher's role or expertise, (3) the analytical stance they want.
- Ask ONE question per response until you have enough information.
- Only after you have the domain and role clearly defined, output the system prompt in this exact format:
SYSTEM_PROMPT_START
<the system prompt>
SYSTEM_PROMPT_END
- After outputting a system prompt, ask if the researcher wants to refine it further.
- Never generate a generic placeholder — wait for real domain information.`;

      try {
        const response = await router.runMultiTurn(
          model,
          messages,
          systemMsg,
          resolvedModel,
        );
        panel.webview.postMessage({ type: "iprResponse", content: response });
      } catch (err: any) {
        panel.webview.postMessage({ type: "iprError", error: err.message });
      }


      return;
    }

    if (message.type === "SAVE_EXECUTION_MODE") {
      notebookStore.saveExecutionMode(message.notebookId, message.mode);
      panel.webview.postMessage({ type: "executionModeSaved", notebookId: message.notebookId, mode: message.mode });
      return;
    }

    if (message.type === "GET_EXECUTION_MODE") {
      const mode = notebookStore.getExecutionMode(message.notebookId);
      const researchQuestion = notebookStore.getIprResearchQuestion(message.notebookId);
      panel.webview.postMessage({ type: "executionModeLoaded", notebookId: message.notebookId, mode, researchQuestion });
      return;
    }

    if (message.type === "SAVE_IPR_RESEARCH_QUESTION") {
      notebookStore.saveIprResearchQuestion(message.notebookId, message.question);
      return;
    }




    try {
      // ── Execution ────────────────────────────────────────────────────────

      if (message.type === "RUN_REQUESTED") {
        const blocks: SerializedContentBlock[] = message.blocks ?? [];
        const model = message.model ?? "gpt";
        const discussionId = message.discussionId ?? "discussion-default";

        const firstText = resolveCellRefs(blocks.find((b) => b.type === "text")?.text?.trim() ?? "");
        const { text, label, cellType, promptId } = resolvePrompt(firstText);

        if (cellType === "tutorial") {
          await engine.runPrompt(
            text, undefined, label, cellType, promptId,
            [], "gpt", discussionId,
          );
        } else {
          await engine.runPrompt(
            text, undefined, label, cellType, promptId,
            blocks, model, discussionId, userSystemPrompt,
            message.resolvedModel,
          );
        }
      }

      if (message.type === "RETRY_CELL") {
        await engine.retryCell(message.cellId, message.model);
      }

      if (message.type === "CONTINUE_RUN") {
        await engine.continueRun(
          message.selectedSections,
          message.cellId,
          message.toc,
          message.model ?? "claude",
          message.resolvedModel,
          message.discussionId,
          userSystemPrompt,
        );
      }

      if (message.type === "ABORT_RUN") {
        engine.abortRun(message.discussionId);
        // Abort has no meaningful "resume" today — there's no way to continue
        // partial work, so leaving a half-finished notebook around is just
        // confusing. Delete it entirely; the expectation is re-importing the
        // original .pact file to start fresh, same mechanism as any other
        // notebook deletion + import.
        const notebookId = notebookStore.getNotebookIdForDiscussion(message.discussionId);
        if (notebookId) {
          notebookStore.deleteNotebook(notebookId);
          panel.webview.postMessage({ type: "notebookDeleted", notebookId });
        } else {
          console.warn("PACT: ABORT_RUN could not resolve notebookId for discussion", message.discussionId);
        }
      }

      // ── Explorer ─────────────────────────────────────────────────────────

      if (message.type === "EXPLORER_LOAD") {

        const notebooks = notebookStore.getAllNotebooks();
        const allDiscussions = notebooks.flatMap(nb =>
          notebookStore.getDiscussionsForNotebook(nb.id)
        );

        panel.webview.postMessage({
          type: "notebooksLoaded",
          notebooks,
          discussions: allDiscussions,
        });

        // Delay restore so webview listener is registered before events arrive
        setTimeout(() => {
          for (const nb of notebooks) {
            const xmState = notebookStore.getXmState(nb.id);
            if (xmState) {
              engine.restoreXmState(nb.id);
            }
          }
        }, 500);
      }

      if (message.type === "CREATE_NOTEBOOK") {
        const mode = message.executionMode === "interactive" ? "interactive" : "index";
        // category arrives from the New Notebook dialog's radio group — only
        // ever "personal-research" | "samples" | "dev-tests" from that UI.
        // "user-requests" is never sent from here; it's reserved for notebooks
        // constructed by the web app import path.
        const category = message.category ?? undefined;
        let notebook;

        if (mode === "index") {
          // Index-mode notebooks are constructed exactly like an imported .pact file:
          // one notebook, one seed discussion, one prompt-bearing cell — built in
          // memory and imported invisibly, reusing the same importNotebook() path
          // that a real emailed .pact file goes through. Unsigned — signing only
          // matters when a .pact crosses an untrusted boundary (e.g. email); this
          // baseline never leaves the local database.
          const now = Date.now();
          const seedDiscussionId = "seed-discussion";
          const seedCellId = "seed-cell";

          const originalPact = {
            version: 1,
            exportedAt: now,
            notebook: {
              name: message.name,
              systemPrompt: message.systemPrompt ?? null,
              executionMode: "index" as const,
              ...(category ? { category } : {}),
            },
            discussions: [
              { id: seedDiscussionId, name: "Research Question", createdAt: now, totalTimeMs: 0 },
            ],
            cells: [
              {
                id: seedCellId,
                discussionId: seedDiscussionId,
                parentId: null,
                promptText: message.researchQuestion ?? "",
                response: "",
                model: "claude",
                cellType: "user",
                createdAt: now,
              },
            ],
          };

          notebook = notebookStore.importNotebook(originalPact);
          // Persist the exact same object as this notebook's reset baseline —
          // Abort later re-runs delete + import on this, same as re-importing
          // the original .pact file by hand would do.
          notebookStore.saveOriginalPact(notebook.id, originalPact);
        } else {
          notebook = notebookStore.createNotebook(message.name, message.systemPrompt ?? null, category);
          notebookStore.saveExecutionMode(notebook.id, "interactive");
        }

        const discussions = notebookStore.getDiscussionsForNotebook(notebook.id);
        panel.webview.postMessage({ type: "notebookCreated", notebook, discussions });
      }

      if (message.type === "CREATE_DISCUSSION") {
        const discussion = notebookStore.createDiscussion(
          message.notebookId,
          message.name,
        );
        panel.webview.postMessage({ type: "discussionCreated", discussion });
      }

      if (message.type === "LOAD_DISCUSSION_CELLS") {
        const cells = notebookStore.getCellsForDiscussion(message.discussionId);
        panel.webview.postMessage({ type: "discussionCellsLoaded", cells });
      }

      if (message.type === "DELETE_DISCUSSION") {
        notebookStore.deleteDiscussion(message.discussionId);
        panel.webview.postMessage({ type: "discussionDeleted", discussionId: message.discussionId });
      }

      if (message.type === "DELETE_NOTEBOOK") {
        notebookStore.deleteNotebook(message.notebookId);
        panel.webview.postMessage({ type: "notebookDeleted", notebookId: message.notebookId });
      }

      if (message.type === "CLEAR_RESPONSES") {
        notebookStore.clearResponses(message.discussionId);
        panel.webview.postMessage({ type: "responsesCleared" });
      }

      if (message.type === "SAVE_DRAFT") {
        notebookStore.saveDraft(message.discussionId, message.promptText);
      }

      if (message.type === "GET_DRAFT") {
        const draft = notebookStore.getDraft(message.discussionId);
        panel.webview.postMessage({ type: "draftLoaded", discussionId: message.discussionId, promptText: draft });
      }

      if (message.type === "DELETE_DRAFT") {
        notebookStore.deleteDraft(message.discussionId);
      }

      // ── Export (signed) ──────────────────────────────────────────────────

      if (message.type === "EXPORT_NOTEBOOK") {
        const data = notebookStore.exportNotebook(message.notebookId);
        if (!data) {
          vscode.window.showErrorMessage("PACT: notebook not found for export.");
          return;
        }

        if (data.cells.length === 0) {
          vscode.window.showWarningMessage(
            `PACT: "${data.notebook.name}" has no responses to export.`
          );
          return;
        }

        const notebooksDir = path.join(require("os").homedir(), "Documents", "PACT", "notebooks");
        if (!fs.existsSync(notebooksDir)) fs.mkdirSync(notebooksDir, { recursive: true });

        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(
            path.join(
              require("os").homedir(),
              "Documents", "PACT", "notebooks",
              `${data.notebook.name.replace(/\s+/g, "_")}.pact`
            ),
          ),
          filters: { "PACT Notebook": ["pact"] },
        });

        if (!saveUri) return;

        // Sign the notebook before saving
        try {
          vscode.window.showInformationMessage("PACT: signing notebook...");
          const signed = await notebookStore.exportNotebookSigned(message.notebookId);
          if (!signed) {
            vscode.window.showErrorMessage("PACT: failed to sign notebook.");
            return;
          }
          fs.writeFileSync(saveUri.fsPath, JSON.stringify(signed, null, 2), "utf-8");
          vscode.window.showInformationMessage(
            `PACT: "${data.notebook.name}" exported and signed successfully.`
          );
        } catch (signErr: any) {
          // If signing server is unreachable, offer unsigned export as fallback
          const choice = await vscode.window.showWarningMessage(
            `PACT: signing server unavailable — ${signErr.message}. Export without signature?`,
            "Export unsigned",
            "Cancel"
          );
          if (choice === "Export unsigned") {
            fs.writeFileSync(saveUri.fsPath, JSON.stringify(data, null, 2), "utf-8");
            vscode.window.showWarningMessage(
              `PACT: "${data.notebook.name}" exported WITHOUT signature.`
            );
          }
        }
      }

      // ── Export to Obsidian ───────────────────────────────────────────────

      if (message.type === "EXPORT_OBSIDIAN") {
        const markdown = notebookStore.exportNotebookAsMarkdown(message.notebookId);
        if (!markdown) {
          vscode.window.showErrorMessage("PACT: notebook not found for Obsidian export.");
          return;
        }

        const exportsDir = "/Users/nikolajivancic/pact/pact_exports";
        if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

        const notebook = notebookStore.getAllNotebooks().find(n => n.id === message.notebookId);
        const safeName = (notebook?.name ?? "notebook").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
        const filePath = path.join(exportsDir, `${safeName}.md`);

        fs.writeFileSync(filePath, markdown, "utf-8");
        vscode.window.showInformationMessage(`PACT: "${notebook?.name}" exported to Obsidian.`);
      }

      // ── Import (verifies signature) ──────────────────────────────────────

      if (message.type === "IMPORT_NOTEBOOK") {
        const openUris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { "PACT Notebook": ["pact"] },
          openLabel: "Import",
        });

        if (!openUris || openUris.length === 0) return;

        const raw = fs.readFileSync(openUris[0].fsPath, "utf-8");
        const data = JSON.parse(raw);

        // Detect signed vs unsigned format
        const isSigned = data.signature && data.payload && data.signer;
        const isLegacy = data.version && data.notebook && data.discussions && data.cells;

        if (!isSigned && !isLegacy) {
          vscode.window.showErrorMessage("PACT: invalid .pact file.");
          return;
        }

        let notebook;
        let discussions;

        const configPath = path.join(context.globalStorageUri.fsPath, "config.json");
        const importConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf-8")) : {};
        const trustAllImports = importConfig.trustAllImports === true;

        if (isSigned && !trustAllImports) {
          // Verify signature before importing
          try {
            vscode.window.showInformationMessage("PACT: verifying notebook signature...");
            notebook = await notebookStore.importNotebookSigned(data);
          } catch (verifyErr: any) {
            vscode.window.showErrorMessage(
              `PACT: import rejected — ${verifyErr.message}`
            );
            return;
          }
        } else {
          // Legacy unsigned notebook — warn but allow
          const choice = await vscode.window.showWarningMessage(
            "PACT: this notebook has no signature and cannot be verified. Import anyway?",
            "Import unsigned",
            "Cancel"
          );
          if (choice !== "Import unsigned") return;
          notebook = notebookStore.importNotebook(isSigned ? data.payload : data);
        }

        discussions = notebookStore.getDiscussionsForNotebook(notebook.id);

        // Reload the full explorer so the imported notebook appears
        const notebooks = notebookStore.getAllNotebooks();
        const allDiscussions = notebooks.flatMap(nb =>
          notebookStore.getDiscussionsForNotebook(nb.id)
        );

        panel.webview.postMessage({
          type: "notebooksLoaded",
          notebooks,
          discussions: allDiscussions,
        });

        // Auto-select the imported notebook and its first discussion, so the
        // composer reflects what was just imported rather than leaving
        // whatever discussion happened to be active before the import.
        panel.webview.postMessage({
          type: "notebookImported",
          notebook,
          discussions,
        });

        vscode.window.showInformationMessage(
          `PACT: "${notebook.name}" imported successfully.`
        );
      }

    } catch (err: any) {
      console.error("PACT ENGINE ERROR:", err?.message, err?.stack);
    }
  });
}
