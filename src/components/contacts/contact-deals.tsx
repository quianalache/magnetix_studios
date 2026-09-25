"use client";

import { useEffect, useState } from "react";
import { Briefcase } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToDealsForContact } from "@/lib/firestore/deals";
import { formatCurrency, daysSince } from "@/lib/format";
import { getStage, type Deal } from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import { Button } from "@/components/ui/button";
import { RelatedCard } from "@/components/contacts/related-card";

const MAX_SHOWN = 5;

export function ContactDeals({
  contact,
  collapsible = null,
}: {
  contact: Contact;
  /** Right-panel mode (Contacts redesign): fold toggle keyed by this id. */
  collapsible?: string | null;
}) {
  const { user } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const stages = usePipelineStages();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !agencyId) return;
    setLoading(true);
    const unsub = subscribeToDealsForContact(
      contact.id,
      { agencyId, subAccountId },
      (list) => {
        setDeals(list);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [contact.id, user, agencyId, subAccountId]);

  return (
    <RelatedCard
      title="Deals"
      summary={loading ? "…" : `${deals.length} on this contact`}
      collapsible={collapsible}
      action={
        <NewDealDialog
          contacts={[contact]}
          defaultContactId={contact.id}
          trigger={
            <Button size="sm" variant="outline" className="pointer-events-none">
              + Add deal
            </Button>
          }
        />
      }
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border bg-muted/40"
            />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          No deals yet. Track your first opportunity.
        </p>
      ) : (
        <ul className="space-y-2">
          {deals.slice(0, MAX_SHOWN).map((deal) => {
            const stage = getStage(deal.stageId, stages);
            const days = daysSince(deal.stageChangedAt);
            return (
              <li
                key={deal.id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{deal.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(deal.value, deal.currency)} ·{" "}
                      {days === 0 ? "today" : `${days}d in stage`}
                    </p>
                  </div>
                </div>
                <Link
                  href={saPath("/pipeline")}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-80 ${stage.tone}`}
                >
                  {stage.label}
                </Link>
              </li>
            );
          })}
          {deals.length > MAX_SHOWN && (
            <li>
              <Link
                href={saPath("/pipeline")}
                className="block pt-1 text-center text-xs font-medium text-primary hover:underline"
              >
                View all {deals.length} in the pipeline
              </Link>
            </li>
          )}
        </ul>
      )}
    </RelatedCard>
  );
}
