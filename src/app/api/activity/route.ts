import { NextResponse } from "next/server";
import { listActivity } from "@/lib/activity";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json({ activity: await listActivity(await getDb(), user.id) });
});
