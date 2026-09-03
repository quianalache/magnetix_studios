"use client";

import { Textarea } from "@/components/ui/textarea";
import { DictateButton } from "@/components/ui/dictate-button";
import { cn } from "@/lib/utils";

/**
 * A multiline textarea with a small dictate mic living INSIDE it, in
 * the bottom-right corner — the ChatGPT-composer-style pattern: the
 * mic visually belongs to this one field, not a separate control row
 * above or beside it. Reuses `DictateButton`/`useDictation` exactly as
 * they already exist — this is a placement wrapper only, no dictation
 * logic of its own.
 *
 * `pr-10 pb-9` on the textarea reserves room so typed text doesn't run
 * under the icon by default (matches the referenced composer pattern —
 * an unusually long last line can still visually approach it, same
 * trade-off ChatGPT's own composer has).
 *
 * `resize-none`: the base `Textarea` has no `resize` override, so
 * browsers draw their native resize grip in the bottom-right corner —
 * exactly where this mic sits. Left alone, the two would overlap and
 * fight for the same drag target. Disabling resize only on this
 * composer-style wrapper (not on the shared `Textarea` component
 * itself) removes the conflict without changing any other textarea in
 * the app.
 */
export function DictationTextarea({
  value,
  onChange,
  id,
  rows,
  placeholder,
  className,
  textareaClassName,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
  rows?: number;
  placeholder?: string;
  className?: string;
  textareaClassName?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={cn("resize-none pr-10 pb-9", textareaClassName)}
      />
      <DictateButton
        value={value}
        onChange={onChange}
        className="absolute bottom-1.5 right-1.5 rounded-md bg-background/80 backdrop-blur-sm"
      />
    </div>
  );
}
