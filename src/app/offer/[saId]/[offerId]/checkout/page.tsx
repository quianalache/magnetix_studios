import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildCheckoutView } from "@/lib/server/checkout/view-service";
import { hostedConfigId } from "@/lib/server/checkout/config-service";
import { CheckoutError } from "@/lib/server/checkout/common";
import { CheckoutPageShell } from "@/components/checkout/checkout-page-shell";

export const dynamic = "force-dynamic";

async function load(saId: string, offerId: string) {
  try {
    const view = await buildCheckoutView(hostedConfigId(offerId));
    return view.subAccountId === saId ? view : null;
  } catch (err) {
    if (err instanceof CheckoutError) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ saId: string; offerId: string }> }): Promise<Metadata> {
  const { saId, offerId } = await params;
  const view = await load(saId, offerId);
  return { title: view ? `${view.primary.title} — Checkout` : "Checkout", robots: { index: false } };
}

/** The Offer's hosted checkout (only when turned on in Checkout Settings). */
export default async function HostedOfferCheckoutPage({ params }: { params: Promise<{ saId: string; offerId: string }> }) {
  const { saId, offerId } = await params;
  const view = await load(saId, offerId);
  if (!view) notFound();
  return <CheckoutPageShell view={view} />;
}
