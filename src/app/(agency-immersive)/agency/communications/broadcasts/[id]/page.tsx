"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CircleX,
  Eye,
  Loader2,
  Mail,
  MailCheck,
  MousePointerClick,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatContactDate, formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { AgencyCommunicationDoc, AgencyCommunicationSendDoc } from "@/types/agency-communications";

const POLL_MS = 4000;

/**
 * Agency Communications broadcast detail — the agency-scope sibling of the
 * tenant broadcast detail page. Polled (not onSnapshot — the agency owner
 * has no client-readable Firestore path here) while the send is still
 * in flight; stops polling once the communication reaches a terminal
 * status.
 */
export default function AgencyBroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [communication, setCommunication] = useState<AgencyCommunicationDoc | null>(null);
  const [sends, setSends] = useState<AgencyCommunicationSendDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const [commRes, sendsRes] = await Promise.all([
          fetch(`/api/agency/communications/${id}`),
          fetch(`/api/agency/communications/${id}/sends`),
        ]);
        if (cancelled) return;
        const commData = commRes.ok ? ((await commRes.json()) as { communication?: AgencyCommunicationDoc }) : null;
        const sendsData = sendsRes.ok ? ((await sendsRes.json()) as { sends?: AgencyCommunicationSendDoc[] }) : null;
        setCommunication(commData?.communication ?? null);
        setSends(sendsData?.sends ?? []);
      } catch {
        // Best-effort — keep the last good state, try again next tick.
      } finally {
        if (!cancelled) setLoading(false);
      }
      const status = communication?.status;
      const stillLive = !status || status === "queued" || status === "sending" || status === "draft";
      if (!cancelled && stillLive) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isOwner]);

  if (authLoading) return null;
  if (!isOwner) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Communications is managed by the agency owner.</div>;
  }
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3">
        <div className="h-6 w-40 animate-pulse rounded bg-muted/40" />
        <div className="h-24 animate-pulse rounded-xl border bg-muted/30" />
        <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
      </div>
    );
  }
  if (communication?.status === "draft") {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Link href="/agency/communications/broadcasts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to broadcasts
        </Link>
        <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
          <h3 className="text-base font-semibold">This is still a draft</h3>
          <p className="mt-1 text-sm text-muted-foreground">It hasn&apos;t been sent yet — continue editing it in the composer.</p>
          <Link href={`/agency/communications/broadcasts/${id}/edit`}>
            <Button className="mt-4">Continue editing</Button>
          </Link>
        </div>
      </div>
    );
  }
  if (!communication) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Link href="/agency/communications/broadcasts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to broadcasts
        </Link>
        <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
          <h3 className="text-base font-semibold">Communication not found</h3>
        </div>
      </div>
    );
  }

  const t = communication.totals;
  const progress = t.audienceSize > 0 ? Math.round(((t.sent + t.skipped + t.failed) / t.audienceSize) * 100) : 0;
  const cancellable = communication.status === "queued" || communication.status === "sending";

  async function handleCancel() {
    if (!cancellable) return;
    if (!window.confirm(`Cancel this communication? ${t.queued} recipient(s) still queued will NOT be sent.`)) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/agency/communications/${id}/cancel`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't cancel. Try again.");
        return;
      }
      toast.success("Communication cancelled — remaining queued sends will not go out.");
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <Link href="/agency/communications/broadcasts" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Back to broadcasts
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <Mail className="h-4 w-4" />
              </span>
              {communication.subject || "(untitled communication)"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              sent {formatRelativeTime(communication.createdAt)} by {communication.createdBy?.displayName || communication.createdBy?.email || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {cancellable && (
              <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={cancelling} className="text-destructive hover:text-destructive">
                {cancelling ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CircleX className="mr-1 h-3.5 w-3.5" />}
                Cancel send
              </Button>
            )}
            <StatusBadge status={communication.status} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Sent" value={t.sent} tone="emerald" />
        <SummaryCard label="Skipped" value={t.skipped} tone="muted" />
        <SummaryCard label="Failed" value={t.failed} tone="rose" />
        <SummaryCard label="Audience" value={t.audienceSize} tone="muted" />
      </div>

      {t.sent > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <RateCard icon={MailCheck} label="Delivered" count={t.delivered} of={t.sent} tone="emerald" />
          <RateCard icon={Eye} label="Opened" count={t.opened} of={t.sent} tone="blue" />
          <RateCard icon={MousePointerClick} label="Clicked" count={t.clicked} of={t.sent} tone="violet" />
          <RateCard icon={TriangleAlert} label="Bounced" count={t.bounced} of={t.sent} tone="amber" />
          <RateCard icon={Ban} label="Complaints" count={t.complained} of={t.sent} tone="rose" />
        </div>
      )}

      {communication.status !== "completed" && communication.status !== "failed" && communication.status !== "cancelled" && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          {t.queued > 0 && <p className="mt-2 text-xs text-muted-foreground">{t.queued} still queued — sending at ~5/sec.</p>}
        </div>
      )}

      {communication.status === "cancelled" && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3 text-sm text-orange-800 dark:text-orange-300">
          Cancelled{communication.cancelledBy ? ` by ${communication.cancelledBy.displayName}` : ""}. Any rows still shown as &quot;Queued&quot; below will settle to &quot;Cancelled&quot; on their own.
        </div>
      )}

      {communication.errorMessage && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{communication.errorMessage}</div>}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recipients ({sends.length})</div>
        {sends.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No recipients yet.</div>
        ) : (
          <ul className="divide-y">
            {sends.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.recipientName || s.recipientEmail}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.recipientEmail}
                    {s.matchedSources.length > 0 && <span className="ml-2">· {s.matchedSources.join(", ")}</span>}
                  </p>
                </div>
                <EngagementBadges send={s} />
                <SendStatus send={s} />
                <span className="text-xs text-muted-foreground">{formatContactDate(s.sentAt) === "—" ? "—" : formatRelativeTime(s.sentAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SendStatus({ send }: { send: AgencyCommunicationSendDoc }) {
  if (send.status === "sent") {
    return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">Sent</span>;
  }
  if (send.status === "queued") {
    return <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300">Queued</span>;
  }
  if (send.status === "skipped") {
    const reason =
      send.skippedReason === "opted_out" ? "Opted out" : send.skippedReason === "no_email" ? "No email" : send.skippedReason === "cancelled" ? "Cancelled" : "Skipped";
    return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300">{reason}</span>;
  }
  return (
    <span title={send.error ?? undefined} className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300">
      Failed
    </span>
  );
}

function StatusBadge({ status }: { status: AgencyCommunicationDoc["status"] }) {
  const map: Record<AgencyCommunicationDoc["status"], string> = {
    draft: "bg-muted text-muted-foreground ring-1 ring-border",
    queued: "bg-slate-500/15 text-slate-700 ring-1 ring-slate-500/30 dark:text-slate-300",
    sending: "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30 dark:text-blue-300",
    completed: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300",
    failed: "bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300",
    cancelled: "bg-orange-500/15 text-orange-700 ring-1 ring-orange-500/30 dark:text-orange-300",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${map[status]}`}>{status}</span>;
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" | "muted" }) {
  const valueClass = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "rose" ? "text-rose-600 dark:text-rose-400" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

