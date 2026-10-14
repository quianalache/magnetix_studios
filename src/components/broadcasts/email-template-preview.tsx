import { Mail } from "lucide-react";

/**
 * Abstract visual preview for an email template card, built purely from the
 * summary's block count — no extra per-card content fetch. Shared by the
 * sub-account Email Templates library and Agency → Communications templates.
 */
export function EmailTemplatePreview({ blockCount }: { blockCount: number }) {
  const bars = Math.max(1, Math.min(blockCount, 5));
  return (
    <div className="flex h-28 flex-col items-center justify-center gap-1.5 border-b border-border bg-surface-sunken/60 px-6">
      <div className="flex size-6 items-center justify-center rounded-md bg-tag-violet-bg text-tag-violet-fg">
        <Mail className="size-3" aria-hidden="true" />
      </div>
      <div className="flex w-full flex-col gap-1 pt-1">
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} className="h-1.5 rounded-full bg-foreground/10" style={{ width: `${100 - i * 14}%` }} />
        ))}
      </div>
    </div>
  );
}
