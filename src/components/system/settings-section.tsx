import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/system/section-header";

/**
 * One white settings card on the page canvas (design-system Phase 1) — never a
 * tinted block, never nested inside another tint. Title + helper text, the
 * fields, and an optional footer (e.g. a Save button for this section only).
 */
export function SettingsSection({
  title,
  description,
  action,
  footer,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Right side of the header — a status pill, a "Locked by your agency" tag, etc. */
  action?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn("overflow-hidden rounded-card border border-border bg-card shadow-card", className)}>
      <div className="flex flex-col gap-4 p-5">
        <SectionHeader title={title} description={description} action={action} />
        {children}
      </div>
      {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface-sunken px-5 py-3">{footer}</div> : null}
    </section>
  );
}
