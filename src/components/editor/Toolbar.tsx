"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, ChevronDown, Code2, Columns3, Highlighter, ImagePlus,
  Italic, Link2, List, ListChecks, ListOrdered, MessageSquarePlus, Minus, Quote, Redo2, RemoveFormatting, Rows3,
  Strikethrough, Table, Trash2, Underline, Undo2, type LucideIcon,
} from "lucide-react";
import { usePopover } from "../ui/usePopover";

export const TEXT_COLORS = ["#0f172a", "#475569", "#b91c1c", "#c2410c", "#a16207", "#15803d", "#0e7490", "#1d4ed8", "#6d28d9", "#be185d"];
export const HIGHLIGHT_COLORS = ["#fef08a", "#fde68a", "#bbf7d0", "#bae6fd", "#ddd6fe", "#fbcfe8", "#fecaca", "#e2e8f0"];
const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "30px", "36px"];

type Block = "paragraph" | "h1" | "h2" | "h3";
const BLOCK_LABEL: Record<Block, string> = { paragraph: "Normal text", h1: "Heading 1", h2: "Heading 2", h3: "Heading 3" };

export function Toolbar({
  editor,
  canEdit,
  canComment,
  onImage,
  onLink,
  onComment,
}: {
  editor: Editor | null;
  canEdit: boolean;
  canComment: boolean;
  onImage: () => void;
  onLink: () => void;
  onComment: () => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const ts = e.getAttributes("textStyle");
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        link: e.isActive("link"),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        task: e.isActive("taskList"),
        quote: e.isActive("blockquote"),
        code: e.isActive("codeBlock"),
        table: e.isActive("table"),
        block: (e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "paragraph") as Block,
        align: (["center", "right", "justify"].find((a) => e.isActive({ textAlign: a })) ?? "left") as "left" | "center" | "right" | "justify",
        color: (ts.color as string | undefined) ?? null,
        fontSize: (ts.fontSize as string | undefined) ?? null,
        highlight: (e.getAttributes("highlight").color as string | undefined) ?? null,
        hasSelection: !e.state.selection.empty,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  if (!editor || !s) return <div className="toolbar" aria-hidden />;

  if (!canEdit) {
    return canComment ? (
      <div className="toolbar toolbar-slim" role="toolbar" aria-label="Commenting">
        <span className="muted small">You can comment on this document. Select text, then</span>
        <Btn icon={MessageSquarePlus} label="Add comment (Ctrl+Alt+M)" text="Comment" onClick={onComment} disabled={!s.hasSelection} />
      </div>
    ) : null;
  }

  const chain = () => editor.chain().focus();
  const AlignIcon = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify }[s.align];

  return (
    <div className="toolbar-wrap">
      <div className="toolbar" role="toolbar" aria-label="Formatting">
        <Btn icon={Undo2} label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!s.canUndo} />
        <Btn icon={Redo2} label="Redo (Ctrl+Shift+Z)" onClick={() => chain().redo().run()} disabled={!s.canRedo} />
        <Sep />
        <Dropdown label="Text style" value={BLOCK_LABEL[s.block]} width={132}>
          {(close) =>
            (Object.keys(BLOCK_LABEL) as Block[]).map((b) => (
              <button
                key={b}
                role="menuitemradio"
                aria-checked={s.block === b}
                className={`style-opt style-${b}`}
                onClick={() => {
                  if (b === "paragraph") chain().setParagraph().run();
                  else chain().setHeading({ level: Number(b.slice(1)) as 1 | 2 | 3 }).run();
                  close();
                }}
              >
                {BLOCK_LABEL[b]}
              </button>
            ))
          }
        </Dropdown>
        <Dropdown label="Font size" value={s.fontSize ? s.fontSize.replace("px", "") : "Size"} width={64}>
          {(close) => (
            <>
              <button role="menuitemradio" aria-checked={!s.fontSize} onClick={() => (chain().unsetFontSize().run(), close())}>Default</button>
              {FONT_SIZES.map((f) => (
                <button key={f} role="menuitemradio" aria-checked={s.fontSize === f} onClick={() => (chain().setFontSize(f).run(), close())}>
                  {f.replace("px", "")}
                </button>
              ))}
            </>
          )}
        </Dropdown>
        <Sep />
        <Btn icon={Bold} label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()} />
        <Btn icon={Italic} label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()} />
        <Btn icon={Underline} label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()} />
        <Btn icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} />
        <Swatches
          icon={Baseline}
          label="Text color"
          current={s.color}
          colors={TEXT_COLORS}
          onPick={(c) => (c ? chain().setColor(c).run() : chain().unsetColor().run())}
        />
        <Swatches
          icon={Highlighter}
          label="Highlight"
          current={s.highlight}
          colors={HIGHLIGHT_COLORS}
          onPick={(c) => (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run())}
        />
        <Sep />
        <Btn icon={Link2} label="Link (Ctrl+K)" active={s.link} onClick={onLink} />
        <Btn icon={ImagePlus} label="Insert image" onClick={onImage} />
        <Btn icon={Table} label="Insert table" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        <Btn icon={MessageSquarePlus} label="Add comment (Ctrl+Alt+M)" onClick={onComment} disabled={!s.hasSelection} />
        <Sep />
        <Dropdown label="Alignment" icon={AlignIcon} width={40}>
          {(close) =>
            ([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight], ["justify", AlignJustify]] as const).map(([a, I]) => (
              <button key={a} role="menuitemradio" aria-checked={s.align === a} onClick={() => (chain().setTextAlign(a).run(), close())}>
                <I size={16} /> {a[0].toUpperCase() + a.slice(1)}
              </button>
            ))
          }
        </Dropdown>
        <Btn icon={List} label="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()} />
        <Btn icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} />
        <Btn icon={ListChecks} label="Checklist" active={s.task} onClick={() => chain().toggleTaskList().run()} />
        <Sep />
        <Btn icon={Quote} label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
        <Btn icon={Code2} label="Code block" active={s.code} onClick={() => chain().toggleCodeBlock().run()} />
        <Btn icon={Minus} label="Divider" onClick={() => chain().setHorizontalRule().run()} />
        <Btn icon={RemoveFormatting} label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()} />
      </div>
      {s.table && (
        <div className="toolbar toolbar-context" role="toolbar" aria-label="Table">
          <span className="ctx-label"><Table size={14} /> Table</span>
          <Btn icon={Rows3} text="Row above" label="Insert row above" onClick={() => chain().addRowBefore().run()} />
          <Btn icon={Rows3} text="Row below" label="Insert row below" onClick={() => chain().addRowAfter().run()} />
          <Btn icon={Columns3} text="Column left" label="Insert column left" onClick={() => chain().addColumnBefore().run()} />
          <Btn icon={Columns3} text="Column right" label="Insert column right" onClick={() => chain().addColumnAfter().run()} />
          <Sep />
          <Btn text="Header row" label="Toggle header row" onClick={() => chain().toggleHeaderRow().run()} />
          <Btn text="Merge / split" label="Merge or split cells" onClick={() => chain().mergeOrSplit().run()} />
          <Sep />
          <Btn text="Delete row" label="Delete row" onClick={() => chain().deleteRow().run()} />
          <Btn text="Delete column" label="Delete column" onClick={() => chain().deleteColumn().run()} />
          <Btn icon={Trash2} text="Delete table" label="Delete table" danger onClick={() => chain().deleteTable().run()} />
        </div>
      )}
    </div>
  );
}

