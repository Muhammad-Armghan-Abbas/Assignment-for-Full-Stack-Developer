"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Highlighter, Italic, Link2, MessageSquarePlus, Underline } from "lucide-react";
import { Btn } from "./Toolbar";

/** Floating menu over a text selection — quick formatting for editors, "Comment" for everyone who can comment. */
export function SelectionMenu({
  editor,
  canEdit,
  canComment,
  onLink,
  onComment,
}: {
  editor: Editor;
  canEdit: boolean;
  canComment: boolean;
  onLink: () => void;
  onComment: () => void;
}) {
  if (!canEdit && !canComment) return null;
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e, state }) => {
        const { empty } = state.selection;
        return !empty && !e.isActive("image") && !e.isActive("codeBlock") && state.doc.textBetween(state.selection.from, state.selection.to).trim().length > 0;
      }}
      className="bubble"
    >
      {canEdit && (
        <>
          <Btn icon={Bold} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
          <Btn icon={Italic} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <Btn icon={Underline} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <Btn icon={Highlighter} label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight({ color: "#fef08a" }).run()} />
          <Btn icon={Link2} label="Link" active={editor.isActive("link")} onClick={onLink} />
          <span className="tb-sep" aria-hidden />
        </>
      )}
      {canComment && <Btn icon={MessageSquarePlus} text="Comment" label="Add comment" onClick={onComment} />}
    </BubbleMenu>
  );
}
