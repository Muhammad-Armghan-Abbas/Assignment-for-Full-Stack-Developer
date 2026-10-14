"use client";

import type { Editor } from "@tiptap/react";
import { Download, FileCode2, FileText, Printer } from "lucide-react";
import TurndownService from "turndown";
import { usePopover } from "../ui/usePopover";

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
  const { open, toggle, setOpen, ref } = usePopover();
  if (!editor) return null;

  const exportMarkdown = () => {
    const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
    // Make image links absolute so they work when the file leaves the app (they still require sign-in).
    const html = editor.getHTML().replaceAll('src="/api/assets/', `src="${location.origin}/api/assets/`);
    download(`${safeName(title)}.md`, `# ${title}\n\n${td.turndown(html)}\n`, "text/markdown");
    setOpen(false);
  };
  const exportHtml = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title></head><body>${editor.getHTML()}</body></html>`;
    download(`${safeName(title)}.html`, html, "text/html");
    setOpen(false);
  };

  return (
    <div className="menu" ref={ref}>
      <button className="icon-btn icon-btn-lg" onClick={toggle} aria-expanded={open} aria-haspopup="menu" aria-label="Download" title="Download">
        <Download size={19} />
      </button>
      {open && (
        <div className="menu-list menu-right" role="menu">
          <div className="menu-label">Download as</div>
          <button role="menuitem" onClick={exportMarkdown}><FileText size={16} /> Markdown (.md)</button>
          <button role="menuitem" onClick={exportHtml}><FileCode2 size={16} /> Web page (.html)</button>
          <button role="menuitem" onClick={() => (setOpen(false), setTimeout(() => window.print(), 50))}><Printer size={16} /> Print / Save as PDF</button>
        </div>
      )}
    </div>
  );
}
