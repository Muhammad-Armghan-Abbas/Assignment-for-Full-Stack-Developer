import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { deleteDocument, getDocument, updateDocument } from "@/lib/documents";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  return NextResponse.json({ document: await getDocument(await getDb(), user.id, id) });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(req);
  const doc = await updateDocument(await getDb(), user.id, id, {
    title: body.title,
    content: body.content,
    baseVersion: body.baseVersion,
  });
  return NextResponse.json({ document: doc });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteDocument(await getDb(), user.id, id);
  return NextResponse.json({ ok: true });
});
