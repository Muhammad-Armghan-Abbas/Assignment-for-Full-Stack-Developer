import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { unshareDocument } from "@/lib/documents";

type Ctx = { params: Promise<{ id: string; userId: string }> };

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, userId } = await params;
  return NextResponse.json({ shares: await unshareDocument(await getDb(), user.id, id, userId) });
});
