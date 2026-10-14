import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listVersions } from "@/lib/versions";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  return NextResponse.json({ versions: await listVersions(await getDb(), user.id, id) });
});
