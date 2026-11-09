import { tenantBrandStyle } from "@/lib/brand/tenant-brand";
import { PoweredByMagnetix } from "@/components/brand/powered-by-magnetix";
import { CheckoutRenderer } from "@/components/checkout/checkout-renderer";
import type { CheckoutView } from "@/lib/checkout/view-types";

/** Public checkout frame: tenant-branded surface + the shared renderer. */
export function CheckoutPageShell({ view }: { view: CheckoutView }) {
  return (
    <main
      className="tenant-surface tenant-wash min-h-screen px-4 py-8 sm:px-6 sm:py-12"
      style={tenantBrandStyle({ name: view.brand.name, logoUrl: view.brand.logoUrl, primary: view.brand.primary })}
      data-public-shell="checkout"
    >
      {view.payment.mode === "test" && (
        <p className="mx-auto mb-4 w-fit rounded-full bg-status-warning-bg px-3 py-1 text-caption font-semibold text-status-warning-fg">
          Test mode — no real money will be charged
        </p>
      )}
      <CheckoutRenderer view={view} />
      <PoweredByMagnetix className="mt-10" />
    </main>
  );
}
