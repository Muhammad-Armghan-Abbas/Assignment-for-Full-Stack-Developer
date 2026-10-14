import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deleteComment, replyToThread, setResolved } from "@/lib/comments";
import { getDb } from "@/lib/db";
import { badRequest } from "@/lib/errors";

type Ctx = { params: Promise<{ id: string; commentId: string }> };

/** Reply to a thread. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, commentId } = await params;
  const body = await readJson(req);
  return NextResponse.json({ threads: await replyToThread(await getDb(), user.id, id, commentId, { body: body.body }) });
});

/** Resolve or reopen a thread: { resolved: boolean } */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, commentId } = await params;
  const body = await readJson(req);
  if (typeof body.resolved !== "boolean") throw badRequest("resolved must be true or false");
  return NextResponse.json({ threads: await setResolved(await getDb(), user.id, id, commentId, body.resolved) });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, commentId } = await params;
  return NextResponse.json({ threads: await deleteComment(await getDb(), user.id, id, commentId) });
});
