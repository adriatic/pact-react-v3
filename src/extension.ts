// Copyright © 2026 PACTResearch.net. All rights reserved.
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { eventBus } from "./execution/eventBus";
import { ExecutionEngine } from "./execution/ExecutionEngine";
import { LLMRouter } from "./llm/llmRouter";
import { corePrompts } from "./prompts/core";
import { NotebookStore } from "./storage/notebookStore";
import type { PactExport } from "./storage/notebookStore";
import type { SerializedContentBlock } from "./types/contentBlock";

// ── PACT-Exports vault helpers ──────────────────────────────────────────────
// Local to pact-react-v3 — deliberately NOT reusing pactresearch-next's
// generateShortSlug() (2-stopword-filtered-word notebook naming). That
// function's output is lossy and often unrecognizable as the original
// question; this slugifier instead keeps a genuine, readable fragment of
// the actual research question text.

const PACT_EXPORTS_ROOT = "/Users/nikolajivancic/pact/PACT-Exports";

function slugify(text: string, maxLen: number = 60): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  if (!cleaned) return "untitled";
  if (cleaned.length <= maxLen) return cleaned;

  // Truncate at a word boundary rather than mid-word
  const truncated = cleaned.slice(0, maxLen);
  const lastDash = truncated.lastIndexOf("-");
  const result = lastDash > 0 ? truncated.slice(0, lastDash) : truncated;
  return result || "untitled";
}

function formatDateTimeLabel(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${date}_${time}`;
}

// Interim measure until a real customer_email field exists in the .pact
// schema (spans both pact-react-v3 and pactresearch-next — deferred).
// generatePactFile.ts embeds the customer's email in a consistent, always-
// generated phrase inside systemPrompt: "...conducting a PACT research
// session for {email}." Extraction is deliberately narrow (exact phrase
// match) rather than a loose email-anywhere-in-text search, so it fails
// safely (falls back to null) rather than accidentally matching an
// unrelated email if one ever appears elsewhere in a system prompt.
function extractCustomerEmail(systemPrompt: string | null): string | null {
  if (!systemPrompt) return null;
  const match = systemPrompt.match(
    /conducting a PACT research session for ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  );
  return match ? match[1] : null;
}

// Resolves the category subfolder under PACT-Exports/. Legacy notebooks with
// no category (created before Migration 14) fall back to "uncategorized"
// rather than blocking export. "user-requests" notebooks nest under the
// customer's email when it can be extracted from systemPrompt; otherwise
// fall back to "unknown-email" until a real customer_email field exists.
function resolveCategoryDir(category: string | undefined, customerEmail: string | null): string {
  if (category === "personal-research" || category === "samples" || category === "dev-tests") {
    return path.join(PACT_EXPORTS_ROOT, category);
  }
  if (category === "user-requests") {
    return path.join(PACT_EXPORTS_ROOT, "user-requests", customerEmail ?? "unknown-email");
  }
  return path.join(PACT_EXPORTS_ROOT, "uncategorized");
}

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
        // Abort resets the notebook in place to its just-created state,
        // using its own original_pact baseline — same notebookId preserved,
        // research data cleared. This is deliberately NOT the same as
        // deleting the notebook: Delete removes the row entirely and relies
        // on future Obsidian re-import to bring it back; Abort keeps the
        // row and rewinds it, since continuation support (both PACT-side
        // and web-client) will need a stable notebookId to attach to.
        const notebookId = notebookStore.getNotebookIdForDiscussion(message.discussionId);
        if (notebookId) {
          const notebook = notebookStore.resetNotebookFromOriginal(notebookId);
          if (notebook) {
            const discussions = notebookStore.getDiscussionsForNotebook(notebookId);
            panel.webview.postMessage({ type: "notebookReset", notebook, discussions });
          } else {
            // No original_pact baseline to reset from — shouldn't happen for
            // any notebook actually reachable via Abort today (the Index
            // button, and therefore Abort, only ever appears for Index-mode
            // notebooks, which always get a baseline at creation), but fall
            // back to the old delete behavior rather than leaving the
            // notebook in a broken half-reset state.
            console.warn("PACT: ABORT_RUN — no original_pact baseline for notebook", notebookId, "falling back to delete");
            notebookStore.deleteNotebook(notebookId);
            panel.webview.postMessage({ type: "notebookDeleted", notebookId });
          }
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
          notebook = notebookStore.createNotebook(message.name, message.systemPrompt ?? null, category, "interactive");
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
        panel.webview.postMessage({ type: "discussionCellsLoaded", cells, discussionId: message.discussionId });
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

      // ── Export (signed, writes directly into the PACT-Exports vault) ──────

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

        // Slug source: the seed cell's promptText for Index-mode notebooks
        // (cells[] is ordered by created_at ASC, so cells[0] is the earliest —
        // the seed cell — for any notebook built via the CREATE_NOTEBOOK /
        // original_pact path). Interactive-mode notebooks may have no
        // research question at all, so fall back to the notebook name.
        const slugSourceText = data.notebook.executionMode === "index" && data.cells.length > 0
          ? data.cells[0].promptText
          : data.notebook.name;
        const slug = slugify(slugSourceText || data.notebook.name);

        const dateTimeLabel = formatDateTimeLabel(Date.now());
        const customerEmail = extractCustomerEmail(data.notebook.systemPrompt);
        const categoryDir = resolveCategoryDir(data.notebook.category, customerEmail);
        const targetDir = path.join(categoryDir, `${dateTimeLabel}_${slug}`);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const safeName = data.notebook.name.replace(/\s+/g, "_");
        const targetPath = path.join(targetDir, `${safeName}.pact`);

        // Sign the notebook before saving
        try {
          vscode.window.showInformationMessage("PACT: signing notebook...");
          const signed = await notebookStore.exportNotebookSigned(message.notebookId);
          if (!signed) {
            vscode.window.showErrorMessage("PACT: failed to sign notebook.");
            return;
          }
          fs.writeFileSync(targetPath, JSON.stringify(signed, null, 2), "utf-8");
          vscode.window.showInformationMessage(
            `PACT: "${data.notebook.name}" exported and signed to ${targetPath}`
          );
        } catch (signErr: any) {
          // Local signing failure (e.g. key generation/read error) — offer
          // unsigned export as fallback. Signing has run entirely locally
          // since pactSigning.ts's migration off sign.pactresearch.net;
          // there is no server to be "unavailable" anymore.
          const choice = await vscode.window.showWarningMessage(
            `PACT: signing failed — ${signErr.message}. Export without signature?`,
            "Export unsigned",
            "Cancel"
          );
          if (choice === "Export unsigned") {
            fs.writeFileSync(targetPath, JSON.stringify(data, null, 2), "utf-8");
            vscode.window.showWarningMessage(
              `PACT: "${data.notebook.name}" exported WITHOUT signature to ${targetPath}`
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

        // Persist the reset baseline for Index-mode notebooks, same as
        // CREATE_NOTEBOOK already does — without this, Abort on a
        // web-imported notebook has nothing to reset to and silently falls
        // back to deleting the notebook instead. Interactive-mode notebooks
        // have no Abort path (no Index button), so there's nothing to save
        // for them, matching CREATE_NOTEBOOK's Interactive branch.
        if (notebook.executionMode === "index") {
          const originalPactPayload: PactExport = isSigned ? data.payload : data;
          notebookStore.saveOriginalPact(notebook.id, originalPactPayload);
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
