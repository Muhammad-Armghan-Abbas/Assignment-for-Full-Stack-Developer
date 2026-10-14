import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { restoreVersion } from "@/lib/versions";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, versionId } = await params;
  return NextResponse.json({ document: await restoreVersion(await getDb(), user.id, id, versionId) });
});
