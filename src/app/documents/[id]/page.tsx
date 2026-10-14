import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getDocument } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { DocumentEditor } from "@/components/DocumentEditor";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  try {
    const doc = await getDocument(await getDb(), user.id, id);
    return <DocumentEditor user={user} initial={doc} />;
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
