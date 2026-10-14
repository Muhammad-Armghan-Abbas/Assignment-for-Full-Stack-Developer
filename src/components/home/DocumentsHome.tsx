"use client";

import { ArrowDownAZ, Clock, FileUp, Loader2, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { ActivityItem } from "@/lib/activity";
import type { User } from "@/lib/auth";
import type { DocumentDetail, DocumentSummary } from "@/lib/documents";
import { api } from "@/lib/client";
import { Logo } from "../ui/Logo";
import { toast } from "../ui/Toaster";
import { UserMenu } from "../ui/UserMenu";
import { ActivityFeed } from "./ActivityFeed";
import { DocCard } from "./DocCard";
import { TEMPLATES } from "./templates";

type Filter = "all" | "owned" | "shared";
type Sort = "recent" | "title";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function DocumentsHome({
  user,
  owned,
  shared,
  activity,
}: {
  user: User;
  owned: DocumentSummary[];
  shared: DocumentSummary[];
  activity: ActivityItem[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const prep = (docs: DocumentSummary[]) =>
      docs
        .filter((d) => !q || d.title.toLowerCase().includes(q) || d.excerpt.toLowerCase().includes(q) || d.owner.name.toLowerCase().includes(q))
        .sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)));
    return { owned: prep(owned), shared: prep(shared) };
  }, [owned, shared, query, sort]);

  async function create(templateId: string) {
    const t = TEMPLATES.find((x) => x.id === templateId)!;
    setBusy(templateId);
    setError(null);
    try {
      const body = t.id === "blank" ? {} : { title: t.title, content: t.html };
      const { document } = await api<{ document: DocumentDetail }>("/api/documents", { method: "POST", body: JSON.stringify(body) });
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
      toast(`Imported “${file.name}”`, "success");
      router.push(`/documents/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const showOwned = filter !== "shared";
  const showShared = filter !== "owned";

  return (
    <div className="home">
      <header className="topbar">
        <Logo />
        <label className="search">
          <Search size={16} />
          <input type="search" placeholder="Search documents" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
        </label>
        <UserMenu user={user} />
      </header>

      <section className="start">
        <div className="start-inner">
          <div className="start-head">
            <div>
              <h1>
                {greeting()}, {user.name.split(" ")[0]}
              </h1>
              <p className="muted">Start something new or pick up where your team left off.</p>
            </div>
            <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
              {busy === "import" ? <Loader2 size={16} className="spin" /> : <FileUp size={16} />} Import file
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.md,.docx"
              hidden
              data-testid="import-input"
              onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
            />
          </div>
          <div className="templates">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="template" onClick={() => create(t.id)} disabled={busy !== null} aria-label={t.name}>
                <span className={`template-thumb template-${t.id}`} aria-hidden>
                  {t.id === "blank" ? (busy === "blank" ? <Loader2 className="spin" /> : <Plus size={34} />) : <TemplateLines kind={t.id} />}
                </span>
                <span className="template-name">{busy === t.id && t.id !== "blank" ? "Creating…" : t.name}</span>
              </button>
            ))}
          </div>
          <p className="muted small">Import supports .txt, .md and .docx (including embedded images) up to 4 MB.</p>
          {error && <p className="error" role="alert">{error}</p>}
        </div>
      </section>

      <div className="home-body">
        <main className="home-main">
          <div className="list-controls">
            <div className="tabs" role="tablist" aria-label="Filter documents">
              {([
                ["all", "All", owned.length + shared.length],
                ["owned", "Owned by me", owned.length],
                ["shared", "Shared with me", shared.length],
              ] as const).map(([key, label, n]) => (
                <button key={key} role="tab" aria-selected={filter === key} className={`tab${filter === key ? " is-active" : ""}`} onClick={() => setFilter(key)}>
                  {label} <span className="count">{n}</span>
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSort(sort === "recent" ? "title" : "recent")} title="Change sort order">
              {sort === "recent" ? <Clock size={15} /> : <ArrowDownAZ size={15} />} {sort === "recent" ? "Last modified" : "Title A–Z"}
            </button>
          </div>

          {showOwned && <DocSection title="My documents" docs={visible.owned} empty={query ? "No matches." : "You haven't created any documents yet."} />}
          {showShared && <DocSection title="Shared with me" docs={visible.shared} empty={query ? "No matches." : "Nothing has been shared with you yet."} />}
        </main>
        <aside className="home-aside">
          <ActivityFeed items={activity} me={user.id} />
        </aside>
      </div>
    </div>
  );
}

function DocSection({ title, docs, empty }: { title: string; docs: DocumentSummary[]; empty: string }) {
  return (
    <section className="doc-section" aria-label={title}>
      <h2>
        {title} <span className="count">{docs.length}</span>
      </h2>
      {docs.length === 0 ? <p className="empty">{empty}</p> : <div className="doc-grid">{docs.map((d) => <DocCard key={d.id} doc={d} />)}</div>}
    </section>
  );
}

function TemplateLines({ kind }: { kind: string }) {
  const lines: Record<string, number[]> = { meeting: [70, 40, 90, 85, 60, 30], brief: [60, 100, 100, 100, 45, 80], retro: [75, 50, 90, 50, 85, 40] };
  return (
    <span className="tpl-lines">
      {(lines[kind] ?? []).map((w, i) => (
        <i key={i} style={{ width: `${w}%` }} className={i === 0 ? "tpl-h" : ""} />
      ))}
    </span>
  );
}
