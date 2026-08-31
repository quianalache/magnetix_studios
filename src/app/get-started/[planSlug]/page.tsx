import { notFound } from "next/navigation";
import { resolveCustomBrand, resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { resolvePublicPlan } from "@/lib/server/billing-service";
import { formatBillingPrice } from "@/lib/billing/status";
import { PLAN_GATE_LABELS, type PlanGateKey } from "@/types/billing";
import { PlanSignupForm } from "@/components/public-signup/plan-signup-form";

export const dynamic = "force-dynamic";

/**
 * Public Magnetix SaaS Signup — plan entry page. The stable public URL an
 * agency owner puts on GitPage, Pages & Funnels, email, or social (see
 * Agency → Billing's "Copy sale link"). No authentication; the plan is
 * resolved server-side via `resolvePublicPlan`, which is also the SAME
 * check `/api/checkout/platform-signup` re-runs before creating a Stripe
 * Checkout Session — this page never trusts its own render as proof a
 * checkout is actually allowed.
 *
 * Deliberately exposes NO internal ids to the client: the plan's Firestore
 * doc id and agencyId never leave the server — only `planSlug` (already in
 * the URL) travels back to the checkout endpoint, which re-resolves
 * everything itself.
 */
export default async function PublicPlanSignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ planSlug: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { planSlug } = await params;
  const sp = await searchParams;

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) notFound();

  const [plan, brand] = await Promise.all([
    resolvePublicPlan(agencyId, planSlug),
    resolveCustomBrand(),
  ]);
  if (!plan) notFound();

  const includedFeatures = (Object.keys(plan.gates) as PlanGateKey[])
    .filter((key) => plan.gates[key])
    .map((key) => PLAN_GATE_LABELS[key]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, owner-uploaded brand logo URL; no static import target
            <img
              src={brand.logoUrl}
              alt={brand.name}
              className="mx-auto mb-3 h-10 w-auto"
            />
          ) : null}
          <p className="text-sm font-medium text-muted-foreground">
            {brand.name}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {sp.cancelled === "1" && (
            <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              Checkout wasn&apos;t completed — no charge was made. Pick up
              where you left off below whenever you&apos;re ready.
            </div>
          )}

          <h1 className="text-xl font-semibold">{plan.name}</h1>
          {plan.description && (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {plan.description}
            </p>
          )}

          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight">
              {formatBillingPrice(plan.priceMonthlyCents, plan.currency)}
            </span>
            <span className="text-sm text-muted-foreground">/mo</span>
          </div>
          {plan.priceAnnualCents != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              or {formatBillingPrice(plan.priceAnnualCents, plan.currency)}/yr
            </p>
          )}

          {includedFeatures.length > 0 && (
            <ul className="mt-5 space-y-1.5 border-t pt-5 text-sm text-muted-foreground">
              {includedFeatures.map((label) => (
                <li key={label} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">
                    ✓
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t pt-6">
            <PlanSignupForm
              planSlug={planSlug}
              hasAnnual={plan.priceAnnualCents != null}
              priceMonthlyCents={plan.priceMonthlyCents}
              priceAnnualCents={plan.priceAnnualCents}
              currency={plan.currency}
            />
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          Questions before you sign up? Contact {brand.supportEmail}.
        </p>
      </div>
    </div>
  );
}
