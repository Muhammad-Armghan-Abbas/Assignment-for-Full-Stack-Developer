import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listShares, shareDocument } from "@/lib/documents";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  return NextResponse.json({ shares: await listShares(await getDb(), user.id, id) });
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await readJson(req);
  const shares = await shareDocument(await getDb(), user.id, id, { email: body.email, role: body.role });
  return NextResponse.json({ shares });
});
