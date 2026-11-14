"use client";

import Link from "next/link";
import { BarChart3, Copy, CopyPlus, ExternalLink, Eye, LineChart, MoreHorizontal, Pencil, Target, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsLoadState } from "@/components/analytics/use-page-funnel-analytics";
import { formatCount, formatPercent, pageConversionRate } from "@/lib/analytics/page-funnel-metrics";
import type { PageReport } from "@/types/page-funnel-analytics";
import { StatusPill, Tag } from "@/components/system/status-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageThumbnail } from "@/components/pages-funnels/home/page-thumbnail";
import { PAGE_TYPE_ICONS } from "@/components/pages-funnels/home/page-type-icons";
import { derivePuckPublishStatus } from "@/lib/pages-funnels/puck/publish-status";
import { describeUse, pageUpdatedMs, PAGE_STATUS_LABELS, type PageFunnelUse } from "@/lib/pages-funnels/library";
import { PAGE_TYPE_LABELS, type PageDoc } from "@/types/pages-funnels";

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * One page in the Pages view: real screenshot, status, page type, name,
 * last edit, the funnels that use it, and its actions. The ⋮ button is
 * always visible (touch screens have no hover). Live-page actions appear
 * only for pages with a live public version.
 */
export function PageCard({
  page,
  uses,
  editHref,
  liveUrl,
  canManage,
  onCopyLink,
  onDuplicate,
  onDelete,
  analytics = null,
  analyticsState = "ready",
  onQuickPerformance,
  reportsHref,
}: {
  page: PageDoc;
  uses: PageFunnelUse[];
  editHref: string;
  liveUrl: string;
  canManage: boolean;
  onCopyLink: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Last-30-day page analytics (light view; the full report is in Reports). */
  analytics?: PageReport | null;
  analyticsState?: AnalyticsLoadState;
  onQuickPerformance?: () => void;
  reportsHref?: string;
}) {
  const hasLivePage = page.status === "published" && !!page.puckPublishedData;
  const outdated = derivePuckPublishStatus(page) === "published-outdated";
  const updated = pageUpdatedMs(page);
  const TypeIcon = PAGE_TYPE_ICONS[page.pageType] ?? PAGE_TYPE_ICONS.generic;

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-shadow hover:shadow-md" data-page-card={page.id}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusPill status={page.status}>{PAGE_STATUS_LABELS[page.status] ?? "Draft"}</StatusPill>
          {outdated ? <span className="text-caption text-muted-foreground">Changes not published</span> : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Actions for ${page.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted data-popup-open:text-foreground"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem render={<Link href={editHref} />}>
              <Pencil aria-hidden="true" /> Edit
            </DropdownMenuItem>
            {onQuickPerformance ? (
              <DropdownMenuItem onClick={onQuickPerformance} disabled={!analytics}>
                <LineChart aria-hidden="true" /> Quick performance
              </DropdownMenuItem>
            ) : null}
            {reportsHref ? (
              <DropdownMenuItem render={<Link href={reportsHref} />}>
                <BarChart3 aria-hidden="true" /> View detailed analytics
              </DropdownMenuItem>
            ) : null}
            {hasLivePage ? (
              <>
                <DropdownMenuItem render={<a href={liveUrl} target="_blank" rel="noreferrer" />}>
                  <ExternalLink aria-hidden="true" /> View live page
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onCopyLink}>
                  <Copy aria-hidden="true" /> Copy live link
                </DropdownMenuItem>
              </>
            ) : null}
            {canManage ? (
              <>
                <DropdownMenuItem onClick={onDuplicate}>
                  <CopyPlus aria-hidden="true" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 aria-hidden="true" /> Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Link href={editHref} className="mx-4 block overflow-hidden rounded-lg border border-border-subtle outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`Edit ${page.name}`}>
        <PageThumbnail page={page} />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1 px-4 pt-3 pb-4">
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <TypeIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {PAGE_TYPE_LABELS[page.pageType] ?? "Page"}
        </p>
        <h3 className="min-w-0 truncate text-body font-semibold">
          <Link href={editHref} className="outline-none hover:underline focus-visible:underline">
            {page.name}
          </Link>
        </h3>
        <p className="text-caption text-muted-foreground">{updated ? `Updated ${dateFmt.format(updated)}` : "Updated just now"}</p>
        {onQuickPerformance ? <PageCardMetrics report={analytics} state={analyticsState} onOpen={onQuickPerformance} name={page.name} /> : null}
        {uses.length ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5" title={uses.map(describeUse).join("\n")}>
            <Tag color="violet" className="max-w-full truncate">
              <span className="truncate">{describeUse(uses[0])}</span>
            </Tag>
            {uses.length > 1 ? <Tag color="gray">+{uses.length - 1} more</Tag> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Compact 30-day metrics on a page card; opens the quick performance panel. */
function PageCardMetrics({ report, state, onOpen, name }: { report: PageReport | null; state: AnalyticsLoadState; onOpen: () => void; name: string }) {
  if (!report) return state === "loading" ? <Skeleton className="mt-1 h-5 w-40" /> : null;
  const rate = pageConversionRate(report.totals, report.goal);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Quick performance for ${name}`}
      className="mt-1 flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md text-caption text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Eye className="size-3.5 text-primary" aria-hidden="true" />
        {formatCount(report.totals.views)} {report.totals.views === 1 ? "view" : "views"}
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Target className="size-3.5 text-primary" aria-hidden="true" />
        {report.goal.kind ? `${formatPercent(rate)} conv.` : report.goal.label}
      </span>
      <span className="sr-only"> (last 30 days)</span>
    </button>
  );
}
