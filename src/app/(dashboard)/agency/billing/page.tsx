"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Copy, CreditCard, Globe2, Loader2, Pencil, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/system/confirm-dialog";
import { cn } from "@/lib/utils";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SectionHeader } from "@/components/system/section-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill, Tag } from "@/components/system/status-pill";
import {
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_ROW,
  DATA_TABLE_TD,
  DATA_TABLE_TH,
  DataTableShell,
} from "@/components/system/data-table";
import { PlanEditorDialog } from "@/components/agency/plan-editor-dialog";
import { BillingStatusBadge } from "@/components/agency/billing-status-badge";
import { SubAccountManageDialog } from "@/components/agency/sub-account-manage-dialog";
import {
  effectiveBillingState,
  formatBillingPrice,
  formatBillingPriceWithInterval,
  monthlyEquivalentCents,
} from "@/lib/billing/status";
import {
  PLAN_GATE_KEYS,
  type BillingPlanResponse,
} from "@/types/billing";
import type { SubAccountDoc } from "@/types";

/**
 * Agency → Client billing (Client Billing v1). Two halves:
 *   1. Plans — the agency's priced feature bundles (create/edit/archive).
 *   2. Clients — every sub-account with its plan + live billing state and
 *      the MRR roll-up. Manage opens the same dialog as the Sub-accounts
 *      page (Billing tab included).
 *
 * Owner-only: the API routes reject non-owners; the page renders a notice.
 */

