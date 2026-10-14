"use client";

import { History, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { VersionSummary } from "@/lib/versions";
import { api } from "@/lib/client";
import { Avatar } from "../ui/Avatar";

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function HistoryPanel({
  docId,
  refreshKey,
  previewId,
  onPreview,
  onRestore,
  onClose,
}: {
  docId: string;
  refreshKey: number;
  previewId: string | null;
  onPreview: (v: VersionSummary | null) => void;
  onRestore: (v: VersionSummary) => Promise<void>;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ versions: VersionSummary[] }>(`/api/documents/${docId}/versions`)
      .then((r) => setVersions(r.versions))
      .catch((e) => setError(e.message));
  }, [docId]);
  useEffect(load, [load, refreshKey]);

  let lastDay = "";
  return (
    <aside className="side-panel" aria-label="Version history">
      <div className="side-head">
        <h2><History size={17} /> Version history</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close history"><X size={18} /></button>
      </div>
      <p className="muted small pad">Each entry is an editing session. Select one to preview it; restoring keeps all history.</p>
      <div className="side-body">
        {error && <p className="error pad">{error}</p>}
        {versions === null && !error && <p className="muted small pad">Loading…</p>}
        <ol className="versions">
          {versions?.map((v, i) => {
            const day = dayLabel(v.updatedAt);
            const header = day !== lastDay ? ((lastDay = day), <li key={`d-${day}`} className="version-day">{day}</li>) : null;
            return [
              header,
              <li key={v.id}>
                <button
                  className={`version${previewId === v.id ? " is-active" : ""}`}
                  onClick={() => onPreview(i === 0 ? null : v)}
                  data-testid="version-item"
                >
                  <span className="version-time">{fmt(v.updatedAt)} {i === 0 && <span className="pill">Current</span>}</span>
                  {v.label && <span className="version-label">{v.label}</span>}
                  <span className="version-author">
                    <Avatar name={v.author.name} color={v.author.color} src={v.author.avatarUrl} size={18} /> {v.author.name}
                    <span className="muted small">· {v.words} words</span>
                  </span>
                </button>
                {previewId === v.id && i > 0 && (
                  <div className="version-actions">
                    {confirm === v.id ? (
                      <>
                        <span className="small">Replace the current document with this version?</span>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={async () => {
                            await onRestore(v);
                            setConfirm(null);
                            load();
                          }}
                        >
                          Restore
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" onClick={() => setConfirm(v.id)}>
                        <RotateCcw size={14} /> Restore this version
                      </button>
                    )}
                  </div>
                )}
              </li>,
            ];
          })}
        </ol>
      </div>
    </aside>
  );
}
