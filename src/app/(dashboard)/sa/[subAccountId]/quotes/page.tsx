"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { FileText, Receipt } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QuoteList } from "@/components/quotes/quote-list";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import type { Contact } from "@/types/contacts";

/**
 * Sub-account-wide quotes list. Mounts <QuoteList> with a name-map
 * built from the contacts subscription so each row can show "ACME
 * Plumbing" rather than a contact ID.
 */
export default function QuotesPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = subscribeToContacts({ agencyId, subAccountId }, setContacts);
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  const contactsById = useMemo(() => {
    const map: Record<string, { name: string; email: string }> = {};
    for (const c of contacts) {
      map[c.id] = { name: c.name?.trim() ?? "", email: c.email?.trim() ?? "" };
    }
    return map;
  }, [contacts]);

  return (
    <PageShell width="data">
      <PageHeader
        accent="crescent"
        title="Invoices and Quotes"
        description="Send branded invoices for payment or quotes for review. Recipients view on a shareable link; invoices include a PayPal payment link, quotes get accepted/declined."
        actions={
          <>
            <Button variant="outline" render={<Link href={saPath("/quotes/new")} />}>
              <FileText className="size-4" aria-hidden="true" />
              New quote
            </Button>
            <Button render={<Link href={saPath("/quotes/new?kind=invoice")} />}>
              <Receipt className="size-4" aria-hidden="true" />
              New invoice
            </Button>
          </>
        }
      />

      <QuoteList
        scope={{ agencyId: agencyId ?? "", subAccountId }}
        contacts={contactsById}
      />
    </PageShell>
  );
}
