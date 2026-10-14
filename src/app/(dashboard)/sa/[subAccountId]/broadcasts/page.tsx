"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
import { useConfirm } from "@/components/system/confirm-dialog";
import { BroadcastDraftItem, BroadcastGroupLabel, BroadcastSentItem } from "@/components/broadcasts/broadcast-index";
import { formatRelativeTime, toDate } from "@/lib/format";
import { audienceLabel } from "@/lib/broadcasts/audience-label";
import type { BroadcastDoc } from "@/types";

/**
 * Broadcasts list — every bulk-email batch fired from this sub-account,
 * newest first. Each row shows audience size, sent / skipped / failed
 * totals, and links into the per-recipient detail page.
 *
 * v1 is email-only. v2 adds SMS broadcasts and a channel filter chip.
 */
export default function BroadcastsListPage() {
  const { user, loading: authLoading } = useAuth();
  const { agencyId, subAccountId, saPath } = useSubAccount();
  const [broadcasts, setBroadcasts] = useState<BroadcastDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const q = query(
      collection(getFirebaseDb(), "broadcasts"),
      where("subAccountId", "==", subAccountId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as BroadcastDoc);
        list.sort(
          (a, b) =>
            (toDate(b.createdAt)?.getTime() ?? 0) -
            (toDate(a.createdAt)?.getTime() ?? 0),
        );
        setBroadcasts(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  // Persistent Broadcast Drafts V1 (2026-08-27) — drafts get their own
  // section, sorted by last-edited (not creation time, which for a draft
  // that's been reopened repeatedly is stale and uninteresting). Never
  // mixed into the sent-history list below, per spec.
  const drafts = broadcasts
    .filter((b) => b.status === "draft")
    .sort(
      (a, b) =>
        (toDate(b.updatedAt ?? b.createdAt)?.getTime() ?? 0) -
        (toDate(a.updatedAt ?? a.createdAt)?.getTime() ?? 0),
    );
  const sent = broadcasts.filter((b) => b.status !== "draft");

  async function handleDeleteDraft(id: string, label: string) {
    const ok = await confirm({ title: `Delete draft "${label}"?`, description: "This can't be undone.", confirmLabel: "Delete draft", tone: "danger" });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/broadcasts/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Couldn't delete draft.");
        return;
      }
      toast.success("Draft deleted.");
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
        title="Broadcasts"
        description="Bulk email sends. Open any one for per-recipient delivery status."
        actions={
          <Button render={<Link href={saPath("/broadcasts/new")} />}>
            <Mail className="size-4" aria-hidden="true" />
            Send a new broadcast
          </Button>
        }
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <EmptyState newBroadcastHref={saPath("/broadcasts/new")} />
      ) : (
        <>
          {drafts.length > 0 && (
            <section className="flex flex-col gap-2">
              <BroadcastGroupLabel>Drafts</BroadcastGroupLabel>
              <ul className="flex flex-col gap-2">
                {drafts.map((b) => (
                  <li key={b.id}>
                    <BroadcastDraftItem
                      href={saPath(`/broadcasts/${b.id}/edit`)}
                      title={b.subject || "Untitled Broadcast"}
                      status={b.status}
                      meta={<>Last edited {formatRelativeTime(b.updatedAt ?? b.createdAt)}</>}
                      onDelete={() => handleDeleteDraft(b.id, b.subject || "Untitled Broadcast")}
                      deleting={deletingId === b.id}
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
                {sent.map((b) => (
                  <li key={b.id}>
                    <BroadcastSentItem
                      href={saPath(`/broadcasts/${b.id}`)}
                      title={b.subject || b.templateName || "(untitled broadcast)"}
                      status={b.status}
                      preview={b.subjectPreview}
                      meta={
                        <>
                          {audienceLabel(b.audienceFilter)} · {formatRelativeTime(b.createdAt)} · by{" "}
                          {b.createdBy?.displayName || b.createdBy?.email || "—"}
                        </>
                      }
                      totals={b.totals}
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

function EmptyState({ newBroadcastHref }: { newBroadcastHref: string }) {
  return (
    <SystemEmptyState
      icon={Send}
      title="No broadcasts yet"
      description="Send a bulk email to all contacts, or to anyone with a specific tag / pipeline stage. Opted-out contacts are skipped automatically."
      action={
        <Button render={<Link href={newBroadcastHref} />}>
          <Mail className="size-4" aria-hidden="true" />
          Build your first broadcast
        </Button>
      }
    />
  );
}
