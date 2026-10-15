"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Lock, Mail, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, toDate } from "@/lib/format";
import type { AgencyCommunicationDoc } from "@/types/agency-communications";
import { agencyAudienceLabel, type AgencyAudienceNames } from "@/lib/agency-communications/audience-label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
import { useConfirm } from "@/components/system/confirm-dialog";
import { BroadcastDraftItem, BroadcastGroupLabel, BroadcastSentItem } from "@/components/broadcasts/broadcast-index";

/** Agency Communications → Broadcasts list — the agency-scope sibling of
 *  the tenant Broadcasts list page, fetch-based instead of onSnapshot. */
export default function AgencyBroadcastsListPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [communications, setCommunications] = useState<AgencyCommunicationDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [names, setNames] = useState<AgencyAudienceNames | null>(null);
  const { confirm, dialog } = useConfirm();

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
    if (!isOwner) return;
    refresh();
    fetch("/api/agency/communications/audience/options", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AgencyAudienceNames | null) => setNames(d))
      .catch(() => setNames(null));
  }, [isOwner]);

  // The tenant list is live (onSnapshot); the agency owner has no
  // client-readable Firestore path here, so refresh while anything is
  // still in flight (and when the tab regains focus) instead.
  const inFlight = communications.some((c) => c.status === "queued" || c.status === "sending");
  useEffect(() => {
    if (!isOwner) return;
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const timer = inFlight ? window.setInterval(refresh, 4000) : null;
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearInterval(timer);
    };
  }, [isOwner, inFlight]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <PageShell width="data">
        <SystemEmptyState icon={Lock} title="Owner only" description="Communications is managed by the agency owner." />
      </PageShell>
    );
  }

  const drafts = communications
    .filter((c) => c.status === "draft")
    .sort((a, b) => (toDate(b.updatedAt ?? b.createdAt)?.getTime() ?? 0) - (toDate(a.updatedAt ?? a.createdAt)?.getTime() ?? 0));
  const sent = communications.filter((c) => c.status !== "draft");

  async function handleDeleteDraft(id: string, label: string) {
    const ok = await confirm({ title: `Delete draft "${label}"?`, description: "This can't be undone.", confirmLabel: "Delete draft", tone: "danger" });
    if (!ok) return;
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
    <PageShell width="data">
      <PageHeader
        accent="crescent"
        breadcrumbs={
          <Link href="/agency/communications" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Communications
          </Link>
        }
        title="Broadcasts"
        description="Bulk email sent as Magnetix Studios. Open any one for per-recipient delivery status."
        actions={
          <Button render={<Link href="/agency/communications/broadcasts/new" />}>
            <Mail className="size-4" aria-hidden="true" /> Send a new broadcast
          </Button>
        }
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : communications.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {drafts.length > 0 && (
            <section className="flex flex-col gap-2">
              <BroadcastGroupLabel>Drafts</BroadcastGroupLabel>
              <ul className="flex flex-col gap-2">
                {drafts.map((c) => (
                  <li key={c.id}>
                    <BroadcastDraftItem
                      href={`/agency/communications/broadcasts/${c.id}/edit`}
                      title={c.subject || "Untitled communication"}
                      status={c.status}
                      meta={<>Last edited {formatRelativeTime(c.updatedAt ?? c.createdAt)}</>}
                      onDelete={() => handleDeleteDraft(c.id, c.subject || "Untitled communication")}
                      deleting={deletingId === c.id}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sent.length > 0 && (
            <section className="flex flex-col gap-2">
              {drafts.length > 0 && <BroadcastGroupLabel>Sent</BroadcastGroupLabel>}
              <ul className="flex flex-col gap-2">
                {sent.map((c) => (
                  <li key={c.id}>
                    <BroadcastSentItem
                      href={`/agency/communications/broadcasts/${c.id}`}
                      title={c.subject || "(untitled communication)"}
                      status={c.status}
                      meta={
                        <>
                          {agencyAudienceLabel(c.audienceSources, names)} · {formatRelativeTime(c.createdAt)} · by{" "}
                          {c.createdBy?.displayName || c.createdBy?.email || "—"}
                        </>
                      }
                      totals={c.totals}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      {dialog}
    </PageShell>
  );
}

function EmptyState() {
  return (
    <SystemEmptyState
      icon={Send}
      title="No broadcasts yet"
      description="Send an email to sub-account owners, Agency Community members, or course/offer buyers."
      action={
        <Button render={<Link href="/agency/communications/broadcasts/new" />}>
          <Mail className="size-4" aria-hidden="true" /> Build your first broadcast
        </Button>
      }
    />
  );
}
