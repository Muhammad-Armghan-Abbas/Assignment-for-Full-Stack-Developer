"use client";

import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import {
  Code2, Heading1, Heading2, Heading3, ImagePlus, List, ListChecks, ListOrdered, Minus, Pilcrow, Quote, Table,
  type LucideIcon,
} from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

/** "/" command palette for inserting blocks without leaving the keyboard. */

export interface SlashItem {
  title: string;
  hint: string;
  icon: LucideIcon;
  keywords: string;
  run: (editor: Editor, range: Range) => void;
}

export function slashItems(onPickImage: () => void): SlashItem[] {
  const del = (e: Editor, r: Range) => e.chain().focus().deleteRange(r);
  return [
    { title: "Text", hint: "Plain paragraph", icon: Pilcrow, keywords: "paragraph normal", run: (e, r) => del(e, r).setParagraph().run() },
    { title: "Heading 1", hint: "Large section title", icon: Heading1, keywords: "h1 title", run: (e, r) => del(e, r).setHeading({ level: 1 }).run() },
    { title: "Heading 2", hint: "Medium heading", icon: Heading2, keywords: "h2 subtitle", run: (e, r) => del(e, r).setHeading({ level: 2 }).run() },
    { title: "Heading 3", hint: "Small heading", icon: Heading3, keywords: "h3", run: (e, r) => del(e, r).setHeading({ level: 3 }).run() },
    { title: "Bulleted list", hint: "Simple bullets", icon: List, keywords: "ul unordered", run: (e, r) => del(e, r).toggleBulletList().run() },
    { title: "Numbered list", hint: "Ordered steps", icon: ListOrdered, keywords: "ol ordered", run: (e, r) => del(e, r).toggleOrderedList().run() },
    { title: "Checklist", hint: "Track tasks", icon: ListChecks, keywords: "todo task checkbox", run: (e, r) => del(e, r).toggleTaskList().run() },
    { title: "Table", hint: "3 × 3 grid", icon: Table, keywords: "grid", run: (e, r) => del(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { title: "Image", hint: "Upload PNG, JPG, GIF, WebP", icon: ImagePlus, keywords: "picture photo upload", run: (e, r) => { del(e, r).run(); onPickImage(); } },
    { title: "Quote", hint: "Call out a passage", icon: Quote, keywords: "blockquote", run: (e, r) => del(e, r).toggleBlockquote().run() },
    { title: "Code block", hint: "Monospaced snippet", icon: Code2, keywords: "pre snippet", run: (e, r) => del(e, r).toggleCodeBlock().run() },
    { title: "Divider", hint: "Horizontal rule", icon: Minus, keywords: "hr line separator", run: (e, r) => del(e, r).setHorizontalRule().run() },
  ];
}

interface MenuHandle {
  onKeyDown: (p: SuggestionKeyDownProps) => boolean;
}

const SlashMenu = forwardRef<MenuHandle, SuggestionProps<SlashItem>>(function SlashMenu({ items, command }, ref) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;
      if (event.key === "ArrowDown") return setIndex((i) => (i + 1) % items.length), true;
      if (event.key === "ArrowUp") return setIndex((i) => (i - 1 + items.length) % items.length), true;
      if (event.key === "Enter" || event.key === "Tab") return command(items[index]), true;
      return false;
    },
  }));
  if (!items.length) return <div className="slash-menu"><div className="slash-empty">No matching blocks</div></div>;
  return (
    <div className="slash-menu" role="listbox" aria-label="Insert block">
      {items.map((item, i) => (
        <button
          key={item.title}
          role="option"
          aria-selected={i === index}
          className={i === index ? "is-active" : ""}
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command(item)}
        >
          <span className="slash-icon"><item.icon size={18} /></span>
          <span>
            <strong>{item.title}</strong>
            <span className="muted small">{item.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

export const SlashCommand = Extension.create<{ onPickImage: () => void }>({
  name: "slashCommand",
  addOptions() {
    return { onPickImage: () => {} };
  },
  addProseMirrorPlugins() {
    const all = slashItems(this.options.onPickImage);
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        // Only offer block commands at the start of a (possibly partly typed) line.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name === "paragraph" && $from.parentOffset === 0;
        },
        items: ({ query }) => {
          const q = query.toLowerCase();
          return all.filter((i) => i.title.toLowerCase().includes(q) || i.keywords.includes(q)).slice(0, 12);
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let renderer: ReactRenderer<MenuHandle, SuggestionProps<SlashItem>> | null = null;
          const place = (props: SuggestionProps<SlashItem>) => {
            const rect = props.clientRect?.();
            const el = renderer?.element as HTMLElement | undefined;
            if (!rect || !el) return;
            el.style.position = "fixed";
            el.style.zIndex = "60";
            el.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;
            const below = rect.bottom + 6;
            el.style.top = below + 340 > window.innerHeight ? `${Math.max(8, rect.top - 346)}px` : `${below}px`;
          };
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
              document.body.appendChild(renderer.element);
              place(props);
            },
            onUpdate: (props) => {
              renderer?.updateProps(props);
              place(props);
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                renderer?.destroy();
                renderer?.element.remove();
                renderer = null;
                return true;
              }
              return renderer?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              renderer?.destroy();
              renderer?.element.remove();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
