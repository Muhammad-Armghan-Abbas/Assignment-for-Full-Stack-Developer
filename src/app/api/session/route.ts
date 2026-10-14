import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { SESSION_COOKIE, encodeSession, listUsers } from "@/lib/auth";
import { badRequest } from "@/lib/errors";

// Mock sign-in: choose one of the seeded users.
export const POST = handle(async (req: Request) => {
  const { userId } = await readJson(req);
  const user = (await listUsers()).find((u) => u.id === userId);
  if (!user) throw badRequest("Unknown user");
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, encodeSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
});

export const DELETE = handle(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
