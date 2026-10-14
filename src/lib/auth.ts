import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { AppError } from "./errors";

/**
 * Mocked authentication: reviewers pick one of the seeded users. The session
 * cookie is an HMAC-signed user id, so it can't be forged by editing the
 * cookie — the only shortcut is that there's no password.
 */

export const SESSION_COOKIE = "ajaia_session";

export interface User {
  id: string;
  email: string;
  name: string;
  color: string;
  avatarUrl: string | null;
}

let warned = false;
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("SESSION_SECRET is not set; using an insecure default.");
  }
  return s || "dev-only-insecure-secret";
}

const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");

export function encodeSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

export async function listUsers(): Promise<User[]> {
  const db = await getDb();
  const { rows } = await db.execute("SELECT id, email, name, color, avatar_url FROM users ORDER BY name");
  return rows.map((r) => ({ id: String(r.id), email: String(r.email), name: String(r.name), color: String(r.color), avatarUrl: r.avatar_url ? String(r.avatar_url) : null }));
}

export async function getCurrentUser(): Promise<User | null> {
  const userId = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const db = await getDb();
  const { rows } = await db.execute({ sql: "SELECT id, email, name, color, avatar_url FROM users WHERE id = ?", args: [userId] });
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: String(r.id), email: String(r.email), name: String(r.name), color: String(r.color), avatarUrl: r.avatar_url ? String(r.avatar_url) : null };
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AppError(401, "unauthorized", "Please sign in");
  return user;
}
