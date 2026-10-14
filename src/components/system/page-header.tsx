import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Motif, type MotifKind } from "@/components/brand/motif";

/**
 * PageHeader — one heading pattern for every CRM page (design-system Phase 1).
 *
 * variant="operational" (default) — records, settings, inbox, pipeline,
 *   builders, dense tools: system sans, restrained, no decoration.
 * variant="moment" — approved moment pages only (Dashboard, Energetic Decoder
 *   editorial surfaces, selected index/landing moments): DM Serif Display
 *   title and an optional motif (one per page; see MOTIF_FOR in
 *   components/brand/motif.tsx). The motif slot does not exist on the
 *   operational variant, by design.
 *
 * Owns the page's single <h1>.
 */
type Common = {
  title: ReactNode;
  description?: ReactNode;
  /** Small uppercase label above the title (moment pages, breadcrumb-less sections). */
  eyebrow?: ReactNode;
  /** Breadcrumb trail rendered above the title (pass a <Breadcrumbs> or links). */
  breadcrumbs?: ReactNode;
  /** Right-aligned actions — wrap under the title on narrow screens. */
  actions?: ReactNode;
  /** Optional icon chip beside the title. */
  icon?: LucideIcon;
  className?: string;
};

export type PageHeaderProps =
  | (Common & { variant?: "operational" })
  | (Common & { variant: "moment"; motif?: MotifKind });

export function PageHeader(props: PageHeaderProps) {
  const { title, description, eyebrow, breadcrumbs, actions, icon: Icon, className } = props;
  const moment = props.variant === "moment";
  const motif = moment ? props.motif : undefined;
  return (
    <header
      data-page-header={moment ? "moment" : "operational"}
      className={cn("relative isolate flex flex-col gap-3", motif && "pr-16 sm:pr-24", className)}
    >
      {motif ? <Motif kind={motif} size="header" placement="top-right" hideBelow="sm" className="right-0 top-0" /> : null}
      {breadcrumbs ? <div className="text-caption text-muted-foreground">{breadcrumbs}</div> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className={cn("flex shrink-0 items-center justify-center rounded-chip bg-tint-violet text-link", moment ? "size-12" : "size-10")}>
              <Icon className={moment ? "size-6" : "size-5"} aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-1 text-micro font-semibold tracking-[0.18em] text-link uppercase">{eyebrow}</p>
            ) : null}
            <h1
              className={cn(
                "text-foreground",
                moment
                  ? "font-display text-display-md font-normal tracking-tight sm:text-display-lg"
                  : "text-title-lg font-semibold tracking-tight",
              )}
            >
              {title}
            </h1>
            {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
