import { randomUUID } from "node:crypto";
import type { Db } from "./db";

export type ActivityType = "created" | "imported" | "edited" | "renamed" | "shared" | "unshared" | "commented" | "restored";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  createdAt: string;
  detail: Record<string, string> | null;
  document: { id: string; title: string };
  actor: { id: string; name: string; color: string; avatarUrl: string | null };
}

/** Edits within this window by the same person collapse into one feed entry. */
const EDIT_COALESCE_MS = 15 * 60_000;

export async function logActivity(
  db: Db,
  docId: string,
  actorId: string,
  type: ActivityType,
  detail?: Record<string, string>,
): Promise<void> {
  const now = new Date();
  if (type === "edited") {
    const since = new Date(now.getTime() - EDIT_COALESCE_MS).toISOString();
    const { rows } = await db.execute({
      sql: `SELECT id FROM activity WHERE document_id = ? AND actor_id = ? AND type = 'edited' AND created_at > ? LIMIT 1`,
      args: [docId, actorId, since],
    });
    if (rows.length) {
      await db.execute({ sql: "UPDATE activity SET created_at = ? WHERE id = ?", args: [now.toISOString(), rows[0].id] });
      return;
    }
  }
  await db.execute({
    sql: "INSERT INTO activity (id, document_id, actor_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [randomUUID(), docId, actorId, type, detail ? JSON.stringify(detail) : null, now.toISOString()],
  });
}

/** Recent activity across every document the user can currently access. */
export async function listActivity(db: Db, userId: string, limit = 25): Promise<ActivityItem[]> {
  const { rows } = await db.execute({
    sql: `SELECT a.id, a.type, a.detail, a.created_at, d.id AS doc_id, d.title, u.id AS actor_id, u.name, u.color, u.avatar_url
            FROM activity a
            JOIN documents d ON d.id = a.document_id
            JOIN users u ON u.id = a.actor_id
           WHERE d.owner_id = ?
              OR EXISTS (SELECT 1 FROM document_shares s WHERE s.document_id = d.id AND s.user_id = ?)
           ORDER BY a.created_at DESC
           LIMIT ?`,
    args: [userId, userId, limit],
  });
  return rows.map((r) => ({
    id: String(r.id),
    type: r.type as ActivityType,
    createdAt: String(r.created_at),
    detail: r.detail ? JSON.parse(String(r.detail)) : null,
    document: { id: String(r.doc_id), title: String(r.title) },
    actor: { id: String(r.actor_id), name: String(r.name), color: String(r.color), avatarUrl: r.avatar_url ? String(r.avatar_url) : null },
  }));
}
