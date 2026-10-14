import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { badRequest } from "@/lib/errors";
import { convertFileToHtml, titleFromFilename } from "@/lib/import";

export const runtime = "nodejs";

// Upload a .txt / .md / .docx file and turn it into a new editable document owned by the uploader.
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw badRequest("Attach a file in the 'file' field");

  const html = await convertFileToHtml(file.name, Buffer.from(await file.arrayBuffer()));
  const doc = await createDocument(await getDb(), user.id, { title: titleFromFilename(file.name), content: html });
  return NextResponse.json({ document: doc }, { status: 201 });
});
