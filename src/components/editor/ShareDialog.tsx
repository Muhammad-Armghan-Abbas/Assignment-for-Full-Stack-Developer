"use client";

import { Check, Copy, Globe2, Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/auth";
import type { Person, Share, ShareRole } from "@/lib/documents";
import { api } from "@/lib/client";
import { Avatar } from "../ui/Avatar";
import { toast } from "../ui/Toaster";

const ROLE_OPTIONS: { value: ShareRole; label: string; hint: string }[] = [
  { value: "editor", label: "Editor", hint: "Can edit, comment and see history" },
  { value: "commenter", label: "Commenter", hint: "Can read and comment" },
  { value: "viewer", label: "Viewer", hint: "Can read only" },
];

export function ShareDialog({ docId, title, isOwner, owner, onClose }: { docId: string; title: string; isOwner: boolean; owner: Person; onClose: () => void }) {
  const [shares, setShares] = useState<Share[] | null>(null);
  const [directory, setDirectory] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    api<{ shares: Share[] }>(`/api/documents/${docId}/shares`).then((r) => setShares(r.shares)).catch((e) => setError(e.message));
    if (isOwner) api<{ users: User[] }>("/api/users").then((r) => setDirectory(r.users)).catch(() => {});
  }, [docId, isOwner]);

  async function run(fn: () => Promise<{ shares: Share[] }>, success?: string) {
    setBusy(true);
    setError(null);
    try {
      setShares((await fn()).shares);
      if (success) toast(success, "success");
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

  async function copyLink() {
    await navigator.clipboard?.writeText(location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const sharedIds = new Set(shares?.map((s) => s.userId));
  const suggestions = directory.filter((u) => !sharedIds.has(u.id));

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} onCancel={onClose} aria-labelledby="share-title">
      <div className="dialog-head">
        <h2 id="share-title">{isOwner ? <>Share “{title}”</> : "People with access"}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
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
            {suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)} aria-label="Access level">
            {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="btn btn-primary" disabled={busy}>Share</button>
        </form>
      )}
      {isOwner && suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((u) => (
            <button key={u.id} type="button" className="chip" onClick={() => setEmail(u.email)}>
              <Avatar name={u.name} color={u.color} src={u.avatarUrl} size={20} /> {u.email}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      <h3 className="people-heading">People with access</h3>
      <ul className="people">
        <li>
          <Avatar name={owner.name} color={owner.color} src={owner.avatarUrl} size={34} />
          <span className="people-name">
            <strong>{owner.name}</strong>
            <span className="muted small">{owner.email}</span>
          </span>
          <span className="muted">Owner</span>
        </li>
        {shares === null && !error && <li className="muted">Loading…</li>}
        {shares?.map((s) => (
          <li key={s.userId}>
            <Avatar name={s.name} color={s.color} src={s.avatarUrl} size={34} />
            <span className="people-name">
              <strong>{s.name}</strong>
              <span className="muted small">{s.email}</span>
            </span>
            {isOwner ? (
              <span className="people-actions">
                <select
                  value={s.role}
                  disabled={busy}
                  aria-label={`Access for ${s.name}`}
                  title={ROLE_OPTIONS.find((o) => o.value === s.role)?.hint}
                  onChange={(e) =>
                    run(
                      () => api(`/api/documents/${docId}/shares`, { method: "POST", body: JSON.stringify({ email: s.email, role: e.target.value }) }),
                      `${s.name} is now ${ROLE_OPTIONS.find((o) => o.value === e.target.value)?.label.toLowerCase()}`,
                    )
                  }
                >
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button
                  className="icon-btn"
                  disabled={busy}
                  aria-label={`Remove ${s.name}`}
                  title="Remove access"
                  onClick={() => run(() => api(`/api/documents/${docId}/shares/${s.userId}`, { method: "DELETE" }), `Removed ${s.name}`)}
                >
                  <X size={16} />
                </button>
              </span>
            ) : (
              <span className="muted">{ROLE_OPTIONS.find((o) => o.value === s.role)?.label}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="access-note">
        {shares && shares.length ? <Globe2 size={16} /> : <Lock size={16} />}
        <span className="small">
          {shares && shares.length ? "Only the people above can open this link." : "Private — only you can open this document."}
        </span>
      </div>

      <div className="dialog-foot">
        <button className="btn" onClick={copyLink}>
          {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}
        </button>
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </dialog>
  );
}
