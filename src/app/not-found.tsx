import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login">
      <div className="login-card">
        <h1>Document not found</h1>
        <p className="muted">It may have been deleted, or it hasn&apos;t been shared with this account.</p>
        <p>
          <Link href="/documents">← Back to documents</Link>
        </p>
      </div>
    </main>
  );
}
