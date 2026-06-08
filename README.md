# PACT — Prompt and Context Tracking

> **Status:** Private repository — documentation in progress. Not yet open for external contributions.

PACT is a VSCode extension that provides a structured, AI-assisted research environment. It organizes work into **notebooks**, **discussions**, and **cells**, backed by a local SQLite database, with multi-provider LLM support and export to Obsidian.

The long-term vision is to be to AI-assisted research what Linux is to operating systems: open infrastructure that democratizes deep research beyond large institutional gatekeepers.

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Key Design Decisions](#key-design-decisions)

---

## Architecture

```
pact-react-v2/
├── src/
│   ├── extension/          # VSCode extension host (Node.js)
│   │   ├── LLMRouter.ts    # Multi-provider LLM dispatch (Anthropic / OpenAI)
│   │   ├── db.ts           # SQLite via node:sqlite built-in
│   │   ├── signing.ts      # Ed25519 notebook signing (sign.pactresearch.net)
│   │   └── ...
│   └── webview/            # React frontend (runs inside VSCode webview)
│       ├── components/     # Notebook, Discussion, Cell, Explorer, Settings
│       └── ...
├── pact-data/
│   └── pact.db             # Local SQLite database (not committed)
├── package.json
└── tsconfig.json
```

**Extension host ↔ Webview communication** uses VSCode's `postMessage` API. `acquireVsCodeApi()` is called once at module level in the webview entry point — not inside any component.

**Storage:** `node:sqlite` built-in (Node 24 / Electron 42 compatible — no native module build step required). Persistent config (API keys, settings) lives at:
```
~/Library/Application Support/Code/User/globalStorage/adriatic.pact-react-2/config.json
```

**LLM tiers:**
- Economy — Claude Haiku / GPT-4.1 mini (fast, low cost)
- Standard — Claude Sonnet / GPT-4.1 (precision work)

---

## Features

- **Notebook / Discussion / Cell** hierarchy with full SQLite persistence
- **Multi-provider LLM** via `LLMRouter` (Anthropic + OpenAI), switchable per session
- **System prompt** per notebook, editable in Settings
- **IPR (Iterative Prompt Refinement)** — persistent multi-turn Haiku conversation (5-turn cap) that refines a research question into structured `RESEARCH_QUESTION_START…END` / `CONTEXT_START…END` output
- **Cross-discussion cell references** — resolved in the extension host before sending to the LLM
- **Explorer** — click-to-open popup UI for notebook management and export
- **PACT-to-Obsidian export** — produces signed `.pact` files via Ed25519 (signing server at `sign.pactresearch.net`)
- **Notebook signing** with `trustAllImports` emergency bypass flag
- **PDF export** with pactresearch.net attribution
- **Drafts system notebook** with auto-save / restore

---

## Setup

### Prerequisites

- VSCode 1.85+
- Node.js 24+ (uses `node:sqlite` built-in)
- An Anthropic API key and/or OpenAI API key

### Install dependencies

```bash
cd pact-react-v2
npm install
```

### Configure API keys

Edit `config.json` at the global storage path above (use BBEdit or another editor — VSCode's own text selection can silently drop characters in sensitive fields):

```json
{
  "anthropicApiKey": "sk-ant-...",
  "openaiApiKey": "sk-..."
}
```

### Run in development

Press **F5** in VSCode to launch the Extension Development Host.

---

## Environment Variables

PACT does not use a `.env` file. All runtime configuration is stored in `config.json` at the global storage path. The following values are expected:

| Key | Description |
|-----|-------------|
| `anthropicApiKey` | Anthropic API key (Claude Haiku / Sonnet) |
| `openaiApiKey` | OpenAI API key (GPT-4.1 family) |
| `signingServerUrl` | Ed25519 signing endpoint (default: `https://sign.pactresearch.net`) |

---

## Deployment

PACT is a local VSCode extension — it does not deploy to a server. The production copy lives at:

```
~/Work/pact-production/
```

To package and install the extension locally:

```bash
npm run package          # produces pact-react-2-x.x.x.vsix
code --install-extension pact-react-2-x.x.x.vsix
```

The signing server (`sign.pactresearch.net`) is a separate service running on Vultr. See `pactresearch-next` for infrastructure notes.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `node:sqlite` built-in | Eliminates native module compilation issues with Electron 42 / Node 24 |
| `acquireVsCodeApi()` at module level | Can only be called once per webview lifetime |
| Ed25519 for signing | `sign(null, data, key)` — handles hashing internally; `createSign("SHA256")` is incorrect |
| Canonicalization uses recursive approach | `JSON.stringify` replacer causes stack overflow on deeply nested objects |
| Explorer uses click-to-open popup | Hover-expand caused 50 Hz oscillation |
| Global storage path for config | Survives extension updates; `extensionPath` does not |
| "Drilling" workflow | Economy tier for exploration, Standard tier for precision — controls cost |


---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```


