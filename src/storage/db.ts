// Copyright © 2026 PACTResearch.net. All rights reserved.
// pactresearch.net
import { DatabaseSync } from "node:sqlite";
import * as path from "path";
import * as fs from "fs";

let db: DatabaseSync | null = null;

type Migration = {
  version: number;
  description: string;
  sql: string;
};

const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema: responses table",
    sql: `
      CREATE TABLE IF NOT EXISTS responses (
        prompt_id   TEXT PRIMARY KEY,
        prompt_text TEXT NOT NULL,
        response    TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );
    `,
  },
  {
    version: 2,
    description: "Add image support to responses",
    sql: `
      ALTER TABLE responses ADD COLUMN image_data      TEXT;
      ALTER TABLE responses ADD COLUMN image_mime_type TEXT;
    `,
  },
  {
    version: 3,
    description: "Add model and cell_type to responses",
    sql: `
      ALTER TABLE responses ADD COLUMN model     TEXT NOT NULL DEFAULT 'gpt';
      ALTER TABLE responses ADD COLUMN cell_type TEXT NOT NULL DEFAULT 'user';
    `,
  },
  {
    version: 4,
    description: "Add notebooks, discussions, parent-child relationships",
    sql: `
      CREATE TABLE IF NOT EXISTS notebooks (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        is_system  INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS discussions (
        id            TEXT PRIMARY KEY,
        notebook_id   TEXT NOT NULL,
        parent_id     TEXT,
        name          TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        total_time_ms INTEGER NOT NULL DEFAULT 0
      );

      ALTER TABLE responses ADD COLUMN discussion_id TEXT;

      INSERT INTO notebooks (id, name, is_system, created_at)
      VALUES
        ('notebook-tutorial', 'Tutorial', 1, ${Date.now()}),
        ('notebook-general',  'General',  0, ${Date.now()});

      INSERT INTO discussions (id, notebook_id, parent_id, name, created_at)
      VALUES
        ('discussion-default', 'notebook-general', NULL, 'Getting Started', ${Date.now()});
    `,
  },
  {
    version: 5,
    description: "Add system_prompt to notebooks, move Getting Started to Tutorial",
    sql: `
      ALTER TABLE notebooks ADD COLUMN system_prompt TEXT;

      UPDATE notebooks
      SET system_prompt = 'You are assisting a user of PACT — a Prompt and Context Tracking system built as a VSCode extension. PACT treats AI interactions not as conversations but as structured notebook executions. Each prompt becomes an immutable cell with a recorded response, forming a reasoning ledger. PACT supports multiple LLMs (GPT and Claude) running in parallel, with responses stored in SQLite and exportable to Obsidian. The user is exploring PACT architecture and capabilities through a structured tutorial.'
      WHERE id = 'notebook-tutorial';

      UPDATE discussions
      SET notebook_id = 'notebook-tutorial'
      WHERE id = 'discussion-default';

      UPDATE discussions
      SET name = 'Getting Started'
      WHERE id = 'discussion-default';
    `,
  },
  {
    version: 6,
    description: "Add parent_id to responses",
    sql: `
    ALTER TABLE responses ADD COLUMN parent_id TEXT;
  `,
  },
  {
    version: 7,
    description: "Seed all tutorial discussions from corePrompts",
    sql: `
    UPDATE discussions
    SET id = 'discussion-tutorial-00', name = 'Getting Started'
    WHERE id = 'discussion-default';

    INSERT OR IGNORE INTO discussions (id, notebook_id, parent_id, name, created_at, total_time_ms)
    VALUES
      ('discussion-tutorial-01', 'notebook-tutorial', NULL, 'What am I looking at?', ${Date.now()}, 0),
      ('discussion-tutorial-02', 'notebook-tutorial', NULL, 'What just happened?', ${Date.now()}, 0),
      ('discussion-tutorial-03', 'notebook-tutorial', NULL, 'Why a cell, not a bubble?', ${Date.now()}, 0),
      ('discussion-tutorial-04', 'notebook-tutorial', NULL, 'What does Retry actually mean?', ${Date.now()}, 0),
      ('discussion-tutorial-05', 'notebook-tutorial', NULL, 'What is the cell hierarchy for?', ${Date.now()}, 0),
      ('discussion-tutorial-06', 'notebook-tutorial', NULL, 'What is a PACT cell as a data structure?', ${Date.now()}, 0),
      ('discussion-tutorial-07', 'notebook-tutorial', NULL, 'What is the notebook?', ${Date.now()}, 0),
      ('discussion-tutorial-08', 'notebook-tutorial', NULL, 'What should never reach the LLM?', ${Date.now()}, 0),
      ('discussion-tutorial-09', 'notebook-tutorial', NULL, 'What is a PACT signal?', ${Date.now()}, 0),
      ('discussion-tutorial-10', 'notebook-tutorial', NULL, 'How does PACT compare two models?', ${Date.now()}, 0),
      ('discussion-tutorial-11', 'notebook-tutorial', NULL, 'What would PACT remember that chat forgets?', ${Date.now()}, 0),
      ('discussion-tutorial-12', 'notebook-tutorial', NULL, 'What is a prompt library?', ${Date.now()}, 0),
      ('discussion-tutorial-13', 'notebook-tutorial', NULL, 'How does PACT apply to a domain?', ${Date.now()}, 0),
      ('discussion-tutorial-14', 'notebook-tutorial', NULL, 'Why is this not an agentic system?', ${Date.now()}, 0),
      ('discussion-tutorial-15', 'notebook-tutorial', NULL, 'What does PACT become?', ${Date.now()}, 0);
  `,
  },
  {
    version: 8,
    description: "Add Drafts system notebook",
    sql: `
      INSERT OR IGNORE INTO notebooks (id, name, is_system, created_at)
      VALUES ('notebook-drafts', 'Drafts', 1, ${Date.now()});
    `,
  },
  {
    version: 9,
    description: "Add ipr_messages to notebooks for IPR chat persistence",
    sql: `ALTER TABLE notebooks ADD COLUMN ipr_messages TEXT`,
  },
  {
    version: 10,
    description: "Add xm_state to notebooks for XM session persistence",
    sql: `ALTER TABLE notebooks ADD COLUMN xm_state TEXT`,
  },
  {
    version: 11,
    description: "Add execution_mode and ipr_research_question to notebooks",
    sql: `
      ALTER TABLE notebooks ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'xm';
      ALTER TABLE notebooks ADD COLUMN ipr_research_question TEXT;
    `,
  },
];

function getSchemaVersion(database: DatabaseSync): number {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL
    )
  `);

  const row = database
    .prepare("SELECT version FROM schema_version")
    .get() as { version: number } | undefined;

  if (!row) {
    database.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
    return 0;
  }

  return row.version;
}

function runMigrations(database: DatabaseSync): void {
  const current = getSchemaVersion(database);
  const pending = migrations.filter(m => m.version > current);

  if (pending.length === 0) return;

  for (const migration of pending) {
    console.log(`PACT DB: applying migration v${migration.version} — ${migration.description}`);
    database.exec(migration.sql);
    database
      .prepare("UPDATE schema_version SET version = ?")
      .run(migration.version);
  }
}

export function getDb(extensionPath: string): DatabaseSync {
  if (db) return db;

  const dir = path.join(extensionPath, "pact-data");

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseSync(path.join(dir, "pact.db"));
  runMigrations(db);

  return db;
}
