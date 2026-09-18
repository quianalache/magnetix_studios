"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, FileEdit, Loader2, Mail, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, toDate } from "@/lib/format";
import type { AgencyCommunicationDoc } from "@/types/agency-communications";

/** Agency Communications → Broadcasts list — the agency-scope sibling of
 *  the tenant Broadcasts list page, fetch-based instead of onSnapshot. */
export default function AgencyBroadcastsListPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [communications, setCommunications] = useState<AgencyCommunicationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function refresh() {
    fetch("/api/agency/communications")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { communications?: AgencyCommunicationDoc[] } | null) => {
        const list = d?.communications ?? [];
        list.sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));
        setCommunications(list);
      })
      .catch(() => setCommunications([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (isOwner) refresh();
  }, [isOwner]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">Communications is managed by the agency owner.</div>
      </div>
    );
  }

  const drafts = communications
    .filter((c) => c.status === "draft")
    .sort((a, b) => (toDate(b.updatedAt ?? b.createdAt)?.getTime() ?? 0) - (toDate(a.updatedAt ?? a.createdAt)?.getTime() ?? 0));
  const sent = communications.filter((c) => c.status !== "draft");

  async function handleDeleteDraft(id: string, label: string) {
    if (!window.confirm(`Delete draft "${label}"? This can't be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/agency/communications/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't delete draft.");
        return;
      }
      toast.success("Draft deleted.");
      refresh();
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link href="/agency/communications" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Communications
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Broadcasts</h1>
          <p className="text-sm text-muted-foreground">Bulk email sent as Magnetix Studios. Open any one for per-recipient delivery status.</p>
        </div>
        <Link href="/agency/communications/broadcasts/new">
          <Button variant="outline">
            <Mail className="mr-1 h-4 w-4" /> Send a new broadcast
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      ) : communications.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {drafts.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Drafts</h2>
              <ul className="space-y-2">
                {drafts.map((c) => (
                  <li key={c.id}>
                    <div className="flex items-center gap-2 rounded-xl border border-dashed bg-card/60 p-4 transition hover:border-primary/50 hover:bg-accent/40">
                      <Link href={`/agency/communications/broadcasts/${c.id}/edit`} className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <FileEdit className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{c.subject || "Untitled communication"}</p>
                            <StatusBadge status={c.status} />
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">Last edited {formatRelativeTime(c.updatedAt ?? c.createdAt)}</p>
                        </div>
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(c.id, c.subject || "Untitled communication")}
                        disabled={deletingId === c.id}
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete draft"
                      >
                        {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sent.length > 0 && (
            <div className="space-y-2">
              {drafts.length > 0 && <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sent</h2>}
              <ul className="space-y-2">
                {sent.map((c) => (
                  <li key={c.id}>
                    <Link href={`/agency/communications/broadcasts/${c.id}`} className="block rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:bg-accent/40">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <Mail className="h-3.5 w-3.5" />
                            </span>
                            <p className="truncate font-medium">{c.subject || "(untitled communication)"}</p>
                            <StatusBadge status={c.status} />
                          </div>
                          <p className="ml-9 mt-1 text-xs text-muted-foreground">
                            {formatRelativeTime(c.createdAt)} · by {c.createdBy?.displayName || c.createdBy?.email || "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <Stat label="Sent" value={c.totals.sent} tone="emerald" />
                          <Stat label="Skipped" value={c.totals.skipped} tone="muted" />
                          <Stat label="Failed" value={c.totals.failed} tone={c.totals.failed > 0 ? "rose" : "muted"} />
                          <Stat label="Total" value={c.totals.audienceSize} tone="muted" />
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
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
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status]}`}>{status}</span>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" | "muted" }) {
  const valueClass = tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "rose" ? "text-rose-600 dark:text-rose-400" : "text-foreground";
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className={`font-mono text-sm font-semibold ${valueClass}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Send className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">No broadcasts yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Send an email to sub-account owners, Agency Community members, or course/offer buyers.</p>
      <div className="mt-6 flex justify-center">
        <Link href="/agency/communications/broadcasts/new">
          <Button>
            <Mail className="mr-1 h-4 w-4" /> Build your first broadcast
          </Button>
        </Link>
      </div>
    </div>
  );
}
