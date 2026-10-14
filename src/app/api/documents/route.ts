import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createDocument, listDocuments } from "@/lib/documents";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json(await listDocuments(await getDb(), user.id));
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = req.headers.get("content-length") === "0" ? {} : await req.json().catch(() => ({}));
  const doc = await createDocument(await getDb(), user.id, { title: body?.title, content: body?.content });
  return NextResponse.json({ document: doc }, { status: 201 });
});
