import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listActivity } from "@/lib/activity";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listDocuments } from "@/lib/documents";
import { DocumentsHome } from "@/components/home/DocumentsHome";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();
  const [{ owned, shared }, activity] = await Promise.all([listDocuments(db, user.id), listActivity(db, user.id, 15)]);
  return <DocumentsHome user={user} owned={owned} shared={shared} activity={activity} />;
}
