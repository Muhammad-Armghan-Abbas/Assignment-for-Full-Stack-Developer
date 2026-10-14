import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

/**
 * One libSQL client for the whole app.
 * - Local dev / tests: a SQLite file (or :memory:).
 * - Production (Vercel): a Turso database over HTTP — same SQL, same driver.
 */

export type Db = Client;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id    TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     name  TEXT NOT NULL,
     color TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS documents (
     id         TEXT PRIMARY KEY,
     owner_id   TEXT NOT NULL REFERENCES users(id),
     title      TEXT NOT NULL,
     content    TEXT NOT NULL DEFAULT '',
     version    INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id)`,
  `CREATE TABLE IF NOT EXISTS document_shares (
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     user_id     TEXT NOT NULL REFERENCES users(id),
     role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
     created_at  TEXT NOT NULL,
     PRIMARY KEY (document_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id)`,
];

/** Demo accounts. Login is mocked (pick a user), so these are the "test accounts" for reviewers. */
export const SEED_USERS = [
  { id: "u_alice", email: "alice@ajaia.test", name: "Alice Tan", color: "#2563eb" },
  { id: "u_bob", email: "bob@ajaia.test", name: "Bob Lim", color: "#16a34a" },
  { id: "u_carol", email: "carol@ajaia.test", name: "Carol Ng", color: "#c2410c" },
] as const;

const WELCOME_HTML = `<h1>Welcome to Ajaia Docs</h1>
<p>This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> as an <em>editor</em>.</p>
<h2>Try this</h2>
<ol>
  <li>Format text with <strong>bold</strong>, <em>italic</em>, <u>underline</u>, headings and lists.</li>
  <li>Open <strong>Share</strong> to grant Carol access as a viewer.</li>
  <li>Switch user (top right) to see the document under <em>Shared with me</em>.</li>
</ol>
<ul><li>Changes save automatically.</li><li>Import a .txt, .md or .docx file from the documents page.</li></ul>`;

export async function migrate(db: Db, { seed = true } = {}) {
  // One round trip: matters on a cold start against a remote Turso database.
  await db.batch(SCHEMA, "write");
  if (!seed) return;

  const { rows } = await db.execute("SELECT COUNT(*) AS n FROM users");
  if (Number(rows[0].n) > 0) return;

  // INSERT OR IGNORE + fixed ids keep seeding idempotent if two cold starts race.
  const now = new Date().toISOString();
  const docId = "welcome";
  await db.batch(
    [
      ...SEED_USERS.map((u) => ({
        sql: "INSERT OR IGNORE INTO users (id, email, name, color) VALUES (?, ?, ?, ?)",
        args: [u.id, u.email, u.name, u.color],
      })),
      {
        sql: "INSERT OR IGNORE INTO documents (id, owner_id, title, content, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
        args: [docId, "u_alice", "Welcome to Ajaia Docs", WELCOME_HTML, now, now],
      },
      {
        sql: "INSERT OR IGNORE INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, 'editor', ?)",
        args: [docId, "u_bob", now],
      },
    ],
    "write",
  );
}

export function createDb(url: string, authToken?: string): Db {
  if (url.startsWith("file:") && !url.includes(":memory:")) {
    fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  }
  return createClient({ url, authToken: authToken || undefined });
}

// Cache across hot reloads in dev and across invocations of a warm serverless instance.
const g = globalThis as unknown as { __db?: Db; __dbReady?: Promise<void> };

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.VERCEL) {
    // Vercel's filesystem is read-only except /tmp. This keeps a misconfigured deploy usable,
    // but data is per-instance and temporary — set DATABASE_URL to a Turso database for real use.
    console.warn("DATABASE_URL not set on Vercel; using ephemeral /tmp SQLite.");
    return "file:/tmp/ajaia-docs.db";
  }
  return "file:./data/app.db";
}

export async function getDb(): Promise<Db> {
  if (!g.__db) {
    g.__db = createDb(databaseUrl(), process.env.DATABASE_AUTH_TOKEN);
    g.__dbReady = migrate(g.__db).catch((err) => {
      g.__db = undefined;
      g.__dbReady = undefined;
      throw err;
    });
  }
  await g.__dbReady;
  return g.__db!;
}
