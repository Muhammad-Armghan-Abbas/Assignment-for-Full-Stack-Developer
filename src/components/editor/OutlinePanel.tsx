"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { ListTree } from "lucide-react";

/** Live table of contents built from the document's headings. */
export function OutlinePanel({ editor }: { editor: Editor | null }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const out: { level: number; text: string; pos: number }[] = [];
      e?.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading" && node.textContent.trim()) out.push({ level: node.attrs.level, text: node.textContent, pos });
        return node.isBlock && node.type.name !== "heading";
      });
      return out;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  function go(pos: number) {
    if (!editor) return;
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    dom?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (editor.isEditable) editor.chain().setTextSelection(pos + 1).focus(undefined, { scrollIntoView: false }).run();
  }

  return (
    <nav className="outline" aria-label="Document outline">
      <h3>
        <ListTree size={15} /> Outline
      </h3>
      {!headings?.length ? (
        <p className="muted small">Headings you add will appear here.</p>
      ) : (
        <ul>
          {headings.map((h) => (
            <li key={h.pos} className={`outline-l${h.level}`}>
              <button onClick={() => go(h.pos)}>{h.text}</button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
