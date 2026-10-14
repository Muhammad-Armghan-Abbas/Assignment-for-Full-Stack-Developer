import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { listUsers, requireUser } from "@/lib/auth";

// Directory of people you can share with (all demo users except yourself).
export const GET = handle(async () => {
  const me = await requireUser();
  const users = (await listUsers()).filter((u) => u.id !== me.id);
  return NextResponse.json({ users });
});
