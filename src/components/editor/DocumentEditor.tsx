"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  AlertTriangle, ArrowLeft, Cloud, CloudOff, Eye, History, Loader2, MessageSquare, MoreVertical, PanelLeft, Share2, Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@/lib/auth";
import { ApiError, api, timeAgo } from "@/lib/client";
import type { CommentThread } from "@/lib/comments";
import type { DocumentDetail } from "@/lib/documents";
import type { PresenceUser, SyncState } from "@/lib/presence";
import type { VersionDetail, VersionSummary } from "@/lib/versions";
import { ROLE_LABEL } from "../home/DocCard";
import { AvatarStack } from "../ui/Avatar";
import { toast } from "../ui/Toaster";
import { UserMenu } from "../ui/UserMenu";
import { usePopover } from "../ui/usePopover";
import { CommentsPanel, type Draft } from "./CommentsPanel";
import { findAnchor, setAnchors } from "./commentHighlights";
import { ExportMenu } from "./ExportMenu";
import { buildExtensions } from "./extensions";
import { HistoryPanel } from "./HistoryPanel";
import { LinkDialog } from "./LinkDialog";
import { OutlinePanel } from "./OutlinePanel";
import { SelectionMenu } from "./SelectionMenu";
import { ShareDialog } from "./ShareDialog";
import { Toolbar } from "./Toolbar";

type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";
type Patch = { title?: string; content?: string };
type Panel = "comments" | "history" | null;

