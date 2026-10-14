import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createThread, listThreads } from "@/lib/comments";
import { getDb } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  return NextResponse.json({ threads: await listThreads(await getDb(), user.id, id) });
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(req);
  const threads = await createThread(await getDb(), user.id, id, { body: body.body, quote: body.quote, prefix: body.prefix });
  return NextResponse.json({ threads }, { status: 201 });
});
