"use client";

import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, UnderlineIcon } from "lucide-react";
import { lessonBodyToEditorHtml } from "@/lib/community/lesson-html-shared";
import { cn } from "@/lib/utils";

export function AboutRichTextEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Underline,
    ],
    content: lessonBodyToEditorHtml(value),
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none",
          "min-h-40 px-3 py-2.5",
        ),
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(lessonBodyToEditorHtml(value), {
        emitUpdate: false,
      });
    }
  }, [editor, value]);

  function addLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  if (!editor) {
    return <div className="min-h-52 rounded-md border bg-muted/20" />;
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        <Tb editor={editor} on="heading" attrs={{ level: 2 }} cmd={(c) => c.toggleHeading({ level: 2 })} title="Heading"><Heading2 className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="heading" attrs={{ level: 3 }} cmd={(c) => c.toggleHeading({ level: 3 })} title="Subheading"><Heading3 className="h-4 w-4" /></Tb>
        <Divider />
        <Tb editor={editor} on="bold" cmd={(c) => c.toggleBold()} title="Bold"><Bold className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="italic" cmd={(c) => c.toggleItalic()} title="Italic"><Italic className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="underline" cmd={(c) => c.toggleUnderline()} title="Underline"><UnderlineIcon className="h-4 w-4" /></Tb>
        <Divider />
        <Tb editor={editor} on="bulletList" cmd={(c) => c.toggleBulletList()} title="Bullet list"><List className="h-4 w-4" /></Tb>
        <Tb editor={editor} on="orderedList" cmd={(c) => c.toggleOrderedList()} title="Numbered list"><ListOrdered className="h-4 w-4" /></Tb>
        <Divider />
        <ToolbarBtn active={editor.isActive("link")} onClick={addLink} title="Link">
          <Link2 className="h-4 w-4" />
        </ToolbarBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Divider() {
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

function Tb({
  editor,
  on,
  attrs,
  cmd,
  title,
  children,
}: {
  editor: Editor;
  on: string;
  attrs?: Record<string, unknown>;
  cmd: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <ToolbarBtn
      active={attrs ? editor.isActive(on, attrs) : editor.isActive(on)}
      title={title}
      onClick={() => cmd(editor.chain().focus()).run()}
    >
      {children}
    </ToolbarBtn>
  );
}