const SAVE_DELAY_MS = 800;
const SYNC_MS = 4000;
const EDITING_WINDOW_MS = 15_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function DocumentEditor({ user, initial }: { user: User; initial: DocumentDetail }) {
  const router = useRouter();
  const role = initial.role;
  const canEdit = role === "owner" || role === "editor";
  const canComment = role !== "viewer";
  const isOwner = role === "owner";

  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [threads, setThreads] = useState<CommentThread[] | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detached, setDetached] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<VersionDetail | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [uploading, setUploading] = useState(0);

  const versionRef = useRef(initial.version);
  const pendingRef = useRef<Patch>({});
  const inFlightRef = useRef(false);
  const statusRef = useRef<SaveStatus>("saved");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEditRef = useRef(0);
  const titleFocusedRef = useRef(false);
  const commentsKeyRef = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectThreadRef = useRef<(id: string) => void>(() => {});
  const lastHtmlRef = useRef<string | null>(null);

  const setSaveStatus = (s: SaveStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  /* ---------------------------------------------------------------- saving */

  /** Send whatever is pending. One request in flight at a time; edits made meanwhile go in the next one. */
  const flush = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (inFlightRef.current || statusRef.current === "conflict") return;
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;
    pendingRef.current = {};
    inFlightRef.current = true;
    setSaveStatus("saving");
    try {
      const { document } = await api<{ document: DocumentDetail }>(`/api/documents/${initial.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...patch, baseVersion: versionRef.current }),
      });
      versionRef.current = document.version;
      setUpdatedAt(document.updatedAt);
      setSavedTitle(document.title);
      setErrorMsg(null);
      setSaveStatus(Object.keys(pendingRef.current).length ? "unsaved" : "saved");
    } catch (e) {
      pendingRef.current = { ...patch, ...pendingRef.current }; // keep unsent edits
      const err = e as ApiError;
      if (err.status === 409) setSaveStatus("conflict");
      else if ([400, 403, 404].includes(err.status)) {
        setSaveStatus("error");
        setErrorMsg(err.message);
      } else {
        setSaveStatus("error");
        timerRef.current = setTimeout(() => void flush(), 3000);
      }
    } finally {
      inFlightRef.current = false;
    }
    if (Object.keys(pendingRef.current).length && statusRef.current === "unsaved") void flush();
  }, [initial.id]);

  const queue = useCallback(
    (patch: Patch) => {
      Object.assign(pendingRef.current, patch);
      lastEditRef.current = Date.now();
      if (statusRef.current !== "conflict" && !inFlightRef.current) setSaveStatus("unsaved");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  /* ---------------------------------------------------------------- images */

  const uploadImages = useCallback(
    async (files: File[], at?: number) => {
      const images = files.filter((f) => IMAGE_TYPES.includes(f.type));
      if (!images.length) return toast("Only PNG, JPEG, GIF and WebP images are supported", "error");
      for (const file of images) {
        if (file.size > 3 * 1024 * 1024) {
          toast(`“${file.name}” is larger than 3 MB`, "error");
          continue;
        }
        setUploading((n) => n + 1);
        try {
          const form = new FormData();
          form.append("file", file);
          const { asset } = await api<{ asset: { url: string } }>(`/api/documents/${initial.id}/assets`, { method: "POST", body: form });
          const ed = editorRef.current;
          if (!ed) continue;
          const chain = ed.chain().focus();
          (at !== undefined ? chain.insertContentAt(at, { type: "image", attrs: { src: asset.url, alt: file.name } }) : chain.setImage({ src: asset.url, alt: file.name })).run();
        } catch (e) {
          toast((e as Error).message, "error");
        } finally {
          setUploading((n) => n - 1);
        }
      }
    },
    [initial.id],
  );

  /* ---------------------------------------------------------------- editor */

  const extensions = useMemo(
    () => buildExtensions({ editable: canEdit, onPickImage: () => fileInput.current?.click(), onSelectThread: (id) => selectThreadRef.current(id) }),
    [canEdit],
  );

  const editor = useEditor({
    extensions,
    content: initial.content,
    editable: canEdit,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "doc-body", "aria-label": "Document content", spellcheck: "true" },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!canEdit || !files.length) return false;
        void uploadImages(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
        if (!canEdit || !files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos;
        void uploadImages(files, pos);
        return true;
      },
    },
    onCreate: ({ editor: e }) => {
      lastHtmlRef.current = e.getHTML();
    },
    onUpdate: ({ editor: e }) => {
      if (!e.isEditable) return;
      const html = e.getHTML();
      if (html === lastHtmlRef.current) return; // selection-only or no-op transactions
      lastHtmlRef.current = html;
      queue({ content: html });
    },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const counts = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ words: e?.storage.characterCount.words() ?? 0, chars: e?.storage.characterCount.characters() ?? 0 }),
  });

  /* -------------------------------------------------------------- comments */

  const loadThreads = useCallback(async () => {
    try {
      const { threads: t } = await api<{ threads: CommentThread[] }>(`/api/documents/${initial.id}/comments`);
      setThreads(t);
    } catch {
      /* keep the previous list; sync will retry */
    }
  }, [initial.id]);

  useEffect(() => void loadThreads(), [loadThreads]);

  // Redraw highlights whenever threads, the active thread or the document change.
  useEffect(() => {
    if (!editor || !threads) return;
    setAnchors(editor, threads.map((t) => ({ id: t.id, quote: t.quote, prefix: t.prefix, resolved: t.resolved })), activeThread);
    const missing = new Set(threads.filter((t) => t.quote && !findAnchor(editor.state.doc, t.quote, t.prefix)).map((t) => t.id));
    setDetached(missing);
  }, [editor, threads, activeThread]);

  selectThreadRef.current = (id: string) => {
    setPanel("comments");
    setActiveThread(id);
    setTimeout(() => document.querySelector(".thread.is-active")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
  };

  const startComment = useCallback(() => {
    if (!editor || !canComment) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return toast("Select the text you want to comment on", "info");
    const quote = editor.state.doc.textBetween(from, to, "\n").trim();
    if (!quote) return toast("Select some text to comment on", "info");
    const prefix = editor.state.doc.textBetween(Math.max(0, from - 40), from, "\n");
    setDraft({ quote: quote.slice(0, 500), prefix });
    setActiveThread(null);
    setPanel("comments");
  }, [editor, canComment]);

  async function createThread(body: string) {
    if (!draft) return false;
    try {
      const { threads: t } = await api<{ threads: CommentThread[] }>(`/api/documents/${initial.id}/comments`, {
        method: "POST",
        body: JSON.stringify({ body, quote: draft.quote, prefix: draft.prefix }),
      });
      setThreads(t);
      setActiveThread(t[t.length - 1]?.id ?? null);
      setDraft(null);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  }

  async function threadAction(fn: () => Promise<{ threads: CommentThread[] }>) {
    try {
      setThreads((await fn()).threads);
      return true;
    } catch (e) {
      toast((e as Error).message, "error");
      return false;
    }
  }

  /* ------------------------------------------------------------------ sync */

  const applyRemote = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    const { document: remote } = await api<{ document: DocumentDetail }>(`/api/documents/${initial.id}`);
    // The user may have typed while that request was in flight.
    if (remote.version <= versionRef.current || statusRef.current !== "saved" || Object.keys(pendingRef.current).length) return;
    versionRef.current = remote.version;
    const { from, to } = ed.state.selection;
    ed.commands.setContent(remote.content, { emitUpdate: false });
    lastHtmlRef.current = ed.getHTML();
    const max = ed.state.doc.content.size;
    ed.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
    if (!titleFocusedRef.current) setTitle(remote.title);
    setSavedTitle(remote.title);
    setUpdatedAt(remote.updatedAt);
    setThreads((t) => (t ? [...t] : t)); // re-anchor highlights against the new content
  }, [initial.id]);

  useEffect(() => {
    if (!editor) return;
    let stopped = false;
    const tick = async () => {
      if (document.hidden || stopped) return;
      try {
        const s = await api<SyncState>(`/api/documents/${initial.id}/sync`, {
          method: "POST",
          body: JSON.stringify({ editing: canEdit && Date.now() - lastEditRef.current < EDITING_WINDOW_MS }),
        });
        setPresence(s.presence);
        if (commentsKeyRef.current !== null && commentsKeyRef.current !== s.commentsKey) void loadThreads();
        commentsKeyRef.current = s.commentsKey;
        if (s.version > versionRef.current && statusRef.current === "saved" && !inFlightRef.current) await applyRemote();
      } catch (e) {
        if ((e as ApiError).status === 404) {
          setErrorMsg("This document was deleted or your access was removed.");
          setSaveStatus("error");
          stopped = true;
        }
      }
    };
    void tick();
    const id = setInterval(tick, SYNC_MS);
    const leave = () => navigator.sendBeacon?.(`/api/documents/${initial.id}/sync`, JSON.stringify({ leave: true }));
    window.addEventListener("pagehide", leave);
    return () => {
      stopped = true;
      clearInterval(id);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [editor, initial.id, canEdit, applyRemote, loadThreads]);

  /* ------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
      } else if (mod && e.key.toLowerCase() === "k" && canEdit) {
        e.preventDefault();
        setLinkOpen(true);
      } else if (mod && e.altKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        startComment();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (statusRef.current !== "saved") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush, startComment, canEdit]);

  /* ------------------------------------------------------- title & actions */

  function commitTitle() {
    const next = title.replace(/\s+/g, " ").trim();
    if (!next) return setTitle(savedTitle);
    if (next !== savedTitle) {
      setTitle(next);
      queue({ title: next });
      void flush();
    }
  }

  async function overwriteWithMine() {
    if (!editor) return;
    try {
      const { document: remote } = await api<{ document: DocumentDetail }>(`/api/documents/${initial.id}`);
      versionRef.current = remote.version;
      pendingRef.current = { content: editor.getHTML(), title: title.trim() || savedTitle };
      setSaveStatus("unsaved");
      void flush();
    } catch (e) {
      setErrorMsg((e as Error).message);
    }
  }

  async function openPreview(v: VersionSummary | null) {
    if (!v) return setPreview(null);
    try {
      const { version } = await api<{ version: VersionDetail }>(`/api/documents/${initial.id}/versions/${v.id}`);
      setPreview(version);
      document.querySelector(".page-wrap")?.scrollTo({ top: 0 });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function restore(v: VersionSummary) {
    await flush();
    try {
      const { document } = await api<{ document: DocumentDetail }>(`/api/documents/${initial.id}/versions/${v.id}/restore`, { method: "POST" });
      versionRef.current = document.version;
      editor?.commands.setContent(document.content, { emitUpdate: false });
      lastHtmlRef.current = editor?.getHTML() ?? null;
      setTitle(document.title);
      setSavedTitle(document.title);
      setUpdatedAt(document.updatedAt);
      setPreview(null);
      setSaveStatus("saved");
      setThreads((t) => (t ? [...t] : t));
      toast("Version restored", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function deleteDoc() {
    try {
      await api(`/api/documents/${initial.id}`, { method: "DELETE" });
      statusRef.current = "saved";
      toast(`Deleted “${savedTitle}”`, "success");
      router.push("/documents");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const openThreads = threads?.filter((t) => !t.resolved).length ?? 0;
  const others = presence.filter((p) => p.id !== user.id);

  return (
    <div className="editor-shell">
      <div className="editor-top">
        <header className="topbar topbar-editor">
          <Link href="/documents" className="back-btn" aria-label="All documents" title="All documents">
            <ArrowLeft size={18} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ajaia-mark.png" alt="" width={24} height={22} />
          </Link>
          <div className="doc-meta">
            <input
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => (titleFocusedRef.current = true)}
              onBlur={() => {
                titleFocusedRef.current = false;
                commitTitle();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setTitle(savedTitle);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              readOnly={!canEdit}
              maxLength={200}
              aria-label="Document title"
            />
            <div className="doc-sub">
              {canEdit ? <SaveIndicator status={status} /> : <span className={`badge badge-${role}`}>{role === "viewer" ? <Eye size={12} /> : <MessageSquare size={12} />} {ROLE_LABEL[role]}</span>}
              <span className="muted small doc-edited">
                Edited {timeAgo(updatedAt)}
                {!isOwner && ` · Owned by ${initial.owner.name}`}
              </span>
              {uploading > 0 && <span className="muted small"><Loader2 size={12} className="spin" /> Uploading image…</span>}
            </div>
          </div>

          <div className="doc-actions">
            {others.length > 0 && <AvatarStack people={others} />}
            <button
              className={`icon-btn icon-btn-lg${panel === "comments" ? " is-active" : ""}`}
              onClick={() => setPanel(panel === "comments" ? null : "comments")}
              aria-label={`Comments (${openThreads} open)`}
              title="Comments"
            >
              <MessageSquare size={19} />
              {openThreads > 0 && <span className="dot-count">{openThreads}</span>}
            </button>
            {canEdit && (
              <button
                className={`icon-btn icon-btn-lg${panel === "history" ? " is-active" : ""}`}
                onClick={() => {
                  setPreview(null);
                  setPanel(panel === "history" ? null : "history");
                }}
                aria-label="Version history"
                title="Version history"
              >
                <History size={19} />
              </button>
            )}
            <ExportMenu editor={editor} title={title} />
            {isOwner && <MoreMenu onDelete={deleteDoc} />}
            <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
              <Share2 size={16} /> <span className="btn-label">{isOwner ? "Share" : "People"}</span>
            </button>
            <UserMenu user={user} />
          </div>
        </header>

        {!preview && <Toolbar editor={editor} canEdit={canEdit} canComment={canComment} onImage={() => fileInput.current?.click()} onLink={() => setLinkOpen(true)} onComment={startComment} />}

        {status === "conflict" && (
          <div className="banner banner-warn" role="alert">
            <AlertTriangle size={16} /> Someone else saved this document while you were editing, so your latest changes were not saved.
            <button className="btn btn-sm" onClick={() => ((statusRef.current = "saved"), window.location.reload())}>Load their version</button>
            <button className="btn btn-sm" onClick={overwriteWithMine}>Keep mine (overwrite)</button>
          </div>
        )}
        {errorMsg && <div className="banner banner-error" role="alert"><AlertTriangle size={16} /> {errorMsg}</div>}
        {role === "viewer" && <div className="banner banner-info"><Eye size={16} /> You have view-only access. Ask {initial.owner.name} for edit access.</div>}
        {preview && (
          <div className="banner banner-preview" role="status">
            <History size={16} /> Previewing the version from {new Date(preview.updatedAt).toLocaleString()} by {preview.author.name}.
            <button className="btn btn-sm" onClick={() => setPreview(null)}>Back to current</button>
          </div>
        )}
      </div>

      <div className="workspace">
        {outlineOpen && !preview && (
          <div className="outline-col">
            <OutlinePanel editor={editor} />
          </div>
        )}
        <button className="outline-toggle icon-btn" onClick={() => setOutlineOpen((o) => !o)} aria-label={outlineOpen ? "Hide outline" : "Show outline"} title={outlineOpen ? "Hide outline" : "Show outline"}>
          <PanelLeft size={17} />
        </button>

        <main className="page-wrap" onClick={() => !preview && editor?.commands.focus()}>
          <div className="page" onClick={(e) => e.stopPropagation()}>
            {preview ? (
              <>
                <h1 className="preview-title">{preview.title}</h1>
                <div className="doc-body is-preview" dangerouslySetInnerHTML={{ __html: preview.content }} />
              </>
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
          {editor && !preview && <SelectionMenu editor={editor} canEdit={canEdit} canComment={canComment} onLink={() => setLinkOpen(true)} onComment={startComment} />}
        </main>

        {panel === "comments" && (
          <CommentsPanel
            threads={threads}
            me={user.id}
            role={role}
            draft={draft}
            activeId={activeThread}
            detached={detached}
            onSelect={(id) => {
              setActiveThread(id);
              if (!id || !editor) return;
              const t = threads?.find((x) => x.id === id);
              const range = t?.quote ? findAnchor(editor.state.doc, t.quote, t.prefix) : null;
              if (range) (editor.view.domAtPos(range.from).node as HTMLElement)?.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
            }}
            onCreate={createThread}
            onCancelDraft={() => setDraft(null)}
            onReply={(id, body) => threadAction(() => api(`/api/documents/${initial.id}/comments/${id}`, { method: "POST", body: JSON.stringify({ body }) }))}
            onResolve={(id, resolved) => void threadAction(() => api(`/api/documents/${initial.id}/comments/${id}`, { method: "PATCH", body: JSON.stringify({ resolved }) })).then((ok) => ok && toast(resolved ? "Comment resolved" : "Comment reopened", "success"))}
            onDelete={(id) => void threadAction(() => api(`/api/documents/${initial.id}/comments/${id}`, { method: "DELETE" }))}
            onClose={() => {
              setPanel(null);
              setDraft(null);
              setActiveThread(null);
            }}
          />
        )}
        {panel === "history" && canEdit && (
          <HistoryPanel
            docId={initial.id}
            refreshKey={historyKey}
            previewId={preview?.id ?? null}
            onPreview={openPreview}
            onRestore={async (v) => {
              await restore(v);
              setHistoryKey((k) => k + 1);
            }}
            onClose={() => {
              setPanel(null);
              setPreview(null);
            }}
          />
        )}
      </div>

      <footer className="statusbar">
        <span>{counts?.words ?? 0} words</span>
        <span>{counts?.chars ?? 0} characters</span>
        <span>{Math.max(1, Math.round((counts?.words ?? 0) / 230))} min read</span>
        <span className="statusbar-spacer" />
        <span>{ROLE_LABEL[role]}</span>
      </footer>

      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        hidden
        data-testid="image-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void uploadImages(files);
        }}
      />
      {linkOpen && editor && <LinkDialog editor={editor} onClose={() => setLinkOpen(false)} />}
      {shareOpen && <ShareDialog docId={initial.id} title={savedTitle} isOwner={isOwner} owner={initial.owner} onClose={() => setShareOpen(false)} />}
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const map = {
    saved: [Cloud, "Saved"],
    unsaved: [Loader2, "Saving…"],
    saving: [Loader2, "Saving…"],
    error: [CloudOff, "Couldn't save — retrying"],
    conflict: [AlertTriangle, "Not saved — newer version exists"],
  } as const;
  const [Icon, label] = map[status];
  return (
    <span className={`save-status save-${status}`} role="status" aria-live="polite">
      <Icon size={14} className={status === "saving" || status === "unsaved" ? "spin" : ""} /> {status === "saved" ? "All changes saved" : label}
    </span>
  );
}

function MoreMenu({ onDelete }: { onDelete: () => void }) {
  const { open, toggle, setOpen, ref } = usePopover();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="menu" ref={ref}>
      <button className="icon-btn icon-btn-lg" onClick={() => (toggle(), setConfirm(false))} aria-label="More options" title="More options">
        <MoreVertical size={19} />
      </button>
      {open && (
        <div className="menu-list menu-right" role="menu">
          {confirm ? (
            <div className="menu-confirm">
              <p className="small">Delete this document for everyone? This can&apos;t be undone.</p>
              <div>
                <button className="btn btn-sm" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>
              </div>
            </div>
          ) : (
            <button role="menuitem" className="danger" onClick={() => setConfirm(true)}>
              <Trash2 size={16} /> Delete document
            </button>
          )}
        </div>
      )}
    </div>
  );
}
