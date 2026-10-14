"use client";

import { useEditorState, type Editor } from "@tiptap/react";

type BlockType = "paragraph" | "h1" | "h2" | "h3";

export function Toolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            strike: e.isActive("strike"),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            block: (e.isActive("heading", { level: 1 })
              ? "h1"
              : e.isActive("heading", { level: 2 })
                ? "h2"
                : e.isActive("heading", { level: 3 })
                  ? "h3"
                  : "paragraph") as BlockType,
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
          }
        : null,
  });

  if (!editor || !state) return <div className="toolbar" aria-hidden />;
  const chain = () => editor.chain().focus();

  function setBlock(v: BlockType) {
    if (v === "paragraph") chain().setParagraph().run();
    else chain().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!state.canUndo}>↶</Btn>
      <Btn label="Redo (Ctrl+Shift+Z)" onClick={() => chain().redo().run()} disabled={!state.canRedo}>↷</Btn>
      <Sep />
      <select
        className="block-select"
        value={state.block}
        onChange={(e) => setBlock(e.target.value as BlockType)}
        aria-label="Text style"
      >
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Sep />
      <Btn label="Bold (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()}><b>B</b></Btn>
      <Btn label="Italic (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()}><i>I</i></Btn>
      <Btn label="Underline (Ctrl+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}><u>U</u></Btn>
      <Btn label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}><s>S</s></Btn>
      <Sep />
      <Btn label="Bulleted list" active={state.bullet} onClick={() => chain().toggleBulletList().run()}>• ≡</Btn>
      <Btn label="Numbered list" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}>1. ≡</Btn>
      <Btn label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()}>❝</Btn>
      <Sep />
      <Btn label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>⌫</Btn>
    </div>
  );
}

function Btn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? " is-active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor selection when clicking toolbar buttons.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const Sep = () => <span className="tb-sep" aria-hidden />;
