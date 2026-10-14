"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@/lib/auth";
import type { DocumentDetail } from "@/lib/documents";
import { ApiError, api, timeAgo } from "@/lib/client";
import { AppHeader } from "./AppHeader";
import { ExportMenu } from "./ExportMenu";
import { ShareDialog } from "./ShareDialog";
import { Toolbar } from "./Toolbar";

type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";
type Patch = { title?: string; content?: string };

const SAVE_DELAY_MS = 800;
const POLL_MS = 5000;

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: "All changes saved",
  unsaved: "Unsaved changes…",
  saving: "Saving…",
  error: "Couldn't save — retrying",
  conflict: "Not saved — newer version exists",
};

export function DocumentEditor({ user, initial }: { user: User; initial: DocumentDetail }) {
  const router = useRouter();
  const canEdit = initial.role !== "viewer";
  const isOwner = initial.role === "owner";

  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Refs hold the save-queue state so async callbacks always see the latest values.
  const versionRef = useRef(initial.version);
  const pendingRef = useRef<Patch>({});
  const inFlightRef = useRef(false);
  const statusRef = useRef<SaveStatus>("saved");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleFocusedRef = useRef(false);

  const setSaveStatus = (s: SaveStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  /** Send whatever is pending. Only one request is in flight at a time; edits made meanwhile are sent next. */
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
      pendingRef.current = { ...patch, ...pendingRef.current }; // keep the unsent edits
      const err = e as ApiError;
      if (err.status === 409) {
        setSaveStatus("conflict");
      } else if (err.status === 400 || err.status === 403 || err.status === 404) {
        setSaveStatus("error");
        setErrorMsg(err.message);
        return; // retrying won't help
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
      if (statusRef.current !== "conflict" && !inFlightRef.current) setSaveStatus("unsaved");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } })],
    content: initial.content,
    editable: canEdit,
    immediatelyRender: false,
    editorProps: { attributes: { class: "doc-body", "aria-label": "Document content" } },
    onUpdate: ({ editor }) => queue({ content: editor.getHTML() }),
  });

  // Ctrl/Cmd+S saves immediately; warn before leaving with unsaved edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flush();
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
  }, [flush]);

  // Lightweight sync: while idle, pick up changes collaborators saved.
  useEffect(() => {
    if (!editor) return;
    const id = setInterval(async () => {
      if (document.hidden || inFlightRef.current || statusRef.current !== "saved") return;
      try {
        const { document: remote } = await api<{ document: DocumentDetail }>(`/api/documents/${initial.id}`);
        // Re-check: the user may have typed while the request was in flight.
        if (remote.version <= versionRef.current || statusRef.current !== "saved" || Object.keys(pendingRef.current).length) return;
        versionRef.current = remote.version;
        const { from, to } = editor.state.selection;
        editor.commands.setContent(remote.content, { emitUpdate: false });
        const max = editor.state.doc.content.size;
        editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
        if (!titleFocusedRef.current) setTitle(remote.title);
        setSavedTitle(remote.title);
        setUpdatedAt(remote.updatedAt);
      } catch (e) {
        if ((e as ApiError).status === 404) {
          setErrorMsg("This document was deleted or your access was removed.");
          setSaveStatus("error");
        }
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [editor, initial.id]);

  function commitTitle() {
    const next = title.replace(/\s+/g, " ").trim();
    if (!next) {
      setTitle(savedTitle); // empty titles aren't allowed; revert
      return;
    }
    if (next !== savedTitle) {
      setTitle(next);
      queue({ title: next });
      void flush();
    }
  }

  function reloadLatest() {
    statusRef.current = "saved"; // the user chose to discard; don't trigger the leave-page prompt
    window.location.reload();
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

  async function deleteDoc() {
    try {
      await api(`/api/documents/${initial.id}`, { method: "DELETE" });
      statusRef.current = "saved";
      router.push("/documents");
      router.refresh();
    } catch (e) {
      setErrorMsg((e as Error).message);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="editor-shell">
      <div className="editor-top">
      <AppHeader user={user}>
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
            {canEdit ? (
              <span className={`save-status save-${status}`} role="status" aria-live="polite">
                {STATUS_LABEL[status]}
              </span>
            ) : (
              <span className="badge badge-viewer">View only</span>
            )}
            <span className="muted small">
              · Edited {timeAgo(updatedAt)}
              {!isOwner && ` · Owned by ${initial.owner.name}`}
            </span>
          </div>
        </div>
        <div className="doc-actions">
          <ExportMenu editor={editor} title={title} />
          {isOwner &&
            (confirmDelete ? (
              <span className="confirm">
                Delete?
                <button className="btn btn-danger btn-sm" onClick={deleteDoc}>Yes, delete</button>
                <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </span>
            ) : (
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Delete</button>
            ))}
          <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
            {isOwner ? "Share" : "People"}
          </button>
        </div>
      </AppHeader>

      {status === "conflict" && (
        <div className="banner banner-warn" role="alert">
          Someone else saved this document while you were editing, so your latest changes were not saved.
          <button className="btn btn-sm" onClick={reloadLatest}>Load their version</button>
          <button className="btn btn-sm" onClick={overwriteWithMine}>Keep mine (overwrite)</button>
        </div>
      )}
      {errorMsg && (
        <div className="banner banner-error" role="alert">
          {errorMsg}
        </div>
      )}
      {!canEdit && (
        <div className="banner banner-info">
          You have view-only access. Ask {initial.owner.name} for edit access.
        </div>
      )}

      {canEdit && (
        <div className="toolbar-row">
          <Toolbar editor={editor} />
        </div>
      )}
      </div>

      <main className="page-wrap" onClick={() => editor?.commands.focus()}>
        <div className="page" onClick={(e) => e.stopPropagation()}>
          <EditorContent editor={editor} />
        </div>
      </main>

      {shareOpen && <ShareDialog docId={initial.id} isOwner={isOwner} owner={initial.owner} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
