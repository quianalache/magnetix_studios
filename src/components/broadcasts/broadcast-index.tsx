import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Ban,
  CircleX,
  Eye,
  FileEdit,
  Loader2,
  Mail,
  MailCheck,
  MousePointerClick,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill, type StatusTone } from "@/components/system/status-pill";

/**
 * Shared broadcast index pieces (Wave 1 design migration, 2026-10-14) —
 * used by BOTH the sub-account Broadcasts list and Agency → Communications →
 * Broadcasts, so the two can't drift. Visual only: every href, label and
 * handler is passed in.
 */

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "warning" },
  queued: { label: "Queued", tone: "scheduled" },
  sending: { label: "Sending", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function BroadcastStatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as StatusTone };
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
}

export function BroadcastGroupLabel({ children }: { children: ReactNode }) {
  return <h2 className="text-overline font-semibold tracking-[0.16em] text-foreground uppercase">{children}</h2>;
}

export function BroadcastDraftItem({
  href,
  title,
  status,
  meta,
  onDelete,
  deleting,
}: {
  href: string;
  title: string;
  status: string;
  meta: ReactNode;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-card border border-dashed border-border-strong bg-card p-4 transition-[border-color,box-shadow] hover:border-violet-ds-300 hover:shadow-card">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 outline-none focus-visible:underline">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-tag-gray-bg text-tag-gray-fg">
          <FileEdit className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-body-sm font-semibold text-foreground">{title}</p>
            <BroadcastStatusPill status={status} />
          </div>
          <p className="mt-0.5 text-caption text-muted-foreground">{meta}</p>
        </div>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="flex size-8 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Delete draft ${title}`}
      >
        {deleting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

export function BroadcastSentItem({
  href,
  title,
  status,
  preview,
  meta,
  totals,
}: {
  href: string;
  title: string;
  status: string;
  preview?: string | null;
  meta: ReactNode;
  totals: { sent: number; skipped: number; failed: number; audienceSize: number };
}) {
  return (
    <Link
      href={href}
      className="block rounded-card border border-border bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-chip bg-tag-blue-bg text-tag-blue-fg">
            <Mail className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-body-sm font-semibold text-foreground">{title}</p>
              <BroadcastStatusPill status={status} />
            </div>
            {preview ? <p className="mt-0.5 truncate text-caption text-muted-foreground">{preview}</p> : null}
            <p className="mt-0.5 text-caption text-ink-tertiary">{meta}</p>
          </div>
        </div>
        <div className="flex items-center gap-5 max-sm:w-full max-sm:justify-between max-sm:pl-11">
          <DeliveryStat label="Sent" value={totals.sent} tone="success" />
          <DeliveryStat label="Skipped" value={totals.skipped} />
          <DeliveryStat label="Failed" value={totals.failed} tone={totals.failed > 0 ? "danger" : undefined} />
          <DeliveryStat label="Total" value={totals.audienceSize} />
        </div>
      </div>
    </Link>
  );
}

function DeliveryStat({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={cn(
          "text-body-sm font-semibold tabular-nums",
          tone === "success" ? "text-status-success-fg" : tone === "danger" ? "text-status-danger-fg" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-micro tracking-wide text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

// ── Detail-page pieces ────────────────────────────────────────────────────

/** Per-recipient send state. Callers pass their own skipped-reason label. */
export function BroadcastSendStatus({
  status,
  skippedLabel,
  error,
}: {
  status: string;
  skippedLabel?: string;
  error?: string | null;
}) {
  if (status === "sent") return <StatusPill tone="success">Sent</StatusPill>;
  if (status === "queued") return <StatusPill tone="scheduled">Queued</StatusPill>;
  if (status === "skipped") return <StatusPill tone="warning">{skippedLabel ?? "Skipped"}</StatusPill>;
  return (
    <span title={error ?? undefined}>
      <StatusPill tone="danger">Failed</StatusPill>
    </span>
  );
}

/** One delivery total (Sent / Skipped / Failed / Audience). */
export function BroadcastSummaryTile({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-card border border-border bg-card px-4 py-3.5 shadow-card">
      <p className="text-caption text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-title-lg font-semibold tabular-nums",
          tone === "success" ? "text-status-success-fg" : tone === "danger" ? "text-status-danger-fg" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

const RATE_CHIP: Record<"green" | "blue" | "violet" | "gold" | "pink", string> = {
  green: "bg-tag-green-bg text-tag-green-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
};

/** Engagement rate (Delivered / Opened / Clicked / Bounced / Complaints) — real counts only. */
export function BroadcastRateTile({
  icon: Icon,
  label,
  count,
  of,
  tone,
}: {
  icon: typeof Mail;
  label: string;
  count: number;
  of: number;
  tone: keyof typeof RATE_CHIP;
}) {
  const pct = of > 0 ? Math.round((count / of) * 100) : 0;
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5 shadow-card">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", RATE_CHIP[tone])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-caption text-muted-foreground">{label}</p>
        <p className="text-section font-semibold tabular-nums text-foreground">{pct}%</p>
        <p className="text-micro text-ink-tertiary">
          {count} of {of}
        </p>
      </div>
    </div>
  );
}

/** Live send progress while a broadcast is queued / sending. */
export function BroadcastProgress({ percent, note }: { percent: number; note?: ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between text-caption text-muted-foreground">
        <span>Progress</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Send progress"
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      {note ? <p className="mt-2 text-caption text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/** Recipients card with the approved plum heading band. */
export function BroadcastRecipients({ count, children }: { count: number; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
      <div className="bg-table-head px-4 py-3 text-th font-semibold tracking-[0.08em] text-table-head-foreground uppercase">
        Recipients ({count})
      </div>
      {children}
    </div>
  );
}

// ── Whole detail page (sub-account Broadcasts + Agency Communications) ────

export interface BroadcastDetailRecipient {
  id: string;
  name: string;
  email: string;
  extra?: ReactNode;
  engagement?: ReactNode;
  status: ReactNode;
  when: string;
}

export function BroadcastDetailView({
  backHref,
  title,
  titleBadge,
  preview,
  meta,
  status,
  cancel,
  totals,
  showProgress,
  progressNote,
  cancelledNote,
  errorMessage,
  recipients,
}: {
  backHref: string;
  title: string;
  titleBadge?: ReactNode;
  preview?: string | null;
  meta: ReactNode;
  status: string;
  cancel?: { onCancel: () => void; cancelling: boolean } | null;
  totals: {
    sent: number;
    skipped: number;
    failed: number;
    audienceSize: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
  };
  showProgress: boolean;
  progressNote?: ReactNode;
  cancelledNote?: ReactNode;
  errorMessage?: string | null;
  recipients: BroadcastDetailRecipient[];
}) {
  const t = totals;
  const progress = t.audienceSize > 0 ? Math.round(((t.sent + t.skipped + t.failed) / t.audienceSize) * 100) : 0;
  return (
    <>
      <PageHeader
        breadcrumbs={
          <Link href={backHref} className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to broadcasts
          </Link>
        }
        icon={Mail}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words">{title}</span>
            {titleBadge}
          </span>
        }
        description={
          <>
            {preview ? <span className="block">{preview}</span> : null}
            <span className="block text-caption text-ink-tertiary">{meta}</span>
          </>
        }
        actions={
          <>
            {cancel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancel.onCancel}
                disabled={cancel.cancelling}
                className="text-destructive hover:text-destructive"
              >
                {cancel.cancelling ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CircleX className="size-3.5" aria-hidden="true" />
                )}
                Cancel send
              </Button>
            ) : null}
            <BroadcastStatusPill status={status} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <BroadcastSummaryTile label="Sent" value={t.sent} tone="success" />
        <BroadcastSummaryTile label="Skipped" value={t.skipped} />
        <BroadcastSummaryTile label="Failed" value={t.failed} tone={t.failed > 0 ? "danger" : undefined} />
        <BroadcastSummaryTile label="Audience" value={t.audienceSize} />
      </div>

      {t.sent > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <BroadcastRateTile icon={MailCheck} label="Delivered" count={t.delivered} of={t.sent} tone="green" />
          <BroadcastRateTile icon={Eye} label="Opened" count={t.opened} of={t.sent} tone="blue" />
          <BroadcastRateTile icon={MousePointerClick} label="Clicked" count={t.clicked} of={t.sent} tone="violet" />
          <BroadcastRateTile icon={TriangleAlert} label="Bounced" count={t.bounced} of={t.sent} tone="gold" />
          <BroadcastRateTile icon={Ban} label="Complaints" count={t.complained} of={t.sent} tone="pink" />
        </div>
      )}

      {showProgress ? <BroadcastProgress percent={progress} note={progressNote} /> : null}
      {cancelledNote ? <Alert tone="warning">{cancelledNote}</Alert> : null}
      {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

      <BroadcastRecipients count={recipients.length}>
        {recipients.length === 0 ? (
          <p className="p-8 text-center text-body-sm text-muted-foreground">No recipients yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {recipients.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-body-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{r.name}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {r.email}
                    {r.extra}
                  </p>
                </div>
                {r.engagement}
                {r.status}
                <span className="text-caption text-muted-foreground">{r.when}</span>
              </li>
            ))}
          </ul>
        )}
      </BroadcastRecipients>
    </>
  );
}

/** Small per-recipient engagement icons (only once engagement data exists). */
export function BroadcastEngagementIcons({
  e,
}: {
  e:
    | {
        delivered?: boolean;
        opened?: boolean;
        openCount?: number;
        clicked?: boolean;
        clickCount?: number;
        bounced?: boolean;
        bounceType?: string | null;
        complained?: boolean;
      }
    | null
    | undefined;
}) {
  if (!e) return null;
  return (
    <div className="flex items-center gap-1.5">
      {e.delivered && (
        <span title="Delivered">
          <MailCheck className="size-3.5 text-tag-green-fg" aria-label="Delivered" />
        </span>
      )}
      {e.opened && (
        <span title={`Opened${(e.openCount ?? 0) > 1 ? ` (${e.openCount}x)` : ""}`}>
          <Eye className="size-3.5 text-tag-blue-fg" aria-label="Opened" />
        </span>
      )}
      {e.clicked && (
        <span title={`Clicked${(e.clickCount ?? 0) > 1 ? ` (${e.clickCount}x)` : ""}`}>
          <MousePointerClick className="size-3.5 text-tag-violet-fg" aria-label="Clicked" />
        </span>
      )}
      {e.bounced && (
        <span title={`Bounced (${e.bounceType ?? "unknown"})`}>
          <TriangleAlert className="size-3.5 text-tag-gold-fg" aria-label="Bounced" />
        </span>
      )}
      {e.complained && (
        <span title="Marked as spam">
          <Ban className="size-3.5 text-tag-pink-fg" aria-label="Marked as spam" />
        </span>
      )}
    </div>
  );
}

/** Loading / still-a-draft / not-found states, at the page's width. */
export function BroadcastDetailState({
  kind,
  backHref,
  editHref,
  notFoundTitle = "Broadcast not found",
}: {
  kind: "loading" | "draft" | "missing";
  backHref: string;
  editHref?: string;
  notFoundTitle?: string;
}) {
  if (kind === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-64 rounded-card" />
      </div>
    );
  }
  return (
    <>
      <Link href={backHref} className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to broadcasts
      </Link>
      {kind === "draft" ? (
        <EmptyState
          title="This is still a draft"
          description="It hasn't been sent yet — continue editing it in the composer."
          action={editHref ? <Button render={<Link href={editHref} />}>Continue editing</Button> : undefined}
        />
      ) : (
        <EmptyState title={notFoundTitle} description="It may have been deleted, or you don't have access." />
      )}
    </>
  );
}
