import { randomUUID } from "node:crypto";
import { authorize, SHARE_ROLES, type Role, type ShareRole } from "./access";
import { logActivity } from "./activity";
import type { Db } from "./db";
import { badRequest, conflict } from "./errors";
import { sanitizeDocumentHtml } from "./sanitize";
import { excerpt } from "./text";
import { recordVersion } from "./versions";

/**
 * Document + sharing domain logic. Every function takes the acting user's id
 * and authorizes through access.ts, so API routes stay thin and every rule is
 * testable without HTTP.
 */

export type { Role, ShareRole } from "./access";

export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_BYTES = 1_000_000; // ~1 MB of HTML (images are stored separately)

export interface Person {
  id: string;
  name: string;
  email: string;
  color: string;
  avatarUrl: string | null;
}

export interface DocumentSummary {
  id: string;
  title: string;
  excerpt: string;
  updatedAt: string;
  role: Role;
  owner: Person;
  collaborators: number;
}

export interface DocumentDetail {
  id: string;
  title: string;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  role: Role;
  owner: Person;
}

export interface Share extends Omit<Person, "id"> {
  userId: string;
  role: ShareRole;
}

function normalizeTitle(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Title must be a string");
  const title = raw.replace(/\s+/g, " ").trim();
  if (!title) throw badRequest("Title cannot be empty");
  if (title.length > MAX_TITLE_LENGTH) throw badRequest(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  return title;
}

function normalizeContent(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Content must be a string");
  if (Buffer.byteLength(raw, "utf8") > MAX_CONTENT_BYTES) throw badRequest("Document is too large (max 1 MB of text)");
  return sanitizeDocumentHtml(raw);
}

export async function listDocuments(db: Db, userId: string): Promise<{ owned: DocumentSummary[]; shared: DocumentSummary[] }> {
  const { rows } = await db.execute({
    sql: `SELECT d.id, d.title, substr(d.content, 1, 4000) AS head, d.updated_at,
                 u.id AS owner_id, u.name AS owner_name, u.email AS owner_email, u.color AS owner_color, u.avatar_url AS owner_avatar,
                 CASE WHEN d.owner_id = ? THEN 'owner' ELSE s.role END AS role,
                 (SELECT COUNT(*) FROM document_shares x WHERE x.document_id = d.id) AS collaborators
            FROM documents d
            JOIN users u ON u.id = d.owner_id
            LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?
           WHERE d.owner_id = ? OR s.user_id IS NOT NULL
           ORDER BY d.updated_at DESC`,
    args: [userId, userId, userId],
  });
  const docs: DocumentSummary[] = rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    excerpt: excerpt(String(r.head ?? "")),
    updatedAt: String(r.updated_at),
    role: r.role as Role,
    collaborators: Number(r.collaborators),
    owner: { id: String(r.owner_id), name: String(r.owner_name), email: String(r.owner_email), color: String(r.owner_color), avatarUrl: r.owner_avatar ? String(r.owner_avatar) : null },
  }));
  return { owned: docs.filter((d) => d.role === "owner"), shared: docs.filter((d) => d.role !== "owner") };
}

export async function getDocument(db: Db, userId: string, docId: string): Promise<DocumentDetail> {
  const role = await authorize(db, userId, docId, "read");
  const { rows } = await db.execute({
    sql: `SELECT d.*, u.name AS owner_name, u.email AS owner_email, u.color AS owner_color, u.avatar_url AS owner_avatar
            FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?`,
    args: [docId],
  });
  const r = rows[0];
  return {
    id: String(r.id),
    title: String(r.title),
    content: String(r.content),
    version: Number(r.version),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    role,
    owner: { id: String(r.owner_id), name: String(r.owner_name), email: String(r.owner_email), color: String(r.owner_color), avatarUrl: r.owner_avatar ? String(r.owner_avatar) : null },
  };
}

