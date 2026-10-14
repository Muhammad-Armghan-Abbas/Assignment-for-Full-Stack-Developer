import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { leave, sync } from "@/lib/presence";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Heartbeat + change check in one cheap call, polled every few seconds by open editors.
 * Body: { editing?: boolean, leave?: boolean }. `leave` is sent via sendBeacon when the tab closes.
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  if (body?.leave) {
    await leave(db, user.id, id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(await sync(db, user.id, id, Boolean(body?.editing)));
});
