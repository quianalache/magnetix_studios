"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, CreditCard, Loader2, Mail, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { StatusPill, Tag } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { BillingStatusBadge } from "@/components/agency/billing-status-badge";
import {
  effectiveBillingState,
  formatBillingPrice,
  formatBillingPriceWithInterval,
} from "@/lib/billing/status";
import type { SubAccountDoc } from "@/types";
import type {
  BillingChargeResponse,
  BillingInterval,
  BillingPlanResponse,
} from "@/types/billing";

/**
 * Billing controls inside the agency Manage dialog (Client Billing v1).
 * Assign/switch a plan (with optional per-client special price), send or
 * copy the checkout link, or mark the client comped. Owner-only by
 * placement — the dialog itself only renders for the agency owner.
 */

interface Props {
  subAccount: SubAccountDoc;
  disabled?: boolean;
}

export function SubAccountBillingSection({ subAccount, disabled }: Props) {
  const billing = subAccount.billing ?? null;
  const state = effectiveBillingState(billing);
  const { confirm, dialog } = useConfirm();

  const [plans, setPlans] = useState<BillingPlanResponse[] | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(true);
  const [planId, setPlanId] = useState("");
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [specialPrice, setSpecialPrice] = useState("");
  const [emailTo, setEmailTo] = useState(
    subAccount.accountContact?.email ?? "",
  );
  const [busy, setBusy] = useState<null | "assign" | "link" | "email" | "comp">(
    null,
  );
  const [lastLink, setLastLink] = useState<string | null>(null);

  // One-time charges (e.g. "Web design — $500"). Independent of plans.
  const [charges, setCharges] = useState<BillingChargeResponse[] | null>(null);
  const [chargeDesc, setChargeDesc] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeBusy, setChargeBusy] = useState<
    null | "create" | "createEmail" | string
  >(null);

  const loadCharges = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agency/sub-accounts/${subAccount.id}/billing/charges`,
      );
      const data = (await res.json().catch(() => ({}))) as {
        charges?: BillingChargeResponse[];
      };
      setCharges(data.charges ?? []);
    } catch {
      setCharges([]);
    }
  }, [subAccount.id]);

  useEffect(() => {
    void loadCharges();
  }, [loadCharges]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/agency/plans")
      .then((r) => r.json())
      .then(
        (d: { plans?: BillingPlanResponse[]; stripeConfigured?: boolean }) => {
          if (cancelled) return;
          setPlans(d.plans ?? []);
          setStripeConfigured(d.stripeConfigured !== false);
        },
      )
      .catch(() => {
        if (!cancelled) setPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPlanId(billing?.planId ?? "");
    setInterval(billing?.billingInterval === "year" ? "year" : "month");
    setSpecialPrice(
      billing?.specialPriceCents != null
        ? (billing.specialPriceCents / 100).toFixed(2).replace(/\.00$/, "")
        : "",
    );
    setLastLink(null);
    // Reset when the dialog re-targets another sub-account.
  }, [
    subAccount.id,
    billing?.planId,
    billing?.specialPriceCents,
    billing?.billingInterval,
  ]);

  const activePlans = useMemo(
    () => (plans ?? []).filter((p) => p.status === "active"),
    [plans],
  );

  const selectedPlan = useMemo(
    () => activePlans.find((p) => p.id === planId) ?? null,
    [activePlans, planId],
  );
  const planHasAnnual = selectedPlan?.priceAnnualCents != null;

  // If the chosen plan doesn't offer annual, force the cadence back to monthly.
  useEffect(() => {
    if (!planHasAnnual && interval === "year") setInterval("month");
  }, [planHasAnnual, interval]);

  const specialPriceCents = useMemo(() => {
    const trimmed = specialPrice.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
  }, [specialPrice]);

  const hasLiveSubscription = state === "active" || state === "grace";
  const anyBusy = busy !== null || disabled;

  // Charge currency: follow the client's existing billing currency, else the
  // first active plan's, else USD. Shown as a static prefix on the input.
  const chargeCurrency =
    billing?.currency ?? activePlans[0]?.currency ?? "usd";
  const chargeAmountCents = useMemo(() => {
    const parsed = Number.parseFloat(chargeAmount.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.round(parsed * 100);
  }, [chargeAmount]);

  async function patchBilling(body: Record<string, unknown>) {
    const res = await fetch(
      `/api/agency/sub-accounts/${subAccount.id}/billing`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      checkoutUrl?: string | null;
      emailed?: boolean;
      status?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Billing update failed.");
    return data;
  }

  async function handleAssign() {
    if (!planId) return;
    setBusy("assign");
    try {
      const data = await patchBilling({
        action: "assign",
        planId,
        interval,
        specialPriceCents,
        ...(emailTo.trim() ? { emailTo: emailTo.trim() } : {}),
      });
      if (data.status === "pending" && data.checkoutUrl) {
        setLastLink(data.checkoutUrl);
        toast.success(
          data.emailed
            ? "Plan assigned — checkout link emailed to the client."
            : "Plan assigned — copy the checkout link below or email it.",
        );
      } else {
        toast.success(
          "Plan switched — the live subscription and features were updated.",
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign.");
    } finally {
      setBusy(null);
    }
  }

  async function handleLink(sendEmail: boolean) {
    setBusy(sendEmail ? "email" : "link");
    try {
      const data = await patchBilling({
        action: "sendLink",
        ...(sendEmail && emailTo.trim() ? { emailTo: emailTo.trim() } : {}),
      });
      if (data.checkoutUrl) {
        setLastLink(data.checkoutUrl);
        if (!sendEmail) {
          await navigator.clipboard
            .writeText(data.checkoutUrl)
            .catch(() => undefined);
          toast.success(
            "Fresh checkout link copied. Older links no longer work.",
          );
        } else {
          toast.success(
            data.emailed
              ? "Checkout link emailed to the client."
              : "Link minted, but email isn't configured — copy it instead.",
          );
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mint a link.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateCharge(sendEmail: boolean) {
    if (!chargeDesc.trim() || chargeAmountCents === null) return;
    setChargeBusy(sendEmail ? "createEmail" : "create");
    try {
      const res = await fetch(
        `/api/agency/sub-accounts/${subAccount.id}/billing/charges`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: chargeDesc.trim(),
            amountCents: chargeAmountCents,
            currency: chargeCurrency,
            ...(sendEmail && emailTo.trim() ? { emailTo: emailTo.trim() } : {}),
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        checkoutUrl?: string;
        emailed?: boolean;
      };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? "Failed to create the charge.");
      }
      setChargeDesc("");
      setChargeAmount("");
      setLastLink(data.checkoutUrl);
      if (!sendEmail) {
        await navigator.clipboard
          .writeText(data.checkoutUrl)
          .catch(() => undefined);
        toast.success("Charge created — payment link copied.");
      } else {
        toast.success(
          data.emailed
            ? "Charge created — payment link emailed to the client."
            : "Charge created, but email isn't configured — copy the link instead.",
        );
      }
      void loadCharges();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create the charge.",
      );
    } finally {
      setChargeBusy(null);
    }
  }

  async function handleCopyChargeLink(chargeId: string) {
    setChargeBusy(chargeId);
    try {
      const res = await fetch(
        `/api/agency/sub-accounts/${subAccount.id}/billing/charges/${chargeId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sendLink" }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        checkoutUrl?: string;
      };
      if (!res.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? "Failed to mint a link.");
      }
      await navigator.clipboard
        .writeText(data.checkoutUrl)
        .catch(() => undefined);
      toast.success("Fresh payment link copied. Older links no longer work.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mint a link.");
    } finally {
      setChargeBusy(null);
    }
  }

  async function handleCancelCharge(chargeId: string) {
    if (
      !(await confirm({
        title: "Cancel this charge?",
        description: "Its payment link stops working immediately.",
        confirmLabel: "Cancel charge",
        cancelLabel: "Keep charge",
        tone: "danger",
      }))
    ) {
      return;
    }
    setChargeBusy(chargeId);
    try {
      const res = await fetch(
        `/api/agency/sub-accounts/${subAccount.id}/billing/charges/${chargeId}`,
        { method: "DELETE" },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel.");
      toast.success("Charge canceled.");
      void loadCharges();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel.");
    } finally {
      setChargeBusy(null);
    }
  }

  async function handleComp() {
    if (
      !(await confirm({
        title: "Mark this client comped?",
        description: hasLiveSubscription
          ? "Their Stripe subscription is canceled immediately and no further charges occur."
          : "They won't be billed through the platform.",
        confirmLabel: "Mark comped",
        tone: hasLiveSubscription ? "danger" : "default",
      }))
    ) {
      return;
    }
    setBusy("comp");
    try {
      await patchBilling({ action: "comp" });
      setLastLink(null);
      toast.success("Marked comped — billing stopped, features stay manual.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to comp.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-sunken px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-foreground">
          <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
          Billing
          {/* Same Beta tag as the beta feature gates below. */}
          <Tag color="pink">Beta</Tag>
          <BillingStatusBadge billing={billing} />
        </div>
        {billing && billing.status !== "comped" && (
          <span className="text-caption text-muted-foreground">
            {billing.planName ?? "—"} ·{" "}
            {formatBillingPriceWithInterval(
              billing.priceCents,
              billing.currency,
              billing.billingInterval,
            )}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        {!stripeConfigured ? (
          <p className="text-caption font-medium text-status-warning-fg">
            Stripe isn&apos;t configured on this deployment — set{" "}
            <code>STRIPE_SECRET_KEY</code> to bill clients.
          </p>
        ) : plans === null ? (
          <Skeleton className="h-9 w-full" />
        ) : activePlans.length === 0 ? (
          <p className="text-caption text-muted-foreground">
            No plans yet — create one under{" "}
            <span className="font-medium text-foreground">Agency → Billing</span>{" "}
            first.
          </p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                disabled={anyBusy}
                aria-label="Plan"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-body disabled:opacity-60"
              >
                <option value="">Choose a plan…</option>
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatBillingPrice(p.priceMonthlyCents, p.currency)}
                    /mo
                    {p.priceAnnualCents != null
                      ? ` or ${formatBillingPrice(p.priceAnnualCents, p.currency)}/yr`
                      : ""}
                  </option>
                ))}
              </select>
              <Input
                value={specialPrice}
                onChange={(e) => setSpecialPrice(e.target.value)}
                placeholder="Special price"
                aria-label="Special price (optional)"
                inputMode="decimal"
                disabled={anyBusy}
                title={`Optional per-client ${
                  interval === "year" ? "annual" : "monthly"
                } price override (in the plan's currency)`}
              />
            </div>

            {/* Cadence chooser — only when the selected plan offers annual. */}
            {planHasAnnual && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption font-medium text-muted-foreground">Billing cadence</span>
                <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1">
                  {(["month", "year"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={interval === opt}
                      onClick={() => setInterval(opt)}
                      disabled={anyBusy}
                      className={cn(
                        "h-7 shrink-0 rounded-lg px-3 text-caption font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                        interval === opt
                          ? "bg-accent font-semibold text-accent-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {opt === "month"
                        ? `Monthly · ${formatBillingPrice(selectedPlan?.priceMonthlyCents ?? null, selectedPlan?.currency ?? null)}`
                        : `Annual · ${formatBillingPrice(selectedPlan?.priceAnnualCents ?? null, selectedPlan?.currency ?? null)}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleAssign}
                disabled={anyBusy || !planId}
              >
                {busy === "assign" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Assigning…
                  </>
                ) : hasLiveSubscription && billing?.planId !== planId ? (
                  "Switch plan"
                ) : (
                  "Assign plan"
                )}
              </Button>
              {billing && billing.status !== "comped" && !hasLiveSubscription && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleLink(false)}
                    disabled={anyBusy}
                  >
                    {busy === "link" ? <Loader2 className="animate-spin" /> : <Copy />}
                    Copy link
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleLink(true)}
                    disabled={anyBusy || !emailTo.trim()}
                  >
                    {busy === "email" ? <Loader2 className="animate-spin" /> : <Mail />}
                    Email link
                  </Button>
                </>
              )}
              {billing && billing.status !== "comped" && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={handleComp}
                  disabled={anyBusy}
                >
                  {busy === "comp" ? <Loader2 className="animate-spin" /> : null}
                  Mark comped
                </Button>
              )}
            </div>

            <div>
              <label htmlFor={`billing-email-${subAccount.id}`} className="mb-1 block text-caption font-medium text-muted-foreground">
                Client email for payment links (optional)
              </label>
              <Input
                id={`billing-email-${subAccount.id}`}
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="client@business.com"
                type="email"
                disabled={anyBusy}
              />
            </div>

            {lastLink && (
              <div className="rounded-lg border border-border bg-surface-sunken px-3 py-2">
                <p className="mb-1 text-caption font-medium text-muted-foreground">
                  Checkout link (latest — older links no longer work)
                </p>
                <div className="flex min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-caption text-foreground">{lastLink}</code>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Copy checkout link"
                    title="Copy link"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(lastLink)
                        .then(() => toast.success("Copied."))
                        .catch(() => toast.error("Couldn't copy — select it manually."));
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              </div>
            )}

            <p className="text-caption leading-relaxed text-muted-foreground">
              {hasLiveSubscription
                ? "This client has a live subscription — switching plans updates the charge (prorated) and re-applies the plan's features immediately. Card changes happen via “Manage billing” inside their workspace settings."
                : state === "pending"
                  ? "Awaiting payment: the workspace shows an activation screen to the client until checkout completes. The plan's features switch on automatically at payment."
                  : state === "lapsed"
                    ? "Payment lapsed: the workspace is behind a paywall. A fresh checkout link (or the in-app Pay button) reactivates it."
                    : "Assigning a plan puts this workspace behind an activation screen until the client pays. Use “Mark comped” for internal or off-platform-billed clients."}
            </p>

            {/* ── One-time charges (independent of the plan; works for comped
                clients too — e.g. a "Web design" fee) ─────────────────── */}
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 flex flex-wrap items-center gap-1.5 text-body-sm font-semibold text-foreground">
                <Receipt className="size-4 text-muted-foreground" aria-hidden="true" />
                One-time charge
                <span className="text-caption font-normal text-muted-foreground">
                  — bill this client once, e.g. “Web design”
                </span>
              </p>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                <Input
                  value={chargeDesc}
                  onChange={(e) => setChargeDesc(e.target.value)}
                  placeholder="What for (client sees this at checkout)"
                  aria-label="Charge description"
                  maxLength={120}
                  disabled={anyBusy || chargeBusy !== null}
                />
                <Input
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  placeholder={`Amount (${chargeCurrency.toUpperCase()})`}
                  aria-label="Charge amount"
                  inputMode="decimal"
                  disabled={anyBusy || chargeBusy !== null}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleCreateCharge(false)}
                  disabled={
                    anyBusy ||
                    chargeBusy !== null ||
                    !chargeDesc.trim() ||
                    chargeAmountCents === null
                  }
                >
                  {chargeBusy === "create" ? <Loader2 className="animate-spin" /> : <Copy />}
                  Create &amp; copy link
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleCreateCharge(true)}
                  disabled={
                    anyBusy ||
                    chargeBusy !== null ||
                    !chargeDesc.trim() ||
                    chargeAmountCents === null ||
                    !emailTo.trim()
                  }
                  title={
                    emailTo.trim()
                      ? undefined
                      : "Enter the client email above first"
                  }
                >
                  {chargeBusy === "createEmail" ? <Loader2 className="animate-spin" /> : <Mail />}
                  Create &amp; email
                </Button>
              </div>

              {charges && charges.length > 0 && (
                <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
                  {charges.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 py-2 text-body-sm">
                      <StatusPill
                        tone={c.status === "paid" ? "success" : c.status === "canceled" ? "neutral" : "warning"}
                        className="capitalize"
                      >
                        {c.status}
                      </StatusPill>
                      <span className={cn("min-w-0 flex-1 truncate", c.status === "canceled" && "text-muted-foreground line-through")}>
                        {c.description}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatBillingPrice(c.amountCents, c.currency)}
                      </span>
                      {c.status === "pending" && (
                        <span className="flex shrink-0 items-center">
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => handleCopyChargeLink(c.id)}
                            disabled={chargeBusy !== null}
                            title="Copy a fresh payment link"
                            aria-label={`Copy a fresh payment link for ${c.description}`}
                          >
                            {chargeBusy === c.id ? <Loader2 className="animate-spin" /> : <Copy />}
                          </Button>
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => handleCancelCharge(c.id)}
                            disabled={chargeBusy !== null}
                            title="Cancel this charge"
                            aria-label={`Cancel the charge for ${c.description}`}
                            className="hover:text-destructive"
                          >
                            <X />
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
