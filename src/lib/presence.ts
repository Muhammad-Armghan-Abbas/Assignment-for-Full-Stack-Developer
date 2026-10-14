import { authorize } from "./access";
import type { Db } from "./db";

/**
 * "Who's here" for an open document. Clients send a heartbeat every few
 * seconds through the sync endpoint; anyone seen within PRESENCE_TTL_MS is
 * shown. No sockets needed, which keeps this deployable on serverless.
 */

export const PRESENCE_TTL_MS = 20_000;

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  editing: boolean;
}

export interface SyncState {
  version: number;
  updatedAt: string;
  title: string;
  presence: PresenceUser[];
  /** Changes whenever a comment is added, resolved or deleted — clients refetch threads when it moves. */
  commentsKey: string;
}

export async function sync(db: Db, userId: string, docId: string, editing: boolean): Promise<SyncState> {
  await authorize(db, userId, docId, "read");
  const now = Date.now();
  const cutoff = new Date(now - PRESENCE_TTL_MS).toISOString();
  const [, doc, people, comments] = await db.batch(
    [
      {
        sql: `INSERT INTO presence (document_id, user_id, editing, last_seen) VALUES (?, ?, ?, ?)
              ON CONFLICT (document_id, user_id) DO UPDATE SET editing = excluded.editing, last_seen = excluded.last_seen`,
        args: [docId, userId, editing ? 1 : 0, new Date(now).toISOString()],
      },
      { sql: "SELECT version, updated_at, title FROM documents WHERE id = ?", args: [docId] },
      {
        sql: `SELECT u.id, u.name, u.color, p.editing FROM presence p JOIN users u ON u.id = p.user_id
               WHERE p.document_id = ? AND p.last_seen > ? ORDER BY u.name`,
        args: [docId, cutoff],
      },
      {
        sql: `SELECT COUNT(*) AS n, COALESCE(MAX(created_at), '') AS latest, COALESCE(SUM(resolved), 0) AS resolved
                FROM comments WHERE document_id = ?`,
        args: [docId],
      },
    ],
    "write",
  );
  const d = doc.rows[0];
  const c = comments.rows[0];
  return {
    version: Number(d.version),
    updatedAt: String(d.updated_at),
    title: String(d.title),
    presence: people.rows.map((r) => ({ id: String(r.id), name: String(r.name), color: String(r.color), editing: Boolean(r.editing) })),
    commentsKey: `${c.n}:${c.latest}:${c.resolved}`,
  };
}

export async function leave(db: Db, userId: string, docId: string): Promise<void> {
  await db.execute({ sql: "DELETE FROM presence WHERE document_id = ? AND user_id = ?", args: [docId, userId] });
}
