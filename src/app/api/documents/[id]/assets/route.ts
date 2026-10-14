import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { storeAsset } from "@/lib/assets";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { badRequest } from "@/lib/errors";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Upload an image for this document (editors only). Returns the URL to embed. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach an image in the 'file' field");
  const asset = await storeAsset(await getDb(), user.id, id, new Uint8Array(await file.arrayBuffer()));
  return NextResponse.json({ asset }, { status: 201 });
});