const RATE_TONE_CLASS: Record<string, string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  blue: "text-blue-600 dark:text-blue-400",
  violet: "text-violet-600 dark:text-violet-400",
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
};

function RateCard({ icon: Icon, label, count, of, tone }: { icon: typeof Mail; label: string; count: number; of: number; tone: "emerald" | "blue" | "violet" | "amber" | "rose" }) {
  const pct = of > 0 ? Math.round((count / of) * 100) : 0;
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={`mt-1 font-mono text-2xl font-semibold ${RATE_TONE_CLASS[tone]}`}>{pct}%</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {count} of {of}
      </p>
    </div>
  );
}

function EngagementBadges({ send }: { send: AgencyCommunicationSendDoc }) {
  const e = send.engagement;
  if (!e) return null;
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      {e.delivered && (
        <span title="Delivered">
          <MailCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </span>
      )}
      {e.opened && (
        <span title={`Opened${e.openCount > 1 ? ` (${e.openCount}x)` : ""}`}>
          <Eye className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        </span>
      )}
      {e.clicked && (
        <span title={`Clicked${e.clickCount > 1 ? ` (${e.clickCount}x)` : ""}`}>
          <MousePointerClick className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
        </span>
      )}
      {e.bounced && (
        <span title={`Bounced (${e.bounceType ?? "unknown"})`}>
          <TriangleAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        </span>
      )}
      {e.complained && (
        <span title="Marked as spam">
          <Ban className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
        </span>
      )}
    </div>
  );
}
