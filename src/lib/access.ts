import type { Db } from "./db";
import { forbidden, notFound } from "./errors";

/**
 * The single place that decides who may do what with a document.
 *
 *              read  comment  edit  manage (share, delete)
 *   owner       ✓      ✓       ✓       ✓
 *   editor      ✓      ✓       ✓
 *   commenter   ✓      ✓
 *   viewer      ✓
 *   (none)     404 — we never reveal that a document exists
 */

export type Role = "owner" | "editor" | "commenter" | "viewer";
export type ShareRole = Exclude<Role, "owner">;
export type Action = "read" | "comment" | "edit" | "manage";

export const SHARE_ROLES: readonly ShareRole[] = ["viewer", "commenter", "editor"];

const RANK: Record<Role, number> = { viewer: 0, commenter: 1, editor: 2, owner: 3 };
const REQUIRED: Record<Action, Role> = { read: "viewer", comment: "commenter", edit: "editor", manage: "owner" };

export function can(role: Role, action: Action): boolean {
  return RANK[role] >= RANK[REQUIRED[action]];
}

export async function resolveRole(db: Db, userId: string, docId: string): Promise<Role | null> {
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

const DENIED: Record<Action, string> = {
  read: "You don't have access to this document",
  comment: "You have view-only access to this document",
  edit: "You don't have edit access to this document",
  manage: "Only the owner can do this",
};

/** Resolve the caller's role and assert it allows `action`. 404 if no access at all, 403 if not enough. */
export async function authorize(db: Db, userId: string, docId: string, action: Action): Promise<Role> {
  const role = await resolveRole(db, userId, docId);
  if (!role) throw notFound();
  if (!can(role, action)) throw forbidden(DENIED[action]);
  return role;
}