export async function createDocument(
  db: Db,
  userId: string,
  input: {
    title?: unknown;
    content?: unknown;
    /** Original filename when the document comes from an import. */
    source?: string;
    /**
     * Optional step that runs after the row exists but before history/activity are recorded,
     * for content that needs the new document's id (e.g. storing imported images as its assets).
     */
    fill?: (docId: string) => Promise<string>;
  } = {},
): Promise<DocumentDetail> {
  const title = input.title === undefined ? "Untitled document" : normalizeTitle(input.title);
  const content = input.content === undefined ? "" : normalizeContent(input.content);
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO documents (id, owner_id, title, content, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)`,
    args: [id, userId, title, content, now, now],
  });
  if (input.fill) {
    await db.execute({ sql: "UPDATE documents SET content = ? WHERE id = ?", args: [normalizeContent(await input.fill(id)), id] });
  }
  const doc = await getDocument(db, userId, id);
  await recordVersion(db, doc, userId, { label: input.source ? `Imported from ${input.source}` : "Created" });
  await logActivity(db, id, userId, input.source ? "imported" : "created", input.source ? { file: input.source } : undefined);
  return doc;
}

/**
 * Optimistic concurrency: the client sends the version it last saw. If someone
 * else saved in between, we refuse with 409 instead of silently overwriting.
 */
export async function updateDocument(
  db: Db,
  userId: string,
  docId: string,
  input: { title?: unknown; content?: unknown; baseVersion?: unknown },
): Promise<DocumentDetail> {
  await authorize(db, userId, docId, "edit");

  const sets: string[] = [];
  const args: (string | number)[] = [];
  let newTitle: string | undefined;
  if (input.title !== undefined) {
    newTitle = normalizeTitle(input.title);
    sets.push("title = ?");
    args.push(newTitle);
  }
  if (input.content !== undefined) {
    sets.push("content = ?");
    args.push(normalizeContent(input.content));
  }
  if (sets.length === 0) throw badRequest("Nothing to update");
  if (typeof input.baseVersion !== "number" || !Number.isInteger(input.baseVersion)) {
    throw badRequest("baseVersion is required");
  }

  const before = newTitle !== undefined ? (await db.execute({ sql: "SELECT title FROM documents WHERE id = ?", args: [docId] })).rows[0] : null;

  const result = await db.execute({
    sql: `UPDATE documents SET ${sets.join(", ")}, version = version + 1, updated_at = ?
           WHERE id = ? AND version = ?`,
    args: [...args, new Date().toISOString(), docId, input.baseVersion],
  });
  if (result.rowsAffected === 0) {
    throw conflict("This document was changed by someone else. Reload to get the latest version.");
  }
  const doc = await getDocument(db, userId, docId);
  await recordVersion(db, doc, userId);
  if (input.content !== undefined) await logActivity(db, docId, userId, "edited");
  if (before && before.title !== newTitle) await logActivity(db, docId, userId, "renamed", { from: String(before.title), to: doc.title });
  return doc;
}

export async function deleteDocument(db: Db, userId: string, docId: string): Promise<void> {
  await authorize(db, userId, docId, "manage");
  // Explicit child deletes: Turso connections don't persist PRAGMA foreign_keys, so don't rely on CASCADE.
  await db.batch(
    ["document_shares", "document_versions", "comments", "assets", "presence", "activity"].map((t) => ({
      sql: `DELETE FROM ${t} WHERE document_id = ?`,
      args: [docId],
    })).concat([{ sql: "DELETE FROM documents WHERE id = ?", args: [docId] }]),
    "write",
  );
}

export async function listShares(db: Db, userId: string, docId: string): Promise<Share[]> {
  await authorize(db, userId, docId, "read"); // anyone with access can see who else has it
  const { rows } = await db.execute({
    sql: `SELECT s.user_id, s.role, u.name, u.email, u.color, u.avatar_url FROM document_shares s
            JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`,
    args: [docId],
  });
  return rows.map((r) => ({
    userId: String(r.user_id),
    role: r.role as ShareRole,
    name: String(r.name),
    email: String(r.email),
    color: String(r.color), avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
  }));
}

export async function shareDocument(
  db: Db,
  userId: string,
  docId: string,
  input: { email?: unknown; role?: unknown },
): Promise<Share[]> {
  await authorize(db, userId, docId, "manage");

  if (typeof input.email !== "string" || !input.email.trim()) throw badRequest("Email is required");
  const shareRole = input.role ?? "editor";
  if (!SHARE_ROLES.includes(shareRole as ShareRole)) throw badRequest("Role must be 'viewer', 'commenter' or 'editor'");

  const email = input.email.trim().toLowerCase();
  const { rows } = await db.execute({ sql: "SELECT id, name FROM users WHERE email = ?", args: [email] });
  if (rows.length === 0) throw badRequest(`No user with email ${email}`);
  const targetId = String(rows[0].id);
  if (targetId === userId) throw badRequest("You already own this document");

  // Upsert so re-sharing changes the role instead of erroring.
  await db.execute({
    sql: `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    args: [docId, targetId, shareRole as string, new Date().toISOString()],
  });
  await logActivity(db, docId, userId, "shared", { name: String(rows[0].name), role: shareRole as string });
  return listShares(db, userId, docId);
}

export async function unshareDocument(db: Db, userId: string, docId: string, targetUserId: string): Promise<Share[]> {
  await authorize(db, userId, docId, "manage");
  const { rows } = await db.execute({ sql: "SELECT name FROM users WHERE id = ?", args: [targetUserId] });
  const res = await db.execute({
    sql: "DELETE FROM document_shares WHERE document_id = ? AND user_id = ?",
    args: [docId, targetUserId],
  });
  if (res.rowsAffected) {
    await db.execute({ sql: "DELETE FROM presence WHERE document_id = ? AND user_id = ?", args: [docId, targetUserId] });
    await logActivity(db, docId, userId, "unshared", { name: String(rows[0]?.name ?? "someone") });
  }
  return listShares(db, userId, docId);
}
