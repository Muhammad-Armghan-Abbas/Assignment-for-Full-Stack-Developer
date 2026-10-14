import { randomUUID } from "node:crypto";
import { authorize } from "./access";
import { logActivity } from "./activity";
import type { Db } from "./db";
import { notFound } from "./errors";
import { getDocument, type DocumentDetail } from "./documents";
import { sanitizeDocumentHtml } from "./sanitize";
import { wordCount } from "./text";

/**
 * Version history.
 *
 * Saving happens every second or so while someone types, so storing every save
 * would be noise. Instead a snapshot represents an editing *session*: while the
 * same person keeps editing within SESSION_MS, the latest snapshot is updated in
 * place; a different author, a pause, a restore or an import starts a new one.
 */

export const SESSION_MS = 10 * 60_000;
export const MAX_VERSIONS_LISTED = 100;

export interface VersionSummary {
  id: string;
  version: number;
  title: string;
  label: string | null;
  createdAt: string;
  updatedAt: string;
  words: number;
  author: { id: string; name: string; color: string; avatarUrl: string | null };
}

export interface VersionDetail extends VersionSummary {
  content: string;
}

export async function recordVersion(
  db: Db,
  doc: { id: string; version: number; title: string; content: string },
  authorId: string,
  opts: { label?: string; forceNew?: boolean } = {},
): Promise<void> {
  const now = new Date();
  if (!opts.forceNew && !opts.label) {
    const { rows } = await db.execute({
      sql: `SELECT id, author_id, updated_at, label FROM document_versions WHERE document_id = ? ORDER BY updated_at DESC LIMIT 1`,
      args: [doc.id],
    });
    const last = rows[0];
    if (
      last &&
      last.author_id === authorId &&
      !last.label && // never fold edits into a labelled snapshot (Created / Restored / Imported)
      now.getTime() - new Date(String(last.updated_at)).getTime() < SESSION_MS
    ) {
      await db.execute({
        sql: "UPDATE document_versions SET version = ?, title = ?, content = ?, updated_at = ? WHERE id = ?",
        args: [doc.version, doc.title, doc.content, now.toISOString(), last.id],
      });
      return;
    }
  }
  await db.execute({
    sql: `INSERT INTO document_versions (id, document_id, version, title, content, author_id, label, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [randomUUID(), doc.id, doc.version, doc.title, doc.content, authorId, opts.label ?? null, now.toISOString(), now.toISOString()],
  });
}

function toSummary(r: Record<string, unknown>): VersionSummary {
  return {
    id: String(r.id),
    version: Number(r.version),
    title: String(r.title),
    label: r.label ? String(r.label) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    words: wordCount(String(r.content ?? "")),
    author: { id: String(r.author_id), name: String(r.name), color: String(r.color), avatarUrl: r.avatar_url ? String(r.avatar_url) : null },
  };
}

/** History is an editing tool, so it's available to editors and owners (as in Google Docs). */
export async function listVersions(db: Db, userId: string, docId: string): Promise<VersionSummary[]> {
  await authorize(db, userId, docId, "edit");
  const { rows } = await db.execute({
    sql: `SELECT v.id, v.version, v.title, v.label, v.created_at, v.updated_at, v.author_id, v.content, u.name, u.color, u.avatar_url
            FROM document_versions v JOIN users u ON u.id = v.author_id
           WHERE v.document_id = ? ORDER BY v.updated_at DESC LIMIT ?`,
    args: [docId, MAX_VERSIONS_LISTED],
  });
  return rows.map((r) => toSummary(r as unknown as Record<string, unknown>));
}

export async function getVersion(db: Db, userId: string, docId: string, versionId: string): Promise<VersionDetail> {
  await authorize(db, userId, docId, "edit");
  const { rows } = await db.execute({
    sql: `SELECT v.*, u.name, u.color, u.avatar_url FROM document_versions v JOIN users u ON u.id = v.author_id
           WHERE v.id = ? AND v.document_id = ?`,
    args: [versionId, docId],
  });
  if (!rows.length) throw notFound("Version");
  const r = rows[0] as unknown as Record<string, unknown>;
  return { ...toSummary(r), content: String(r.content) };
}

/**
 * Restoring never deletes history: the old content becomes the newest version,
 * so a restore can itself be undone by restoring the version before it.
 */
export async function restoreVersion(db: Db, userId: string, docId: string, versionId: string): Promise<DocumentDetail> {
  const v = await getVersion(db, userId, docId, versionId);
  const content = sanitizeDocumentHtml(v.content);
  await db.execute({
    sql: "UPDATE documents SET title = ?, content = ?, version = version + 1, updated_at = ? WHERE id = ?",
    args: [v.title, content, new Date().toISOString(), docId],
  });
  const doc = await getDocument(db, userId, docId);
  const when = new Date(v.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  await recordVersion(db, doc, userId, { label: `Restored from ${when} UTC` });
  await logActivity(db, docId, userId, "restored", { from: when });
  return doc;
}
