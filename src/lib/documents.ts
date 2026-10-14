import { randomUUID } from "node:crypto";
import type { Db } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { sanitizeDocumentHtml } from "./sanitize";

/**
 * Document + sharing domain logic. Every function takes the acting user's id
 * and enforces access itself, so API routes stay thin and the rules are
 * testable without HTTP.
 *
 * Access model:
 *   owner  — read, edit, rename, share/unshare, delete
 *   editor — read, edit, rename
 *   viewer — read only
 *   none   — 404 (we don't reveal that the document exists)
 */

export type Role = "owner" | "editor" | "viewer";
export type ShareRole = Exclude<Role, "owner">;

export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_BYTES = 1_000_000; // ~1 MB of HTML

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  role: Role;
  owner: { id: string; name: string; email: string };
}

export interface DocumentDetail extends DocumentSummary {
  content: string;
  version: number;
  createdAt: string;
}

export interface Share {
  userId: string;
  name: string;
  email: string;
  role: ShareRole;
}

const canEdit = (role: Role) => role === "owner" || role === "editor";

function normalizeTitle(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Title must be a string");
  const title = raw.replace(/\s+/g, " ").trim();
  if (!title) throw badRequest("Title cannot be empty");
  if (title.length > MAX_TITLE_LENGTH) throw badRequest(`Title must be at most ${MAX_TITLE_LENGTH} characters`);
  return title;
}

function normalizeContent(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Content must be a string");
  if (Buffer.byteLength(raw, "utf8") > MAX_CONTENT_BYTES) throw badRequest("Document is too large (max 1 MB)");
  return sanitizeDocumentHtml(raw);
}

async function resolveRole(db: Db, userId: string, docId: string): Promise<Role | null> {
  const { rows } = await db.execute({
    sql: `SELECT d.owner_id, s.role AS share_role
            FROM documents d
            LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?
           WHERE d.id = ?`,
    args: [userId, docId],
  });
  if (rows.length === 0) return null;
  if (rows[0].owner_id === userId) return "owner";
  return (rows[0].share_role as ShareRole | null) ?? null;
}

async function requireRole(db: Db, userId: string, docId: string): Promise<Role> {
  const role = await resolveRole(db, userId, docId);
  if (!role) throw notFound();
  return role;
}

export async function listDocuments(db: Db, userId: string): Promise<{ owned: DocumentSummary[]; shared: DocumentSummary[] }> {
  const { rows } = await db.execute({
    sql: `SELECT d.id, d.title, d.updated_at, d.owner_id, u.name AS owner_name, u.email AS owner_email,
                 CASE WHEN d.owner_id = ? THEN 'owner' ELSE s.role END AS role
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
    updatedAt: String(r.updated_at),
    role: r.role as Role,
    owner: { id: String(r.owner_id), name: String(r.owner_name), email: String(r.owner_email) },
  }));
  return { owned: docs.filter((d) => d.role === "owner"), shared: docs.filter((d) => d.role !== "owner") };
}

export async function getDocument(db: Db, userId: string, docId: string): Promise<DocumentDetail> {
  const role = await requireRole(db, userId, docId);
  const { rows } = await db.execute({
    sql: `SELECT d.*, u.name AS owner_name, u.email AS owner_email
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
    owner: { id: String(r.owner_id), name: String(r.owner_name), email: String(r.owner_email) },
  };
}

export async function createDocument(
  db: Db,
  userId: string,
  input: { title?: unknown; content?: unknown } = {},
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
  return getDocument(db, userId, id);
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
  const role = await requireRole(db, userId, docId);
  if (!canEdit(role)) throw forbidden("You have view-only access to this document");

  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (input.title !== undefined) {
    sets.push("title = ?");
    args.push(normalizeTitle(input.title));
  }
  if (input.content !== undefined) {
    sets.push("content = ?");
    args.push(normalizeContent(input.content));
  }
  if (sets.length === 0) throw badRequest("Nothing to update");
  if (typeof input.baseVersion !== "number" || !Number.isInteger(input.baseVersion)) {
    throw badRequest("baseVersion is required");
  }

  const result = await db.execute({
    sql: `UPDATE documents SET ${sets.join(", ")}, version = version + 1, updated_at = ?
           WHERE id = ? AND version = ?`,
    args: [...args, new Date().toISOString(), docId, input.baseVersion],
  });
  if (result.rowsAffected === 0) {
    throw conflict("This document was changed by someone else. Reload to get the latest version.");
  }
  return getDocument(db, userId, docId);
}

export async function deleteDocument(db: Db, userId: string, docId: string): Promise<void> {
  const role = await requireRole(db, userId, docId);
  if (role !== "owner") throw forbidden("Only the owner can delete this document");
  await db.batch(
    [
      { sql: "DELETE FROM document_shares WHERE document_id = ?", args: [docId] },
      { sql: "DELETE FROM documents WHERE id = ?", args: [docId] },
    ],
    "write",
  );
}

export async function listShares(db: Db, userId: string, docId: string): Promise<Share[]> {
  await requireRole(db, userId, docId); // anyone with access can see who else has it
  const { rows } = await db.execute({
    sql: `SELECT s.user_id, s.role, u.name, u.email FROM document_shares s
            JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`,
    args: [docId],
  });
  return rows.map((r) => ({ userId: String(r.user_id), role: r.role as ShareRole, name: String(r.name), email: String(r.email) }));
}

export async function shareDocument(
  db: Db,
  userId: string,
  docId: string,
  input: { email?: unknown; role?: unknown },
): Promise<Share[]> {
  const role = await requireRole(db, userId, docId);
  if (role !== "owner") throw forbidden("Only the owner can share this document");

  if (typeof input.email !== "string" || !input.email.trim()) throw badRequest("Email is required");
  const shareRole = input.role ?? "editor";
  if (shareRole !== "viewer" && shareRole !== "editor") throw badRequest("Role must be 'viewer' or 'editor'");

  const email = input.email.trim().toLowerCase();
  const { rows } = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [email] });
  if (rows.length === 0) throw badRequest(`No user with email ${email}`);
  const targetId = String(rows[0].id);
  if (targetId === userId) throw badRequest("You already own this document");

  // Upsert so re-sharing changes the role instead of erroring.
  await db.execute({
    sql: `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    args: [docId, targetId, shareRole, new Date().toISOString()],
  });
  return listShares(db, userId, docId);
}

export async function unshareDocument(db: Db, userId: string, docId: string, targetUserId: string): Promise<Share[]> {
  const role = await requireRole(db, userId, docId);
  if (role !== "owner") throw forbidden("Only the owner can change sharing");
  await db.execute({
    sql: "DELETE FROM document_shares WHERE document_id = ? AND user_id = ?",
    args: [docId, targetUserId],
  });
  return listShares(db, userId, docId);
}
