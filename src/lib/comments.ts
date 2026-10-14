import { randomUUID } from "node:crypto";
import { authorize, can } from "./access";
import { logActivity } from "./activity";
import type { Db } from "./db";
import { badRequest, forbidden, notFound } from "./errors";

/**
 * Comment threads anchored to text.
 *
 * Anchors are stored as a text quote (+ a little preceding context) rather than
 * as marks inside the document HTML. That means:
 *   - commenters can comment without needing edit rights to the document body,
 *   - comments don't create document versions or edit conflicts,
 *   - if the quoted text is edited away, the thread survives as "detached".
 * The client re-finds the quote in the live document to draw highlights.
 */

export const MAX_COMMENT_LENGTH = 2000;
export const MAX_QUOTE_LENGTH = 500;

export interface CommentMessage {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; color: string };
}

export interface CommentThread {
  id: string;
  quote: string | null;
  prefix: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  createdAt: string;
  messages: CommentMessage[];
}

function normalizeBody(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw badRequest("Comment cannot be empty");
  const body = raw.trim();
  if (body.length > MAX_COMMENT_LENGTH) throw badRequest(`Comments are limited to ${MAX_COMMENT_LENGTH} characters`);
  return body;
}

export async function listThreads(db: Db, userId: string, docId: string): Promise<CommentThread[]> {
  await authorize(db, userId, docId, "read");
  const { rows } = await db.execute({
    sql: `SELECT c.*, u.name, u.color, r.name AS resolver_name
            FROM comments c
            JOIN users u ON u.id = c.author_id
            LEFT JOIN users r ON r.id = c.resolved_by
           WHERE c.document_id = ?
           ORDER BY c.created_at ASC`,
    args: [docId],
  });
  const threads = new Map<string, CommentThread>();
  for (const r of rows) {
    const msg: CommentMessage = {
      id: String(r.id),
      body: String(r.body),
      createdAt: String(r.created_at),
      author: { id: String(r.author_id), name: String(r.name), color: String(r.color) },
    };
    if (r.id === r.thread_id) {
      threads.set(String(r.id), {
        id: String(r.id),
        quote: r.quote ? String(r.quote) : null,
        prefix: r.prefix ? String(r.prefix) : null,
        resolved: Boolean(r.resolved),
        resolvedBy: r.resolver_name ? String(r.resolver_name) : null,
        createdAt: String(r.created_at),
        messages: [msg],
      });
    } else {
      threads.get(String(r.thread_id))?.messages.push(msg);
    }
  }
  return [...threads.values()];
}

export async function createThread(
  db: Db,
  userId: string,
  docId: string,
  input: { body?: unknown; quote?: unknown; prefix?: unknown },
): Promise<CommentThread[]> {
  await authorize(db, userId, docId, "comment");
  const body = normalizeBody(input.body);
  const quote = typeof input.quote === "string" ? input.quote.trim().slice(0, MAX_QUOTE_LENGTH) : "";
  if (!quote) throw badRequest("Select some text to comment on");
  const prefix = typeof input.prefix === "string" ? input.prefix.slice(-40) : "";
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO comments (id, document_id, thread_id, author_id, body, quote, prefix, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [id, docId, id, userId, body, quote, prefix, new Date().toISOString()],
  });
  await logActivity(db, docId, userId, "commented", { excerpt: body.slice(0, 80) });
  return listThreads(db, userId, docId);
}

async function getThreadRow(db: Db, docId: string, threadId: string) {
  const { rows } = await db.execute({
    sql: "SELECT * FROM comments WHERE id = ? AND document_id = ? AND thread_id = id",
    args: [threadId, docId],
  });
  if (!rows.length) throw notFound("Comment");
  return rows[0];
}

export async function replyToThread(db: Db, userId: string, docId: string, threadId: string, input: { body?: unknown }) {
  await authorize(db, userId, docId, "comment");
  const body = normalizeBody(input.body);
  const thread = await getThreadRow(db, docId, threadId);
  await db.batch(
    [
      {
        sql: `INSERT INTO comments (id, document_id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), docId, threadId, userId, body, new Date().toISOString()],
      },
      // Replying to a resolved thread reopens it, like most review tools.
      ...(thread.resolved ? [{ sql: "UPDATE comments SET resolved = 0, resolved_by = NULL WHERE id = ?", args: [threadId] }] : []),
    ],
    "write",
  );
  await logActivity(db, docId, userId, "commented", { excerpt: body.slice(0, 80) });
  return listThreads(db, userId, docId);
}

/** The thread's author, or anyone who can edit the document, may resolve or reopen it. */
export async function setResolved(db: Db, userId: string, docId: string, threadId: string, resolved: boolean) {
  const role = await authorize(db, userId, docId, "comment");
  const thread = await getThreadRow(db, docId, threadId);
  if (thread.author_id !== userId && !can(role, "edit")) {
    throw forbidden("Only the comment's author or an editor can resolve it");
  }
  await db.execute({
    sql: "UPDATE comments SET resolved = ?, resolved_by = ? WHERE id = ?",
    args: [resolved ? 1 : 0, resolved ? userId : null, threadId],
  });
  return listThreads(db, userId, docId);
}

/** Authors can delete their own messages; the owner can delete anything. Deleting a thread's first message deletes the thread. */
export async function deleteComment(db: Db, userId: string, docId: string, commentId: string) {
  const role = await authorize(db, userId, docId, "comment");
  const { rows } = await db.execute({ sql: "SELECT * FROM comments WHERE id = ? AND document_id = ?", args: [commentId, docId] });
  if (!rows.length) throw notFound("Comment");
  const c = rows[0];
  if (c.author_id !== userId && role !== "owner") throw forbidden("You can only delete your own comments");
  await db.execute({
    sql: c.id === c.thread_id ? "DELETE FROM comments WHERE thread_id = ?" : "DELETE FROM comments WHERE id = ?",
    args: [commentId],
  });
  return listThreads(db, userId, docId);
}
