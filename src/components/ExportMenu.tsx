"use client";

import type { Editor } from "@tiptap/react";
import TurndownService from "turndown";
import { useEffect, useRef, useState } from "react";

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const safeName = (title: string) => title.replace(/[\\/:*?"<>|]+/g, "").trim() || "document";

export function ExportMenu({ editor, title }: { editor: Editor | null; title: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!editor) return null;

  const exportMarkdown = () => {
    const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
    download(`${safeName(title)}.md`, `# ${title}\n\n${td.turndown(editor.getHTML())}\n`, "text/markdown");
    setOpen(false);
  };
  const exportHtml = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title></head><body>${editor.getHTML()}</body></html>`;
    download(`${safeName(title)}.html`, html, "text/html");
    setOpen(false);
  };
  const print = () => {
    setOpen(false);
    setTimeout(() => window.print(), 50);
  };

  return (
    <div className="menu" ref={ref}>
      <button className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        Export ▾
      </button>
      {open && (
        <div className="menu-list" role="menu">
          <button role="menuitem" onClick={exportMarkdown}>Markdown (.md)</button>
          <button role="menuitem" onClick={exportHtml}>Web page (.html)</button>
          <button role="menuitem" onClick={print}>Print / Save as PDF</button>
        </div>
      )}
    </div>
  );
}
