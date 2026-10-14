"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/auth";
import type { Share, ShareRole } from "@/lib/documents";
import { api } from "@/lib/client";

export function ShareDialog({
  docId,
  isOwner,
  owner,
  onClose,
}: {
  docId: string;
  isOwner: boolean;
  owner: { id: string; name: string; email: string };
  onClose: () => void;
}) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [directory, setDirectory] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    api<{ shares: Share[] }>(`/api/documents/${docId}/shares`)
      .then((r) => setShares(r.shares))
      .catch((e) => setError(e.message));
    if (isOwner) api<{ users: User[] }>("/api/users").then((r) => setDirectory(r.users)).catch(() => {});
  }, [docId, isOwner]);

  async function run(fn: () => Promise<{ shares: Share[] }>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setShares((await fn()).shares);
      if (success) setNotice(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim();
    if (!target) return setError("Enter an email address");
    const ok = await run(
      () => api(`/api/documents/${docId}/shares`, { method: "POST", body: JSON.stringify({ email: target, role }) }),
      `Shared with ${target}`,
    );
    if (ok) setEmail("");
  }

  const sharedIds = new Set(shares?.map((s) => s.userId));
  const suggestions = directory.filter((u) => !sharedIds.has(u.id));

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} onCancel={onClose} aria-labelledby="share-title">
      <div className="dialog-head">
        <h2 id="share-title">{isOwner ? "Share document" : "People with access"}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {isOwner && (
        <form className="share-form" onSubmit={submit}>
          <input
            type="email"
            placeholder="Add people by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            list="share-directory"
            aria-label="Email to share with"
            autoFocus
          />
          <datalist id="share-directory">
            {suggestions.map((u) => (
              <option key={u.id} value={u.email}>{u.name}</option>
            ))}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)} aria-label="Access level">
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy}>Share</button>
        </form>
      )}
      {isOwner && suggestions.length > 0 && (
        <p className="muted small">
          Demo users:{" "}
          {suggestions.map((u, i) => (
            <span key={u.id}>
              {i > 0 && ", "}
              <button type="button" className="link-button" onClick={() => setEmail(u.email)}>{u.email}</button>
            </span>
          ))}
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <h3 className="people-heading">People with access</h3>
      <ul className="people">
        <li>
          <span>
            <strong>{owner.name}</strong> <span className="muted small">{owner.email}</span>
          </span>
          <span className="muted">Owner</span>
        </li>
        {shares === null && !error && <li className="muted">Loading…</li>}
        {shares?.map((s) => (
          <li key={s.userId}>
            <span>
              <strong>{s.name}</strong> <span className="muted small">{s.email}</span>
            </span>
            {isOwner ? (
              <span className="people-actions">
                <select
                  value={s.role}
                  disabled={busy}
                  aria-label={`Access for ${s.name}`}
                  onChange={(e) =>
                    run(() =>
                      api(`/api/documents/${docId}/shares`, {
                        method: "POST",
                        body: JSON.stringify({ email: s.email, role: e.target.value }),
                      }),
                    )
                  }
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button
                  className="link-button danger"
                  disabled={busy}
                  onClick={() => run(() => api(`/api/documents/${docId}/shares/${s.userId}`, { method: "DELETE" }), `Removed ${s.name}`)}
                >
                  Remove
                </button>
              </span>
            ) : (
              <span className="muted">{s.role === "editor" ? "Can edit" : "Can view"}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="dialog-foot">
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </dialog>
  );
}
