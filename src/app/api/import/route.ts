import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { importDocument } from "@/lib/import";

export const runtime = "nodejs";

// Upload a .txt / .md / .docx file and turn it into a new editable document owned by the uploader.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a file in the 'file' field");
  const doc = await importDocument(await getDb(), user.id, file.name, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ document: doc }, { status: 201 });
});
