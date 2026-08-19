"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { Check, Link2, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Mirrors sanitizeCommunityPostHtml's `allowedSchemes` (post-html.ts) so a
 *  member never even gets to submit a link the server-side sanitizer would
 *  later silently strip. This is UX-level validation only — the sanitizer
 *  remains the real security boundary; this just gives fast, clear
 *  feedback instead of a link that quietly stops working after publish. */
const ALLOWED_SCHEMES = ["http", "https", "mailto"];

function normalizeUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter a URL" };
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (!ALLOWED_SCHEMES.includes(scheme)) {
      return { ok: false, error: "Only http, https, or mailto links are allowed" };
    }
    return { ok: true, url: trimmed };
  }
  // No scheme typed — infer one rather than reject, since "example.com" and
  // "name@example.com" are both things a member will reasonably type.
  if (trimmed.includes("@") && !trimmed.includes(" ") && !trimmed.includes("/")) {
    return { ok: true, url: `mailto:${trimmed}` };
  }
  return { ok: true, url: `https://${trimmed}` };
}

/**
 * Replaces the old `window.prompt()`-based link action with a real, visible
 * popover — the shared architecture's answer to "the link button is unusable"
 * rather than a second/forked editor. Used by every `RichTextToolbar`
 * consumer (About, Lesson, Community) since a native prompt was never good
 * UX anywhere, not just in Community; the underlying `setLink`/`unsetLink`
 * commands and their HTMLAttributes (rel/target, configured once in
 * `useRichTextEditor`) are completely unchanged, so nothing about how a link
 * *renders* changes for any existing consumer — only how one gets created.
 *
 * Handles both flows explicitly, per the Community QA correction's spec:
 *  - text already selected (or cursor resting inside an existing link,
 *    which is expanded to the link's full range) → URL field only, applies
 *    to that exact range.
 *  - nothing selected → a required "Link text" field plus URL, inserts new
 *    linked text at the original cursor position.
 *
 * `renderTrigger` (Comments & Replies, 2026-08-19) lets a caller supply its
 * OWN trigger element — the comment composer's `+` action menu wants "Add
 * link" as a plain menu row, not a small toolbar icon — while this
 * component still owns 100% of the popover state/selection-capture/apply
 * logic; nothing about the default (toolbar-icon) rendering changes for
 * any existing consumer that doesn't pass it.
 *
 * The selection is captured into React state the moment the trigger is
 * pressed (`onMouseDown`, not `onClick` — see the toolbar's own
 * mousedown-preventDefault fix) and re-applied explicitly via
 * `setTextSelection` when the popover's own "Add link"/"Update" button is
 * clicked, rather than trusting whatever the editor's "current" selection
 * happens to be at that later moment. That later moment is by definition
 * after the editor has lost DOM focus to the popover's own inputs, so
 * relying on "current selection" the way the old prompt-based flow did
 * would be exactly the fragile pattern this fix exists to remove.
 */
export function LinkPopover({
  editor,
  title = "Link",
  renderTrigger,
}: {
  editor: Editor;
  title?: string;
  /** Optional custom trigger content — the default toolbar-icon look is
   *  used when omitted. The trigger element itself (button semantics,
   *  the mousedown-preventDefault selection capture) is still fully owned
   *  by this component either way; only what's rendered INSIDE the
   *  trigger changes. */
  renderTrigger?: (active: boolean) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = editor.isActive("link");

  function openForCurrentSelection() {
    const before = editor.state.selection;
    let from = before.from;
    let to = before.to;
    const existingHref = editor.getAttributes("link").href as string | undefined;
    if (before.empty && existingHref) {
      // Cursor resting inside an existing link with no drag-selection —
      // expand to the link's full range so editing it acts on the whole
      // link, not a zero-width point inside it.
      editor.chain().extendMarkRange("link").run();
      from = editor.state.selection.from;
      to = editor.state.selection.to;
    }
    setRange({ from, to });
    setText(editor.state.doc.textBetween(from, to, " "));
    setUrl(existingHref ?? "");
    setError(null);
    // Deliberately does NOT call setOpen(true) here. PopoverTrigger already
    // opens itself on its own click handling — calling setOpen(true) here
    // too raced against it: this mousedown handler fires and flips `open`
    // to true, then the trigger's own click-driven toggle sees an
    // already-open popover a beat later and immediately closes it again
    // ("trigger-press" reason), so the popover would flash open and shut
    // on every real click. This function's only job is capturing the
    // selection before it can be lost to blur — see the mousedown comment
    // on the trigger below.
  }

  function apply() {
    if (!range) return;
    const hasSelection = range.to > range.from;
    const result = normalizeUrl(url);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!hasSelection && !text.trim()) {
      setError("Enter link text");
      return;
    }
    if (hasSelection) {
      editor
        .chain()
        .focus()
        .setTextSelection(range)
        .extendMarkRange("link")
        .setLink({ href: result.url })
        // setLink leaves the cursor at the end of the now-linked selection,
        // still "inside" the mark — without this, the next character the
        // member types keeps extending the link instead of following it.
        // Confirmed as a real, reproducible bug via CDP-driven real typing,
        // not a hypothetical.
        .setTextSelection(range.to)
        .unsetMark("link")
        .run();
    } else {
      editor
        .chain()
        .focus()
        .setTextSelection(range)
        .insertContent({ type: "text", text: text.trim(), marks: [{ type: "link", attrs: { href: result.url } }] })
        // Otherwise the link mark stays "sticky" and the next characters the
        // member types keep inheriting it.
        .unsetMark("link")
        .run();
    }
    setOpen(false);
  }

  function remove() {
    if (!range) return;
    editor.chain().focus().setTextSelection(range).extendMarkRange("link").unsetLink().run();
    setOpen(false);
  }

  const showTextField = !!range && range.to === range.from;

  return (
    <Popover open={open} onOpenChange={(next) => setOpen(next)}>
      <PopoverTrigger
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={active}
        onMouseDown={(e: React.MouseEvent) => {
          // Same fix as every other toolbar button: preventDefault stops
          // the browser from blurring the editor (and losing its
          // selection) on mousedown, before PopoverTrigger's own click
          // handling opens the popover a beat later. This handler only
          // captures the selection into state — it must NOT also open the
          // popover itself (see the comment in openForCurrentSelection).
          e.preventDefault();
          openForCurrentSelection();
        }}
        className={
          renderTrigger
            ? undefined
            : cn(
                "flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-primary/15 text-primary",
              )
        }
      >
        {renderTrigger ? renderTrigger(active) : <Link2 className="h-4 w-4" />}
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2.5">
        <p className="text-xs font-medium text-foreground">{active ? "Edit link" : "Add link"}</p>
        {showTextField ? (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="link-popover-text">
              Link text
            </label>
            <input
              id="link-popover-text"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What should the link say?"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>
        ) : (
          text && (
            <p className="truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{text}</p>
          )
        )}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="link-popover-url">
            URL
          </label>
          <input
            id="link-popover-url"
            autoFocus={!showTextField}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            placeholder="https://example.com"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex items-center justify-between pt-1">
          {active ? (
            <button
              type="button"
              onClick={remove}
              className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove link
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={apply}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-3.5 w-3.5" /> {active ? "Update" : "Add link"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
