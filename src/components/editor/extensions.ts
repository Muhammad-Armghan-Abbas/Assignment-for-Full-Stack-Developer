import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { CommentHighlights } from "./commentHighlights";
import { SlashCommand } from "./slashCommand";

/** The editor's schema. The server-side sanitizer allow-list mirrors exactly what these produce. */
export function buildExtensions(opts: { onPickImage: () => void; onSelectThread: (id: string) => void; editable: boolean }) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // Don't let schema housekeeping (an appended empty paragraph) count as an edit on open.
      trailingNode: false,
      link: { openOnClick: !opts.editable, autolink: true, defaultProtocol: "https" },
    }),
    TextStyleKit.configure({ fontFamily: false, lineHeight: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: opts.editable, allowTableNodeSelection: true } }),
    Image.configure({
      resize: opts.editable
        ? { enabled: true, directions: ["top-left", "top-right", "bottom-left", "bottom-right"], minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true }
        : false,
    }),
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === "heading" ? "Heading" : "Type ‘/’ for commands, or just start writing…"),
    }),
    CharacterCount,
    CommentHighlights.configure({ onSelectThread: opts.onSelectThread }),
    ...(opts.editable ? [SlashCommand.configure({ onPickImage: opts.onPickImage })] : []),
  ];
}
