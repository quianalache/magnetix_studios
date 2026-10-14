"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { EmptyState } from "@/components/system/empty-state";
import { ChevronLeft } from "lucide-react";

import { QuoteDetail } from "@/components/quotes/quote-detail";

import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getContact } from "@/lib/firestore/contacts";
import { subscribeToQuote } from "@/lib/firestore/quotes";
import type { Contact } from "@/types/contacts";
import type { Quote } from "@/types/quotes";

interface PageProps {
  params: Promise<{ subAccountId: string; id: string }>;
}

/**
 * Detail page for a single quote. Subscribes to the quote (so edits +
 * lifecycle stamps land in real-time) and one-shot fetches the linked
 * contact for display.
 *
 * Renders <QuoteDetail> in its view/edit modes — all the lifecycle
 * action logic (Send / Mark paid / Delete / Edit) lives there.
 */
export default function QuoteDetailPage({ params }: PageProps) {
  const { id: quoteId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [contact, setContact] = useState<Contact | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    setLoadingQuote(true);
    const unsub = subscribeToQuote(quoteId, (q) => {
      setQuote(q);
      setLoadingQuote(false);
    });
    return () => unsub();
  }, [quoteId, user, authLoading]);

  useEffect(() => {
    if (!quote?.contactId) return;
    let cancelled = false;
    getContact(quote.contactId)
      .then((c) => {
        if (!cancelled) setContact(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [quote?.contactId]);

  const back = (
    <Link href={saPath("/quotes")} className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden="true" />
      Back to quotes
    </Link>
  );

  if (loadingQuote) {
    return (
      <PageShell width="data">
        <Skeleton className="h-64 w-full rounded-card" aria-label="Loading quote" />
      </PageShell>
    );
  }

  if (!quote) {
    return (
      <PageShell width="data">
        {back}
        <EmptyState compact title="Quote not found" description="It may have been deleted." />
      </PageShell>
    );
  }

  const contactName = contact
    ? contact.name || contact.email || contact.phone || "(unnamed contact)"
    : "(loading…)";

  return (
    <PageShell width="data" className="gap-4">
      {back}

      <QuoteDetail
        quote={quote}
        scope={{ agencyId: agencyId ?? "", subAccountId }}
        contactName={contactName}
        contactEmail={contact?.email || undefined}
        listHref={saPath("/quotes")}
      />
    </PageShell>
  );
}
