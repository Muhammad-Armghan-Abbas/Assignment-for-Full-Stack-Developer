"use client";

import { Check, CornerDownRight, MessageSquare, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CommentThread } from "@/lib/comments";
import type { Role } from "@/lib/documents";
import { timeAgo } from "@/lib/client";
import { Avatar } from "../ui/Avatar";
import { usePopover } from "../ui/usePopover";

export interface Draft {
  quote: string;
  prefix: string;
}

export function CommentsPanel({
  threads,
  me,
  role,
  draft,
  activeId,
  detached,
  onSelect,
  onCreate,
  onCancelDraft,
  onReply,
  onResolve,
  onDelete,
  onClose,
}: {
  threads: CommentThread[] | null;
  me: string;
  role: Role;
  draft: Draft | null;
  activeId: string | null;
  detached: Set<string>;
  onSelect: (id: string | null) => void;
  onCreate: (body: string) => Promise<boolean>;
  onCancelDraft: () => void;
  onReply: (id: string, body: string) => Promise<boolean>;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const canComment = role !== "viewer";
  const canModerate = role === "owner" || role === "editor";
  const list = (threads ?? []).filter((t) => (tab === "open" ? !t.resolved : t.resolved));
  const openCount = (threads ?? []).filter((t) => !t.resolved).length;

  return (
    <aside className="side-panel" aria-label="Comments">
      <div className="side-head">
        <h2><MessageSquare size={17} /> Comments</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close comments"><X size={18} /></button>
      </div>
      <div className="seg">
        <button className={tab === "open" ? "is-active" : ""} onClick={() => setTab("open")}>Open {openCount > 0 && <span className="count">{openCount}</span>}</button>
        <button className={tab === "resolved" ? "is-active" : ""} onClick={() => setTab("resolved")}>Resolved</button>
      </div>

      <div className="side-body">
        {draft && (
          <Composer
            quote={draft.quote}
            placeholder="Add a comment…"
            submitLabel="Comment"
            autoFocus
            onSubmit={onCreate}
            onCancel={onCancelDraft}
          />
        )}
        {threads === null && <p className="muted small pad">Loading comments…</p>}
        {threads !== null && list.length === 0 && !draft && (
          <div className="side-empty">
            <MessageSquare size={28} />
            <p>{tab === "open" ? "No open comments." : "No resolved comments."}</p>
            {tab === "open" && canComment && <p className="muted small">Select text in the document and choose <strong>Comment</strong>.</p>}
          </div>
        )}
        {list.map((t) => (
          <article
            key={t.id}
            className={`thread${t.id === activeId ? " is-active" : ""}${t.resolved ? " is-resolved" : ""}`}
            onClick={() => onSelect(t.id)}
            data-testid="comment-thread"
          >
            {t.quote && (
              <blockquote className={`thread-quote${detached.has(t.id) ? " is-detached" : ""}`} title={detached.has(t.id) ? "The original text was changed or removed" : undefined}>
                {t.quote}
                {detached.has(t.id) && !t.resolved && <span className="detached-tag">text changed</span>}
              </blockquote>
            )}
            {t.messages.map((m, i) => (
              <div key={m.id} className={`msg${i > 0 ? " is-reply" : ""}`}>
                <div className="msg-head">
                  <Avatar name={m.author.name} color={m.author.color} src={m.author.avatarUrl} size={26} />
                  <div>
                    <strong>{m.author.id === me ? "You" : m.author.name}</strong>
                    <span className="muted small">{timeAgo(m.createdAt)}</span>
                  </div>
                  {i === 0 && canComment && (
                    <span className="msg-actions" onClick={(e) => e.stopPropagation()}>
                      {(m.author.id === me || canModerate) && (
                        <button
                          className="icon-btn"
                          title={t.resolved ? "Reopen" : "Resolve"}
                          aria-label={t.resolved ? "Reopen thread" : "Resolve thread"}
                          onClick={() => onResolve(t.id, !t.resolved)}
                        >
                          {t.resolved ? <RotateCcw size={16} /> : <Check size={17} />}
                        </button>
                      )}
                      {(m.author.id === me || role === "owner") && <MoreMenu onDelete={() => onDelete(t.id)} />}
                    </span>
                  )}
                  {i > 0 && (m.author.id === me || role === "owner") && (
                    <span className="msg-actions" onClick={(e) => e.stopPropagation()}>
                      <MoreMenu onDelete={() => onDelete(m.id)} />
                    </span>
                  )}
                </div>
                <p className="msg-body">{m.body}</p>
              </div>
            ))}
            {t.resolved && t.resolvedBy && <p className="muted small resolved-by"><Check size={13} /> Resolved by {t.resolvedBy}</p>}
            {t.id === activeId && canComment && (
              <div onClick={(e) => e.stopPropagation()}>
                <Composer placeholder={t.resolved ? "Reply to reopen…" : "Reply…"} submitLabel="Reply" onSubmit={(b) => onReply(t.id, b)} compact />
              </div>
            )}
          </article>
        ))}
      </div>
    </aside>
  );
}

function MoreMenu({ onDelete }: { onDelete: () => void }) {
  const { open, toggle, setOpen, ref } = usePopover();
  return (
    <span className="menu" ref={ref}>
      <button className="icon-btn" aria-label="More actions" onClick={toggle}><MoreHorizontal size={16} /></button>
      {open && (
        <div className="menu-list menu-right" role="menu">
          <button role="menuitem" className="danger" onClick={() => (setOpen(false), onDelete())}><Trash2 size={15} /> Delete</button>
        </div>
      )}
    </span>
  );
}

function Composer({
  quote,
  placeholder,
  submitLabel,
  autoFocus,
  compact,
  onSubmit,
  onCancel,
}: {
  quote?: string;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  compact?: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(body.trim());
    setBusy(false);
    if (ok) setBody("");
  }
  return (
    <div className={`composer${compact ? " is-compact" : ""}`}>
      {quote && <blockquote className="thread-quote">{quote}</blockquote>}
      <textarea
        ref={ref}
        rows={compact ? 1 : 3}
        value={body}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={2000}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") onCancel?.();
        }}
      />
      {(body || !compact || onCancel) && (
        <div className="composer-actions">
          {onCancel && <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
          <button className="btn btn-primary btn-sm" disabled={!body.trim() || busy} onClick={submit}>
            {compact && <CornerDownRight size={14} />} {submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}
