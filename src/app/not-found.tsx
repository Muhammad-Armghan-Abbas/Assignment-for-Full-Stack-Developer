import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="center-page">
      <div className="empty-card">
        <FileQuestion size={40} />
        <h1>Document not found</h1>
        <p className="muted">It may have been deleted, or it hasn&apos;t been shared with this account.</p>
        <Link href="/documents" className="btn btn-primary">Back to documents</Link>
      </div>
    </main>
  );
}