export default function AgencyBillingPage() {
  const { agencyId, agencyRole, loading: authLoading } = useAuth();
  const { confirm, dialog } = useConfirm();
  const isOwner = agencyRole === "owner";

  const [plans, setPlans] = useState<BillingPlanResponse[] | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [subs, setSubs] = useState<SubAccountDoc[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<BillingPlanResponse | null>(
    null,
  );
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = subs.find((s) => s.id === managingId) ?? null;
  // Public Magnetix SaaS Signup — per-plan toggle busy state, keyed by
  // planId so multiple cards can't stomp on each other's request.
  const [togglingPlanId, setTogglingPlanId] = useState<string | null>(null);

  const refreshPlans = useCallback(() => {
    void fetch("/api/agency/plans")
      .then((r) => r.json())
      .then(
        (d: { plans?: BillingPlanResponse[]; stripeConfigured?: boolean }) => {
          setPlans(d.plans ?? []);
          setStripeConfigured(d.stripeConfigured !== false);
        },
      )
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (isOwner) refreshPlans();
  }, [isOwner, refreshPlans]);

  useEffect(() => {
    if (!agencyId || !isOwner) {
      setSubs([]);
      setSubsLoading(false);
      return;
    }
    const q = query(
      collection(getFirebaseDb(), "subAccounts"),
      where("agencyId", "==", agencyId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SubAccountDoc);
        list.sort(
          (a, b) =>
            (a.accountNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.accountNumber ?? Number.MAX_SAFE_INTEGER),
        );
        setSubs(list);
        setSubsLoading(false);
      },
      (err) => {
        console.error("[agency/billing] listen failed", err);
        setSubsLoading(false);
      },
    );
    return () => unsub();
  }, [agencyId, isOwner]);

  // MRR roll-up per currency (a deployment can mix e.g. usd + aud plans).
  // Annual subscriptions are normalized to their monthly-equivalent (/12) so
  // the roll-up stays a true MONTHLY recurring figure.
  const mrr = useMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const s of subs) {
      const state = effectiveBillingState(s.billing);
      if (state !== "active" && state !== "grace") continue;
      const currency = s.billing?.currency;
      if (typeof s.billing?.priceCents !== "number" || !currency) continue;
      const cents = monthlyEquivalentCents(
        s.billing.priceCents,
        s.billing.billingInterval,
      );
      byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + cents);
    }
    return [...byCurrency.entries()]
      .map(([currency, cents]) => formatBillingPrice(cents, currency))
      .join(" + ");
  }, [subs]);

  async function handleArchive(plan: BillingPlanResponse) {
    if (
      !(await confirm({
        title: `Archive “${plan.name}”?`,
        description: "Clients already on it keep their subscription; it just can't be assigned anymore.",
        confirmLabel: "Archive plan",
      }))
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/agency/plans/${plan.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to archive.");
      toast.success(`Archived ${plan.name}.`);
      refreshPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive.");
    }
  }

  // Reactivates an archived plan's current Stripe price(s) and flips it back
  // to active. If Stripe reactivation fails, the API call fails outright
  // (the plan stays archived) rather than showing a false "active" state.
  async function handleUnarchive(plan: BillingPlanResponse) {
    try {
      const res = await fetch(`/api/agency/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to unarchive.");
      toast.success(`${plan.name} is active again.`);
      refreshPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unarchive.");
    }
  }

  // Public Magnetix SaaS Signup — enable/disable self-serve purchase for one
  // plan. The API generates (and keeps stable) the plan's publicSlug on
  // first enable; refreshPlans() picks up the resulting publicSaleUrl.
  async function handleTogglePublic(plan: BillingPlanResponse) {
    setTogglingPlanId(plan.id);
    try {
      const res = await fetch(`/api/agency/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publiclyPurchasable: !plan.publiclyPurchasable }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update.");
      toast.success(
        plan.publiclyPurchasable
          ? `${plan.name} is no longer available for public signup.`
          : `${plan.name} is now available for public signup.`,
      );
      refreshPlans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setTogglingPlanId(null);
    }
  }

  async function handleCopySaleLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Sale link copied.");
    } catch {
      toast.error("Couldn't copy — select the link manually.");
    }
  }

  if (authLoading) {
    return <PageShellLoading width="data" />;
  }

  if (!isOwner) {
    return (
      <PageShell width="data">
        <EmptyState
          icon={CreditCard}
          title="Owner only"
          description="Billing is managed by the agency owner."
        />
      </PageShell>
    );
  }

  // Active plans first, archived last — presentation only.
  const orderedPlans = plans
    ? [...plans].sort((a, b) => Number(a.status === "archived") - Number(b.status === "archived"))
    : null;

  return (
    <PageShell width="data">
      {dialog}
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Billing
            {/* Same Beta tag as the beta feature gates in the Manage dialog. */}
            <Tag color="pink">Beta</Tag>
          </span>
        }
        description="Package features into plans and charge your clients through your own Stripe account. Applies to every client workspace you assign a plan to."
        actions={
          <Button
            onClick={() => {
              setEditingPlan(null);
              setEditorOpen(true);
            }}
            disabled={!stripeConfigured}
          >
            <Plus />
            New plan
          </Button>
        }
      />

      {!stripeConfigured && (
        <Alert tone="warning" title="Stripe isn't configured on this deployment">
          Set <code>STRIPE_SECRET_KEY</code> (and the webhook secret) to create plans and charge clients — payments
          land in <em>your</em> Stripe account.
        </Alert>
      )}

      {/* Plans */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Plans" description="Priced feature bundles. Editing a plan's features re-applies them to every client on it." />
        {orderedPlans === null ? (
          <Skeleton className="h-40 w-full rounded-card" />
        ) : orderedPlans.length === 0 ? (
          <EmptyState
            compact
            icon={CreditCard}
            title="No plans yet"
            description="Create your first plan — e.g. Starter or Pro — then assign it to a client from the table below."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orderedPlans.map((plan) => {
              const gateCount = PLAN_GATE_KEYS.filter((k) => plan.gates[k]).length;
              const clientCount = subs.filter(
                (s) => s.billing?.planId === plan.id && effectiveBillingState(s.billing) !== "comped",
              ).length;
              const archived = plan.status === "archived";
              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card",
                    archived && "bg-surface-sunken shadow-none",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={cn("line-clamp-2 text-section font-semibold", archived ? "text-muted-foreground" : "text-foreground")}>
                        {plan.name}
                      </p>
                      <p className={cn("mt-1 text-title-md font-semibold tracking-tight tabular-nums", archived ? "text-muted-foreground" : "text-foreground")}>
                        {formatBillingPrice(plan.priceMonthlyCents, plan.currency)}
                        <span className="text-caption font-normal text-muted-foreground">/mo</span>
                      </p>
                      {plan.priceAnnualCents != null && (
                        <p className="text-caption text-muted-foreground">
                          or {formatBillingPrice(plan.priceAnnualCents, plan.currency)}/yr
                        </p>
                      )}
                    </div>
                    {archived && <StatusPill tone="neutral">Archived</StatusPill>}
                  </div>
                  {plan.description && <p className="line-clamp-2 text-caption text-muted-foreground">{plan.description}</p>}
                  <p className="text-caption text-muted-foreground">
                    {gateCount} feature{gateCount === 1 ? "" : "s"} · {clientCount} client{clientCount === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingPlan(plan);
                        setEditorOpen(true);
                      }}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    {plan.status === "active" ? (
                      <Button type="button" size="sm" variant="ghost" className="text-muted-foreground" onClick={() => handleArchive(plan)}>
                        <Archive />
                        Archive
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => handleUnarchive(plan)}>
                        <ArchiveRestore />
                        Unarchive
                      </Button>
                    )}
                  </div>

                  {/* Public Magnetix SaaS Signup — per-plan opt-in. Never
                      inferred from status === "active"; the owner must
                      explicitly flip this. Archived plans can't be enabled
                      (the checkbox disables itself) but a plan archived
                      AFTER being made public stays public until switched
                      off, matching "Edit"'s own don't-surprise-the-owner
                      behavior elsewhere on this page. */}
                  <div className="mt-auto rounded-lg border border-border bg-surface-sunken p-3">
                    <label className="flex cursor-pointer items-start gap-2.5 text-caption">
                      <input
                        type="checkbox"
                        checked={plan.publiclyPurchasable}
                        onChange={() => handleTogglePublic(plan)}
                        disabled={togglingPlanId === plan.id || (archived && !plan.publiclyPurchasable)}
                        className="mt-0.5 size-3.5 shrink-0 cursor-pointer"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-semibold text-foreground">
                          <Globe2 className="size-3.5" aria-hidden="true" />
                          Public signup
                          {togglingPlanId === plan.id && <Loader2 className="size-3 animate-spin" />}
                        </span>
                        <span className="mt-0.5 block text-muted-foreground">
                          {plan.publiclyPurchasable
                            ? "Anyone with the link below can self-serve purchase this plan."
                            : "Off — this plan is assigned manually only."}
                        </span>
                        {plan.publiclyPurchasable && (
                          <span className="mt-1 block text-micro text-muted-foreground">
                            {plan.priceAnnualCents != null
                              ? "Monthly and annual both available at signup."
                              : "Monthly only — no annual price set on this plan."}
                          </span>
                        )}
                      </span>
                    </label>

                    {plan.publiclyPurchasable && plan.publicSaleUrl && (
                      <div className="mt-2 flex min-w-0 items-center gap-1.5 border-t border-border-subtle pt-2">
                        <code className="min-w-0 flex-1 truncate text-micro text-foreground">{plan.publicSaleUrl}</code>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Copy the ${plan.name} sale link`}
                          title="Copy link"
                          onClick={() => handleCopySaleLink(plan.publicSaleUrl!)}
                        >
                          <Copy />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Clients */}
      <section className="flex flex-col gap-3">
        <SectionHeader
          title="Clients"
          description="Every sub-account with its plan and live billing state."
          action={
            mrr ? (
              <p className="text-body-sm whitespace-nowrap text-muted-foreground">
                MRR <span className="font-semibold text-foreground tabular-nums">{mrr}</span>
              </p>
            ) : null
          }
        />
        <DataTableShell
          minWidth="44rem"
          footer={
            <p className="text-caption text-muted-foreground">
              &quot;Comped&quot; clients aren&apos;t billed through the platform — every workspace starts comped until
              you assign a plan. Payments, invoices, and payout timing live in your{" "}
              <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="font-medium text-link hover:underline">
                Stripe dashboard
              </a>
              .
            </p>
          }
        >
          <thead>
            <tr className={DATA_TABLE_HEAD_ROW}>
              <th className={`${DATA_TABLE_TH} w-20`}>#</th>
              <th className={DATA_TABLE_TH}>Client</th>
              <th className={DATA_TABLE_TH}>Plan</th>
              <th className={DATA_TABLE_TH}>Billing</th>
              <th className={`${DATA_TABLE_TH} text-right`}>Price</th>
              <th className={DATA_TABLE_TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {subsLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6">
                  <Skeleton className="h-8 w-full" />
                </td>
              </tr>
            ) : subs.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    compact
                    icon={CreditCard}
                    title="No sub-accounts yet"
                    action={
                      <Button size="sm" variant="outline" render={<Link href="/agency/sub-accounts/new" />}>
                        Create one
                      </Button>
                    }
                  />
                </td>
              </tr>
            ) : (
              subs.map((s) => {
                const billing = s.billing ?? null;
                const billed = billing && billing.status !== "comped";
                return (
                  <tr key={s.id} className={DATA_TABLE_ROW}>
                    <td className={`${DATA_TABLE_TD} font-mono text-caption text-muted-foreground`}>
                      {s.accountNumber !== undefined ? `#${s.accountNumber}` : "—"}
                    </td>
                    <td className={`${DATA_TABLE_TD} max-w-64 font-medium text-foreground`}>
                      <span className="line-clamp-2">{s.name}</span>
                    </td>
                    <td className={`${DATA_TABLE_TD} max-w-56 text-muted-foreground`}>
                      <span className="line-clamp-2">{billed ? (billing.planName ?? "—") : "—"}</span>
                    </td>
                    <td className={DATA_TABLE_TD}>
                      <BillingStatusBadge billing={billing} />
                    </td>
                    <td className={`${DATA_TABLE_TD} text-right whitespace-nowrap tabular-nums`}>
                      {billed
                        ? formatBillingPriceWithInterval(billing.priceCents, billing.currency, billing.billingInterval)
                        : "—"}
                    </td>
                    <td className={`${DATA_TABLE_TD} text-right`}>
                      <Button type="button" size="sm" variant="outline" onClick={() => setManagingId(s.id)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </DataTableShell>
      </section>

      <PlanEditorDialog plan={editingPlan} open={editorOpen} onOpenChange={setEditorOpen} onSaved={refreshPlans} />

      <SubAccountManageDialog
        subAccount={managing}
        open={!!managingId}
        onOpenChange={(open) => {
          if (!open) setManagingId(null);
        }}
      />
    </PageShell>
  );
}
