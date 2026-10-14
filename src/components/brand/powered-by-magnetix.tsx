import { CUSTOM_BRAND } from "@/config/landing";
import { cn } from "@/lib/utils";

/**
 * "Powered by Magnetix" — the platform credit on tenant-branded public pages
 * (proof pages, 2026-10-14). Shown by DEFAULT on every tenant surface; the
 * tenant's own brand leads the page, this stays small and neutral at the foot.
 *
 * The platform name comes from CUSTOM_BRAND (src/config/landing.ts), so a
 * white-label deployment credits its own brand — same source the hosted
 * form footer uses.
 *
 * Hiding the credit is a future plan feature. `canHidePoweredBy()` is the one
 * hook for it and returns false today — there is no plan gate yet, so no
 * tenant can hide it. When a plan gate exists, implement it there and pass
 * the result as `hidden`.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the tenant is the future plan-gate input
export function canHidePoweredBy(tenant?: { subAccountId?: string | null }): boolean {
  return false;
}

export function PoweredByMagnetix({ hidden = false, className }: { hidden?: boolean; className?: string }) {
  if (hidden) return null;
  return (
    <p
      data-powered-by=""
      className={cn("text-center text-xs text-muted-foreground", className)}
    >
      Powered by <span className="font-medium text-foreground">{CUSTOM_BRAND.name}</span>
    </p>
  );
}
