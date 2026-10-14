"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SettingsSection } from "@/components/system/settings-section";
import { EmptyState } from "@/components/system/empty-state";

import { QuoteBuilder, type QuoteFormValues } from "@/components/quotes/quote-builder";

import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToCourseOffers } from "@/lib/firestore/course-offers";
import type { Contact } from "@/types/contacts";
import type { CourseOffer } from "@/types/course-offers";
import type { QuoteKind } from "@/types/quotes";

/**
 * New-quote flow:
 *
 *   1. Resolve contactId. If the URL already has `?contactId=…` (the
 *      "+ Quote" entry point from a contact profile), skip step 2.
 *      Otherwise show a contact picker.
 *   2. Mount <QuoteBuilder> for that contact. Save → POST create →
 *      redirect to the new quote's detail page.
 *
 * Kept deliberately thin — all the form complexity lives in the builder
 * component; this page just resolves the contact + handles the API call.
 */
export default function NewQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath, subAccount } = useSubAccount();
  // Phase 2: a workspace with Stripe connected is never blocked by a
  // missing PayPal.me username — only warn when NEITHER is available.
  const stripeConnected =
    !!subAccount?.stripeConnect?.accountId &&
    subAccount.stripeConnect.chargesEnabled === true;
  const paypalConnected = !!subAccount?.paypalConfig?.username;
  const noPaymentMethodConnected = !stripeConnected && !paypalConnected;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [offers, setOffers] = useState<CourseOffer[]>([]);
  const [contactId, setContactId] = useState<string>(
    searchParams.get("contactId") ?? "",
  );
  const initialKind: QuoteKind =
    searchParams.get("kind") === "invoice" ? "invoice" : "quote";
  const [kind, setKind] = useState<QuoteKind>(initialKind);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsubC = subscribeToContacts({ agencyId, subAccountId }, setContacts);
    const unsubO = subscribeToCourseOffers(subAccountId, setOffers, () =>
      setOffers([]),
    );
    return () => {
      unsubC();
      unsubO();
    };
  }, [user, agencyId, subAccountId, authLoading]);

  const selectedContact = useMemo(
    () => contacts.find((c) => c.id === contactId) ?? null,
    [contacts, contactId],
  );
  const contactName = selectedContact
    ? selectedContact.name ||
      selectedContact.email ||
      selectedContact.phone ||
      "(unnamed contact)"
    : "";

  const handleCreate = async (values: QuoteFormValues) => {
    if (!contactId) {
      setError("Pick a contact first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          kind,
          lineItems: values.lineItems,
          currency: values.currency,
          globalDiscount: values.globalDiscount,
          globalTaxPercent: values.globalTaxPercent,
          termsAndNotes: values.termsAndNotes,
          billedToOrganization: values.billedToOrganization,
          billingAddress: values.billingAddress,
          validUntilDateString: values.validUntilDateString,
          paymentDueDays: values.paymentDueDays,
          autoCreateDealOnAccept: values.autoCreateDealOnAccept,
          paymentMode: values.paymentMode,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Create failed (HTTP ${res.status})`);
      }
      const created = (await res.json()) as { id: string };
      router.push(saPath(`/quotes/${created.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      throw err; // bubble so the builder shows its own state
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell width="data">
      <PageHeader
        breadcrumbs={
          <Link href={saPath("/quotes")} className="inline-flex items-center gap-1 hover:text-foreground">
            <ChevronLeft className="size-3.5" aria-hidden="true" /> Invoices and Quotes
          </Link>
        }
        title={`New ${kind}`}
        description={
          kind === "invoice"
            ? "Build the line items and totals. Save as draft now — sending generates a payment link and emails the recipient."
            : "Build the line items, totals, and terms. Save as a draft now — send to the recipient when you're ready."
        }
      />

      <SettingsSection
        title="Type"
        description={
          kind === "invoice"
            ? "Skip the estimate step — go straight to a payable invoice."
            : "Send an estimate that the recipient can accept or decline. Convert to an invoice once accepted."
        }
      >
        <SegmentedControl<QuoteKind>
          value={kind}
          onChange={setKind}
          options={[
            { value: "quote", label: "Quote" },
            { value: "invoice", label: "Invoice" },
          ]}
          className="self-start"
        />
      </SettingsSection>

      {kind === "invoice" && noPaymentMethodConnected && (
        <Alert tone="warning" title="No payment method connected for this workspace.">
          You can save this invoice as a draft, but you won&apos;t be able to send it until Stripe or PayPal is
          connected — the payment link is generated at send time.{" "}
          <Link
            href={saPath("/dashboard/settings?section=payments")}
            className="font-medium underline-offset-4 hover:underline"
          >
            Connect a payment method →
          </Link>
        </Alert>
      )}

      {contacts.length === 0 ? (
        <EmptyState
          compact
          title="No contacts in this sub-account yet"
          description="Quotes and invoices go to a contact."
          action={
            <Button variant="outline" size="sm" render={<Link href={saPath("/contacts")} />}>
              Add a contact first
            </Button>
          }
        />
      ) : (
        <>
          <QuoteBuilder
            kind={kind}
            contactName={contactName}
            contacts={contacts}
            selectedContactId={contactId}
            onContactChange={setContactId}
            offers={offers}
            onSave={handleCreate}
            onCancel={() => router.push(saPath("/quotes"))}
            saveLabel={submitting ? "Creating…" : "Create draft"}
          />
          {error && (
            <Alert tone="danger" title="Couldn't create it">
              {error}
            </Alert>
          )}
        </>
      )}
    </PageShell>
  );
}
