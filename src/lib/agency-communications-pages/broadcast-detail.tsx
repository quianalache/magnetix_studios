"use client";

import { use, useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { formatContactDate, formatRelativeTime } from "@/lib/format";

import type { AgencyCommunicationDoc, AgencyCommunicationSendDoc } from "@/types/agency-communications";
import { agencyAudienceLabel, type AgencyAudienceNames } from "@/lib/agency-communications/audience-label";
import { Lock } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { PageShell } from "@/components/system/page-shell";
import { useConfirm } from "@/components/system/confirm-dialog";
import {
  BroadcastDetailState,
  BroadcastDetailView,
  BroadcastEngagementIcons,
  BroadcastSendStatus,
} from "@/components/broadcasts/broadcast-index";

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
  const [names, setNames] = useState<AgencyAudienceNames | null>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (!isOwner) return;
    fetch("/api/agency/communications/audience/options", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AgencyAudienceNames | null) => setNames(d))
      .catch(() => setNames(null));
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      // Status of THIS fetch — reading component state here would be the
      // stale first-render value (null), which kept polling forever.
      let status: AgencyCommunicationDoc["status"] | undefined;
      try {
        const [commRes, sendsRes] = await Promise.all([
          fetch(`/api/agency/communications/${id}`),
          fetch(`/api/agency/communications/${id}/sends`),
        ]);
        if (cancelled) return;
        const commData = commRes.ok ? ((await commRes.json()) as { communication?: AgencyCommunicationDoc }) : null;
        const sendsData = sendsRes.ok ? ((await sendsRes.json()) as { sends?: AgencyCommunicationSendDoc[] }) : null;
        setCommunication(commData?.communication ?? null);
        status = commData?.communication?.status;
        setSends(sendsData?.sends ?? []);
      } catch {
        // Best-effort — keep the last good state, try again next tick.
      } finally {
        if (!cancelled) setLoading(false);
      }
      const stillLive = !status || status === "queued" || status === "sending" || status === "draft";
      if (!cancelled && stillLive) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, isOwner]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <PageShell width="data">
        <EmptyState icon={Lock} title="Owner only" description="Communications is managed by the agency owner." />
      </PageShell>
    );
  }
  if (loading) {
    return (
      <PageShell width="data">
        <BroadcastDetailState kind="loading" backHref="/agency/communications/broadcasts" />
      </PageShell>
    );
  }
  if (communication?.status === "draft") {
    return (
      <PageShell width="data">
        <BroadcastDetailState
          kind="draft"
          backHref="/agency/communications/broadcasts"
          editHref={`/agency/communications/broadcasts/${id}/edit`}
        />
      </PageShell>
    );
  }
  if (!communication) {
    return (
      <PageShell width="data">
        <BroadcastDetailState kind="missing" backHref="/agency/communications/broadcasts" notFoundTitle="Communication not found" />
      </PageShell>
    );
  }

  const t = communication.totals;
  const cancellable = communication.status === "queued" || communication.status === "sending";

  async function handleCancel() {
    if (!cancellable) return;
    const ok = await confirm({
      title: "Cancel this communication?",
      description: `${t.queued} recipient(s) still queued will NOT be sent.`,
      confirmLabel: "Cancel send",
      cancelLabel: "Keep sending",
      tone: "danger",
    });
    if (!ok) return;
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

  const skippedLabel = (r?: string | null) =>
    r === "opted_out" ? "Opted out" : r === "no_email" ? "No email" : r === "cancelled" ? "Cancelled" : "Skipped";

  return (
    <PageShell width="data">
      <BroadcastDetailView
        backHref="/agency/communications/broadcasts"
        title={communication.subject || "(untitled communication)"}
        meta={
          <>
            {agencyAudienceLabel(communication.audienceSources, names)} · sent {formatRelativeTime(communication.createdAt)} by{" "}
            {communication.createdBy?.displayName || communication.createdBy?.email || "—"}
          </>
        }
        status={communication.status}
        cancel={cancellable ? { onCancel: handleCancel, cancelling } : null}
        totals={t}
        showProgress={communication.status !== "completed" && communication.status !== "failed" && communication.status !== "cancelled"}
        progressNote={t.queued > 0 ? <>{t.queued} still queued — sending at ~5/sec.</> : null}
        cancelledNote={
          communication.status === "cancelled" ? (
            <>
              Cancelled{communication.cancelledBy ? ` by ${communication.cancelledBy.displayName}` : ""}
              {communication.cancelledAt ? ` ${formatRelativeTime(communication.cancelledAt)}` : ""}. Any rows still
              shown as &quot;Queued&quot; below will settle to &quot;Cancelled&quot; on their own.
            </>
          ) : null
        }
        errorMessage={communication.errorMessage}
        recipients={sends.map((s) => ({
          id: s.id,
          name: s.recipientName || s.recipientEmail,
          email: s.recipientEmail,
          extra: s.matchedSources.length > 0 ? <span className="ml-2">· {s.matchedSources.join(", ")}</span> : null,
          engagement: <BroadcastEngagementIcons e={s.engagement} />,
          status: <BroadcastSendStatus status={s.status} skippedLabel={skippedLabel(s.skippedReason)} error={s.error} />,
          when: formatContactDate(s.sentAt) === "—" ? "—" : formatRelativeTime(s.sentAt),
        }))}
      />
      {dialog}
    </PageShell>
  );
}
