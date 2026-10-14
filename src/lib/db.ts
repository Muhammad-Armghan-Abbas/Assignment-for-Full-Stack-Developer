import { createClient, type Client, type InStatement } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { seed } from "./seed";

/**
 * One libSQL client for the whole app.
 * - Local dev / tests: a SQLite file (or :memory:).
 * - Production (Vercel): a Turso database over HTTP — same SQL, same driver.
 */

export type Db = Client;

interface Migration {
  id: number;
  name: string;
  /** Statements run in a single write transaction. */
  up: (db: Db) => Promise<InStatement[]>;
}

/**
 * Forward-only migrations. Each runs once, inside a transaction, and is recorded
 * in schema_migrations. Databases created by the first release (which had no
 * migrations table) are upgraded in place — migration 1 is all IF NOT EXISTS.
 */
const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "initial schema",
    up: async () => [
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
    ],
  },
  {
    id: 2,
    name: "commenter role, versions, comments, assets, presence, activity",
    up: async (db) => {
      // SQLite can't alter a CHECK constraint, so rebuild document_shares if it predates 'commenter'.
      const { rows } = await db.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'document_shares'");
      const needsRebuild = !String(rows[0]?.sql ?? "").includes("commenter");
      return [
        ...(needsRebuild
          ? [
              `CREATE TABLE document_shares_v2 (
                 document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                 user_id     TEXT NOT NULL REFERENCES users(id),
                 role        TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor')),
                 created_at  TEXT NOT NULL,
                 PRIMARY KEY (document_id, user_id)
               )`,
              `INSERT INTO document_shares_v2 SELECT document_id, user_id, role, created_at FROM document_shares`,
              `DROP TABLE document_shares`,
              `ALTER TABLE document_shares_v2 RENAME TO document_shares`,
              `CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id)`,
            ]
          : []),
        `CREATE TABLE IF NOT EXISTS document_versions (
           id          TEXT PRIMARY KEY,
           document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
           version     INTEGER NOT NULL,
           title       TEXT NOT NULL,
           content     TEXT NOT NULL,
           author_id   TEXT NOT NULL REFERENCES users(id),
           label       TEXT,
           created_at  TEXT NOT NULL,
           updated_at  TEXT NOT NULL
         )`,
        `CREATE INDEX IF NOT EXISTS idx_versions_doc ON document_versions(document_id, updated_at)`,
        `CREATE TABLE IF NOT EXISTS comments (
           id          TEXT PRIMARY KEY,
           document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
           thread_id   TEXT NOT NULL,
           author_id   TEXT NOT NULL REFERENCES users(id),
           body        TEXT NOT NULL,
           quote       TEXT,
           prefix      TEXT,
           resolved    INTEGER NOT NULL DEFAULT 0,
           resolved_by TEXT REFERENCES users(id),
           created_at  TEXT NOT NULL
         )`,
        `CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(document_id, created_at)`,
        `CREATE TABLE IF NOT EXISTS assets (
           id          TEXT PRIMARY KEY,
           document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
           uploader_id TEXT NOT NULL REFERENCES users(id),
           mime        TEXT NOT NULL,
           size        INTEGER NOT NULL,
           data        BLOB NOT NULL,
           created_at  TEXT NOT NULL
         )`,
        `CREATE INDEX IF NOT EXISTS idx_assets_doc ON assets(document_id)`,
        `CREATE TABLE IF NOT EXISTS presence (
           document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
           user_id     TEXT NOT NULL REFERENCES users(id),
           editing     INTEGER NOT NULL DEFAULT 0,
           last_seen   TEXT NOT NULL,
           PRIMARY KEY (document_id, user_id)
         )`,
        `CREATE TABLE IF NOT EXISTS activity (
           id          TEXT PRIMARY KEY,
           document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
           actor_id    TEXT NOT NULL REFERENCES users(id),
           type        TEXT NOT NULL,
           detail      TEXT,
           created_at  TEXT NOT NULL
         )`,
        `CREATE INDEX IF NOT EXISTS idx_activity_doc ON activity(document_id, created_at)`,
        `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      ];
    },
  },
  {
    id: 3,
    name: "user avatar photos",
    up: async (db) => {
      const { rows } = await db.execute("PRAGMA table_info(users)");
      return rows.some((r) => r.name === "avatar_url") ? [] : ["ALTER TABLE users ADD COLUMN avatar_url TEXT"];
    },
  },
];

export async function migrate(db: Db, opts: { seed?: boolean } = {}) {
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const { rows } = await db.execute("SELECT id FROM schema_migrations");
  const applied = new Set(rows.map((r) => Number(r.id)));

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    const statements = await m.up(db);
    await db.batch(
      [
        ...statements,
        // OR IGNORE: if two cold starts race, the loser's transaction is a harmless no-op on this row.
        { sql: "INSERT OR IGNORE INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)", args: [m.id, m.name, new Date().toISOString()] },
      ],
      "write",
    );
  }

  if (opts.seed ?? true) await seed(db);
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

export const nowIso = () => new Date().toISOString();
