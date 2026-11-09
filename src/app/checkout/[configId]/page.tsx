import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { buildCheckoutView } from "@/lib/server/checkout/view-service";
import { CheckoutError } from "@/lib/server/checkout/common";
import { CheckoutPageShell } from "@/components/checkout/checkout-page-shell";

export const dynamic = "force-dynamic";

async function load(configId: string) {
  try {
    // Hosted Offer checkouts live at /offer/{sa}/{offer}/checkout instead.
    if (configId.startsWith("hosted_")) return null;
    return await buildCheckoutView(configId);
  } catch (err) {
    if (err instanceof CheckoutError) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ configId: string }> }): Promise<Metadata> {
  const view = await load((await params).configId);
  return { title: view ? `${view.primary.title} — Checkout` : "Checkout", robots: { index: false } };
}

/** Public page for a Funnel Checkout Step. */
export default async function FunnelCheckoutPage({ params }: { params: Promise<{ configId: string }> }) {
  const view = await load((await params).configId);
  if (!view) notFound();
  return <CheckoutPageShell view={view} />;
}
