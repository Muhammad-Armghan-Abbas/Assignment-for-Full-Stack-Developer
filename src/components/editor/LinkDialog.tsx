"use client";

import type { Editor } from "@tiptap/react";
import { Link2, Unlink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Small inline dialog for adding / editing / removing a link on the current selection. */
export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const existing = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [url, setUrl] = useState(existing);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    let href = url.trim();
    if (!href) return remove();
    if (!/^(https?:|mailto:)/i.test(href)) href = `https://${href}`;
    try {
      new URL(href);
    } catch {
      return setError("That doesn't look like a valid link");
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !existing) {
      chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    onClose();
  }

  function remove() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onClose();
  }

  return (
    <div className="link-dialog" role="dialog" aria-label="Edit link" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <form onSubmit={apply}>
        <Link2 size={16} className="muted" />
        <input ref={input} value={url} onChange={(e) => (setUrl(e.target.value), setError(null))} placeholder="Paste or type a link" aria-label="Link URL" />
        <button className="btn btn-primary btn-sm">Apply</button>
        {existing && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={remove} title="Remove link">
            <Unlink size={15} />
          </button>
        )}
      </form>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
