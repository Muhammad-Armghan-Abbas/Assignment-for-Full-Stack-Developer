"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DocumentDetail, DocumentSummary } from "@/lib/documents";
import { api, timeAgo } from "@/lib/client";

const ACCEPT = ".txt,.md,.docx";

export function DocumentsHome({ owned, shared }: { owned: DocumentSummary[]; shared: DocumentSummary[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"create" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy("create");
    setError(null);
    try {
      const { document } = await api<{ document: DocumentDetail }>("/api/documents", { method: "POST", body: "{}" });
      router.push(`/documents/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    setBusy("import");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { document } = await api<{ document: DocumentDetail }>("/api/import", { method: "POST", body: form });
      router.push(`/documents/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <main className="home">
      <section className="start">
        <div className="start-inner">
          <h1>Start a document</h1>
          <div className="start-actions">
            <button className="tile" onClick={create} disabled={busy !== null}>
              <span className="tile-icon">+</span>
              <span>{busy === "create" ? "Creating…" : "Blank document"}</span>
            </button>
            <button className="tile" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
              <span className="tile-icon">⇪</span>
              <span>{busy === "import" ? "Importing…" : "Import a file"}</span>
              <span className="muted small">.txt, .md or .docx · max 4 MB</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              hidden
              data-testid="import-input"
              onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
            />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </section>

      <DocSection title="My documents" docs={owned} empty="You haven't created any documents yet." showOwner={false} />
      <DocSection title="Shared with me" docs={shared} empty="Nothing has been shared with you yet." showOwner />
    </main>
  );
}

function DocSection({ title, docs, empty, showOwner }: { title: string; docs: DocumentSummary[]; empty: string; showOwner: boolean }) {
  return (
    <section className="doc-section" aria-label={title}>
      <h2>
        {title} <span className="count">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="muted empty">{empty}</p>
      ) : (
        <ul className="doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/documents/${d.id}`} className="doc-row">
                <span className="doc-icon" aria-hidden>▤</span>
                <span className="doc-title">{d.title}</span>
                {showOwner && <span className="muted small doc-owner">Owner: {d.owner.name}</span>}
                <span className={`badge badge-${d.role}`}>{d.role === "owner" ? "Owner" : d.role === "editor" ? "Can edit" : "Can view"}</span>
                <span className="muted small doc-updated">{timeAgo(d.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
