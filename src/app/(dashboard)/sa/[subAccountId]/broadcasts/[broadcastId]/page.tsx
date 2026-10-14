"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  collection,
  doc,
  onSnapshot,
  query,
} from "firebase/firestore";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { formatContactDate, formatRelativeTime } from "@/lib/format";
import { audienceLabel } from "@/lib/broadcasts/audience-label";

import type {
  BroadcastDoc,
  BroadcastSendDoc,
} from "@/types";
import { PageShell } from "@/components/system/page-shell";
import { Tag } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import {
  BroadcastDetailState,
  BroadcastDetailView,
  BroadcastEngagementIcons,
  BroadcastSendStatus,
} from "@/components/broadcasts/broadcast-index";

/**
 * Broadcast detail page — header with totals, then a per-recipient table
 * showing each contact's delivery status. Live via onSnapshot so the rows
 * update as the QStash fan-out drains.
 */
export default function BroadcastDetailPage() {
  const params = useParams<{ broadcastId: string }>();
  const id = params.broadcastId;
  const { saPath } = useSubAccount();
  const [broadcast, setBroadcast] = useState<BroadcastDoc | null>(null);
  const [sends, setSends] = useState<BroadcastSendDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (!id) return;
    const unsubBroadcast = onSnapshot(
      doc(getFirebaseDb(), "broadcasts", id),
      (snap) => {
        setBroadcast(snap.exists() ? (snap.data() as BroadcastDoc) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubSends = onSnapshot(
      query(collection(getFirebaseDb(), "broadcasts", id, "sends")),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as BroadcastSendDoc);
        list.sort((a, b) => {
          // Failed → top, then queued, then sent, then skipped — failures
          // are what the operator most needs to see.
          const order: Record<BroadcastSendDoc["status"], number> = {
            failed: 0,
            queued: 1,
            sent: 2,
            skipped: 3,
          };
          const o = order[a.status] - order[b.status];
          if (o !== 0) return o;
          return a.toName.localeCompare(b.toName);
        });
        setSends(list);
      },
    );
    return () => {
      unsubBroadcast();
      unsubSends();
    };
  }, [id]);

  if (loading) {
    return (
      <PageShell width="data">
        <BroadcastDetailState kind="loading" backHref={saPath("/broadcasts")} />
      </PageShell>
    );
  }
  // Persistent Broadcast Drafts V1 (2026-08-27) — a draft has no totals or
  // recipients yet, so this read-only detail page doesn't make sense for
  // it. Send here from an old bookmark / the list race and land on the
  // composer instead, where the content is actually editable.
  if (broadcast?.status === "draft") {
    return (
      <PageShell width="data">
        <BroadcastDetailState kind="draft" backHref={saPath("/broadcasts")} editHref={saPath(`/broadcasts/${id}/edit`)} />
      </PageShell>
    );
  }

  if (!broadcast) {
    return (
      <PageShell width="data">
        <BroadcastDetailState kind="missing" backHref={saPath("/broadcasts")} />
      </PageShell>
    );
  }

  const t = broadcast.totals;
  const cancellable = broadcast.status === "queued" || broadcast.status === "sending";

  async function handleCancel() {
    if (!cancellable) return;
    const ok = await confirm({
      title: "Cancel this broadcast?",
      description: `${t.queued} recipient(s) still queued will NOT be sent. Already-sent emails (${t.sent}) can't be recalled.`,
      confirmLabel: "Cancel send",
      cancelLabel: "Keep sending",
      tone: "danger",
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/broadcasts/${id}/cancel`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't cancel. Try again.");
        return;
      }
      toast.success("Broadcast cancelled — remaining queued sends will not go out.");
    } catch {
      toast.error("Network error. Try again.");
    } finally {
      setCancelling(false);
    }
  }

  const skippedLabel = (r?: string | null) =>
    r === "opt_out" ? "Opted out" : r === "no_email" ? "No email" : r === "contact_missing" ? "Contact deleted" : r === "cancelled" ? "Cancelled" : "Skipped";

  return (
    <PageShell width="data">
      <BroadcastDetailView
        backHref={saPath("/broadcasts")}
        title={broadcast.subject || broadcast.templateName || "(untitled broadcast)"}
        titleBadge={
          broadcast.testMode ? (
            <span
              title={
                broadcast.testRecipientContactIds
                  ? `Test Mode — restricted to ${broadcast.testRecipientContactIds.length} allowlisted recipient(s)`
                  : "Test Mode"
              }
            >
              <Tag color="violet" className="gap-1">
                <FlaskConical className="size-3" aria-hidden="true" /> Test
              </Tag>
            </span>
          ) : null
        }
        preview={broadcast.subjectPreview}
        meta={
          <>
            {audienceLabel(broadcast.audienceFilter)} · sent {formatRelativeTime(broadcast.createdAt)} by{" "}
            {broadcast.createdBy?.displayName || broadcast.createdBy?.email || "—"}
          </>
        }
        status={broadcast.status}
        cancel={cancellable ? { onCancel: handleCancel, cancelling } : null}
        totals={t}
        showProgress={broadcast.status !== "completed" && broadcast.status !== "failed" && broadcast.status !== "cancelled"}
        progressNote={t.queued > 0 ? <>{t.queued} still queued — sending at ~5/sec via QStash.</> : null}
        cancelledNote={
          broadcast.status === "cancelled" ? (
            <>
              Cancelled{broadcast.cancelledBy ? ` by ${broadcast.cancelledBy.displayName}` : ""}
              {broadcast.cancelledAt ? ` ${formatRelativeTime(broadcast.cancelledAt)}` : ""}. Any rows still shown as
              &quot;Queued&quot; below will settle to &quot;Cancelled&quot; on their own — they will not send.
            </>
          ) : null
        }
        errorMessage={broadcast.errorMessage}
        recipients={sends.map((s) => ({
          id: s.id,
          name: s.toName || s.toEmail,
          email: s.toEmail,
          engagement: <BroadcastEngagementIcons e={s.engagement} />,
          status: <BroadcastSendStatus status={s.status} skippedLabel={skippedLabel(s.skippedReason)} error={s.error} />,
          when: formatContactDate(s.sentAt) === "—" ? "—" : formatRelativeTime(s.sentAt),
        }))}
      />
      {dialog}
    </PageShell>
  );
}