export function Btn({
  icon: Icon,
  label,
  text,
  active,
  disabled,
  danger,
  onClick,
}: {
  icon?: LucideIcon;
  label: string;
  text?: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? " is-active" : ""}${text ? " has-text" : ""}${danger ? " is-danger" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
    >
      {Icon && <Icon size={17} strokeWidth={2} />}
      {text && <span>{text}</span>}
    </button>
  );
}

const Sep = () => <span className="tb-sep" aria-hidden />;

function Dropdown({
  label,
  value,
  icon: Icon,
  width,
  children,
}: {
  label: string;
  value?: string;
  icon?: LucideIcon;
  width: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const { open, toggle, setOpen, ref } = usePopover();
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="tb-btn tb-dropdown"
        style={{ minWidth: width }}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        {Icon ? <Icon size={17} /> : <span>{value}</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu-list" role="menu" onMouseDown={(e) => e.preventDefault()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function Swatches({
  icon: Icon,
  label,
  current,
  colors,
  onPick,
}: {
  icon: LucideIcon;
  label: string;
  current: string | null;
  colors: string[];
  onPick: (c: string | null) => void;
}) {
  const { open, toggle, setOpen, ref } = usePopover();
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="tb-btn tb-swatch-btn"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
      >
        <Icon size={17} />
        <span className="swatch-bar" style={{ background: current ?? "transparent" }} />
      </button>
      {open && (
        <div className="menu-list swatches" role="menu" aria-label={label} onMouseDown={(e) => e.preventDefault()}>
          <div className="swatch-grid">
            {colors.map((c) => (
              <button
                key={c}
                className={`swatch${current === c ? " is-active" : ""}`}
                style={{ background: c }}
                aria-label={`${label} ${c}`}
                onClick={() => (onPick(c), setOpen(false))}
              />
            ))}
          </div>
          <button className="swatch-reset" onClick={() => (onPick(null), setOpen(false))}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
