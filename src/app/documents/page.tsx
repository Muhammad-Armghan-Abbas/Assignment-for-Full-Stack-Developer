import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listDocuments } from "@/lib/documents";
import { AppHeader } from "@/components/AppHeader";
import { DocumentsHome } from "@/components/DocumentsHome";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { owned, shared } = await listDocuments(await getDb(), user.id);
  return (
    <>
      <AppHeader user={user} />
      <DocumentsHome owned={owned} shared={shared} />
    </>
  );
}
