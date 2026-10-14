import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getDocument } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { DocumentEditor } from "@/components/editor/DocumentEditor";

export const dynamic = "force-dynamic";

async function load(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    return { user, doc: await getDocument(await getDb(), user.id, id) };
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { doc } = await load((await params).id);
  return { title: doc.title };
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, doc } = await load((await params).id);
  return <DocumentEditor key={doc.id} user={user} initial={doc} />;
}
