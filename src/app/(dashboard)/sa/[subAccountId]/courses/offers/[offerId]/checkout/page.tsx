"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { StatusPill } from "@/components/system/status-pill";
import { EmptyState } from "@/components/system/empty-state";
import { CheckoutSettingsEditor, type EditorPayload } from "@/components/checkout/checkout-settings-editor";
import { useSubAccount } from "@/context/sub-account-context";
import { commerceFetch } from "@/lib/client/commerce-api";

/** Offer → Checkout Settings: the hosted (standalone) checkout for this Offer. */
export default function OfferCheckoutSettingsPage() {
  const { subAccountId, offerId } = useParams<{ subAccountId: string; offerId: string }>();
  const { isAdmin } = useSubAccount();
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    commerceFetch<EditorPayload>(subAccountId, `offers/${offerId}/hosted-checkout`).then(setPayload, (e: Error) => setError(e.message));
  }, [subAccountId, offerId]);

  if (error) {
    return (
      <PageShell width="wide">
        <EmptyState title="Couldn't open Checkout Settings" description={error} action={<Link className="underline" href={`/sa/${subAccountId}/courses?tab=offers`}>Back to Offers</Link>} />
      </PageShell>
    );
  }
  if (!payload) return <PageShellLoading width="wide" blocks={3} />;
  const offer = payload.offer!;
  const publicUrl = payload.config.enabled && offer.visibility === "published" ? `/offer/${subAccountId}/${offerId}/checkout` : null;

  return (
    <PageShell width="wide">
      <PageHeader
        breadcrumbs={
          <Link href={`/sa/${subAccountId}/courses/offers/${offerId}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption">
            <ArrowLeft className="size-3.5" aria-hidden /> {offer.title}
          </Link>
        }
        title="Checkout Settings"
        description="The hosted checkout for this Offer's own page. Funnel checkouts have their own settings."
        actions={<StatusPill status={payload.config.enabled ? "live" : "off"} tone={payload.config.enabled ? "success" : "neutral"}>{payload.config.enabled ? "New checkout on" : "Classic enroll form"}</StatusPill>}
      />
      {offer.systemManaged ? (
        <EmptyState title="Managed by the Community" description="Community pricing Offers are checked out from the Community itself." />
      ) : !isAdmin ? (
        <EmptyState title="Admins only" description="Ask a workspace admin to change checkout settings." />
      ) : (
        <CheckoutSettingsEditor
          kind="hosted_offer"
          subAccountId={subAccountId}
          payload={payload}
          publicUrl={publicUrl}
          onSave={(body) => commerceFetch<EditorPayload>(subAccountId, `offers/${offerId}/hosted-checkout`, { method: "PUT", body }).then((p) => (setPayload((cur) => ({ ...cur!, ...p })), p))}
        />
      )}
    </PageShell>
  );
}
