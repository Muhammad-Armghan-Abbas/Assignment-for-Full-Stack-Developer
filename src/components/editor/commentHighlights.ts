import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Draws comment highlights as ProseMirror *decorations* — they are never part
 * of the saved document. Each thread stores the quoted text plus a little
 * preceding context; we find it in the live document, and map the highlight
 * through edits so it follows the text while people type.
 */

export interface Anchor {
  id: string;
  quote: string | null;
  prefix: string | null;
  resolved: boolean;
}

export const commentsKey = new PluginKey<DecorationSet>("commentHighlights");

/** Flatten the document to text, remembering the document position of every character. */
export function textIndex(doc: PMNode) {
  let text = "";
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      for (let i = 0; i < node.text!.length; i++) positions.push(pos + i);
      text += node.text;
    } else if (node.isBlock && text.length && !text.endsWith("\n")) {
      text += "\n";
      positions.push(pos);
    }
    return true;
  });
  return { text, positions };
}

/** Locate an anchor: prefer prefix+quote (disambiguates repeated phrases), fall back to the quote alone. */
export function findAnchor(doc: PMNode, quote: string, prefix: string | null): { from: number; to: number } | null {
  if (!quote) return null;
  const { text, positions } = textIndex(doc);
  let start = -1;
  if (prefix) {
    const i = text.indexOf(prefix + quote);
    if (i !== -1) start = i + prefix.length;
  }
  if (start === -1) start = text.indexOf(quote);
  if (start === -1) return null;
  const end = start + quote.length - 1;
  if (end >= positions.length) return null;
  return { from: positions[start], to: positions[end] + 1 };
}

function build(doc: PMNode, anchors: Anchor[], active: string | null): DecorationSet {
  const decos: Decoration[] = [];
  for (const a of anchors) {
    if (a.resolved || !a.quote) continue;
    const range = findAnchor(doc, a.quote, a.prefix);
    if (!range) continue;
    decos.push(
      Decoration.inline(
        range.from,
        range.to,
        { class: `comment-anchor${a.id === active ? " is-active" : ""}`, "data-thread": a.id },
        { threadId: a.id },
      ),
    );
  }
  return DecorationSet.create(doc, decos);
}

export interface CommentHighlightsStorage {
  anchors: Anchor[];
  active: string | null;
}

declare module "@tiptap/core" {
  interface Storage {
    commentHighlights: CommentHighlightsStorage;
  }
}

export const CommentHighlights = Extension.create<{ onSelectThread: (id: string) => void }, CommentHighlightsStorage>({
  name: "commentHighlights",
  addOptions() {
    return { onSelectThread: () => {} };
  },
  addStorage() {
    return { anchors: [], active: null };
  },
  addProseMirrorPlugins() {
    const ext = this;
    return [
      new Plugin<DecorationSet>({
        key: commentsKey,
        state: {
          init: (_, { doc }) => build(doc, ext.storage.anchors, ext.storage.active),
          apply(tr, old) {
            if (tr.getMeta(commentsKey)) return build(tr.doc, ext.storage.anchors, ext.storage.active);
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
          },
        },
        props: {
          decorations: (state) => commentsKey.getState(state),
          handleClick(view, pos) {
            const hit = commentsKey.getState(view.state)?.find(pos, pos)[0];
            const id = hit?.spec?.threadId as string | undefined;
            if (id) ext.options.onSelectThread(id);
            return false;
          },
        },
      }),
    ];
  },
});

/** Push new threads / active thread into the editor and redraw highlights. */
export function setAnchors(editor: { storage: { commentHighlights: CommentHighlightsStorage }; view: { state: { tr: import("@tiptap/pm/state").Transaction }; dispatch: (tr: import("@tiptap/pm/state").Transaction) => void }; isDestroyed?: boolean }, anchors: Anchor[], active: string | null) {
  if (editor.isDestroyed) return;
  editor.storage.commentHighlights.anchors = anchors;
  editor.storage.commentHighlights.active = active;
  editor.view.dispatch(editor.view.state.tr.setMeta(commentsKey, true));
}
