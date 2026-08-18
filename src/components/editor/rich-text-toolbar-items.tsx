"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  List,
  ListOrdered,
  type LucideIcon,
  Quote,
  Strikethrough,
  UnderlineIcon,
  Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkPopover } from "./link-popover";

/**
 * The full vocabulary of toolbar buttons the shared rich-text core knows
 * how to render. A config lists exactly the items it wants, in order —
 * nothing renders that isn't explicitly requested. Media items (image,
 * video/embed, dictation) are deliberately NOT part of this vocabulary yet
 * — see the Phase A report for why `RichTextEditor` (the only current
 * consumer of those) wasn't migrated onto this core in this pass.
 */
export type RichTextToolbarItem =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "codeBlock"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "link"
  | "clearFormatting"
  | "divider";

const HEADING_LEVEL: Partial<Record<RichTextToolbarItem, 1 | 2 | 3 | 4>> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
};

/** Every heading level actually referenced by a toolbar list — used to
 *  build the StarterKit `heading` config (empty = headings disabled). */
export function headingLevelsFromToolbar(items: RichTextToolbarItem[]): (1 | 2 | 3 | 4)[] {
  return items
    .map((item) => HEADING_LEVEL[item])
    .filter((level): level is 1 | 2 | 3 | 4 => level !== undefined);
}

interface ToolbarItemDef {
  icon: LucideIcon;
  defaultTitle: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const DEFS: Partial<Record<RichTextToolbarItem, ToolbarItemDef>> = {
  h1: {
    icon: Heading1,
    defaultTitle: "Heading 1",
    isActive: (e) => e.isActive("heading", { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  h2: {
    icon: Heading2,
    defaultTitle: "Heading 2",
    isActive: (e) => e.isActive("heading", { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  h3: {
    icon: Heading3,
    defaultTitle: "Heading 3",
    isActive: (e) => e.isActive("heading", { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  h4: {
    icon: Heading4,
    defaultTitle: "Heading 4",
    isActive: (e) => e.isActive("heading", { level: 4 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 4 }).run(),
  },
  bold: {
    icon: Bold,
    defaultTitle: "Bold",
    isActive: (e) => e.isActive("bold"),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  italic: {
    icon: Italic,
    defaultTitle: "Italic",
    isActive: (e) => e.isActive("italic"),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  underline: {
    icon: UnderlineIcon,
    defaultTitle: "Underline",
    isActive: (e) => e.isActive("underline"),
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
  strike: {
    icon: Strikethrough,
    defaultTitle: "Strikethrough",
    isActive: (e) => e.isActive("strike"),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  code: {
    icon: Code,
    defaultTitle: "Inline code",
    isActive: (e) => e.isActive("code"),
    run: (e) => e.chain().focus().toggleCode().run(),
  },
  codeBlock: {
    icon: Code2,
    defaultTitle: "Code block",
    isActive: (e) => e.isActive("codeBlock"),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  bulletList: {
    icon: List,
    defaultTitle: "Bullet list",
    isActive: (e) => e.isActive("bulletList"),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  orderedList: {
    icon: ListOrdered,
    defaultTitle: "Numbered list",
    isActive: (e) => e.isActive("orderedList"),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  blockquote: {
    icon: Quote,
    defaultTitle: "Quote",
    isActive: (e) => e.isActive("blockquote"),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  clearFormatting: {
    icon: Eraser,
    defaultTitle: "Clear formatting",
    isActive: () => false,
    run: (e) => e.chain().focus().clearNodes().unsetAllMarks().run(),
  },
};

export function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}

function ToolbarBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // Without this, mousedown on the button blurs the ProseMirror editor
      // and can collapse/shift its selection BEFORE onClick's command runs
      // — marks (bold/italic/etc) tend to still look like they "work"
      // against whatever the collapsed selection lands on, but block-level
      // toggles (bulletList/orderedList/blockquote) are far more sensitive
      // to acting on the exact selection the member actually made, and can
      // silently no-op or apply to the wrong node instead. Preventing the
      // default here keeps the editor's own selection state untouched by
      // the click, so `.chain().focus()` in each command reliably resumes
      // from the selection the member actually had.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
        active && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Renders exactly the requested toolbar items, in order — the "configurable
 * toolbar system" the shared core is built around. `titles` lets a caller
 * override a specific item's label (e.g. About's "Heading"/"Subheading"
 * instead of the default "Heading 2"/"Heading 3") without forking the
 * button itself.
 */
export function RichTextToolbar({
  editor,
  items,
  titles,
}: {
  editor: Editor;
  items: RichTextToolbarItem[];
  titles?: Partial<Record<RichTextToolbarItem, string>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
      {items.map((item, i) => {
        if (item === "divider") return <Divider key={`divider-${i}`} />;
        if (item === "link") {
          return <LinkPopover key="link" editor={editor} title={titles?.link ?? "Link"} />;
        }
        const def = DEFS[item];
        if (!def) return null;
        const Icon = def.icon;
        return (
          <ToolbarBtn
            key={item}
            active={def.isActive(editor)}
            title={titles?.[item] ?? def.defaultTitle}
            onClick={() => def.run(editor)}
          >
            <Icon className="h-4 w-4" />
          </ToolbarBtn>
        );
      })}
    </div>
  );
}
