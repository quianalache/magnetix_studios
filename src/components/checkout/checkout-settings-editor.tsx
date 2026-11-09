"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  CreditCard,
  Eye,
  FileText,
  Globe,
  Layers,
  ListChecks,
  Loader2,
  Lock,
  Monitor,
  Plus,
  Route,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Tag as TagIcon,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { OptionSelect } from "@/components/system/option-select";
import { StatusPill } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { CheckoutRenderer } from "@/components/checkout/checkout-renderer";
import { computeOrderTotals, lineFromOffer } from "@/lib/checkout/pricing";
import { MAX_ORDER_BUMPS } from "@/lib/checkout/config";
import { cn } from "@/lib/utils";
import type { CheckoutView } from "@/lib/checkout/view-types";
import type { CheckoutBump, CheckoutConfig, FunnelStep, PostPurchaseDestination } from "@/types/checkout";

/**
 * Checkout Settings editor — shared by the Funnel Checkout Step screen and
 * the Offer's Hosted Checkout screen (Checkout Foundation Phase 1). The
 * Offer stays the source of truth for price/billing/entitlements: this
 * editor never edits a price. Every control here is wired; things that
 * aren't available yet are shown disabled with the reason.
 */

export interface OfferOptionDTO {
  id: string;
  title: string;
  type: "free" | "oneTime" | "recurring";
  priceCents: number | null;
  currency: string;
  recurringInterval: "day" | "week" | "month" | "year" | null;
  trialDays: number;
  visibility: "draft" | "published" | "archived";
  systemManaged: boolean;
  thumbnailUrl: string | null;
  priceLabel: string;
  billingNote: string | null;
  entitlements: string[];
  primaryProblem: string | null;
}

export interface EditorPayload {
  config: CheckoutConfig;
  offers: OfferOptionDTO[];
  bumpStatus: Record<string, string | null>;
  steps?: FunnelStep[];
  pages?: Array<{ id: string; name: string; status: string }>;
  saved?: boolean;
  offer?: { id: string; title: string; slug: string | null; visibility: string; systemManaged: boolean; classicCollectAddress: boolean };
}

type Draft = Omit<CheckoutConfig, "id" | "agencyId" | "subAccountId" | "context" | "version" | "createdAt" | "updatedAt" | "updatedByUid"> & {
  classicCollectAddress?: boolean;
};

const TABS = [
  { key: "general", label: "General", icon: Settings2 },
  { key: "checkout", label: "Checkout", icon: ShoppingCart },
  { key: "bumps", label: "Order Bumps", icon: Layers },
  { key: "coupons", label: "Coupons", icon: TagIcon },
  { key: "advanced", label: "Advanced", icon: ListChecks },
] as const;

function draftFrom(p: EditorPayload): Draft {
  const c = p.config;
  return {
    primaryOfferId: c.primaryOfferId,
    enabled: c.enabled,
    format: c.format,
    nameFormat: c.nameFormat,
    phone: c.phone,
    billingAddress: c.billingAddress,
    agreement: c.agreement,
    couponsEnabled: c.couponsEnabled,
    bumps: c.bumps,
    display: c.display,
    postPurchase: c.postPurchase,
    internalNotes: c.internalNotes,
    classicCollectAddress: p.offer?.classicCollectAddress ?? false,
  };
}

const isBumpable = (o: OfferOptionDTO, primaryId: string | null) =>
  o.id !== primaryId && !o.systemManaged && o.visibility === "published" && o.type === "oneTime" && (o.priceCents ?? 0) > 0;

export function CheckoutSettingsEditor({
  kind,
  subAccountId,
  payload: initial,
  onSave,
  publicUrl,
  toolbarStart,
}: {
  kind: "funnel_step" | "hosted_offer";
  subAccountId: string;
  payload: EditorPayload;
  onSave: (body: Record<string, unknown>) => Promise<EditorPayload>;
  publicUrl: string | null;
  toolbarStart?: React.ReactNode;
}) {
  const [payload, setPayload] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(initial));
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [openBump, setOpenBump] = useState<string | null>(null);
  const [addBumpOffer, setAddBumpOffer] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const baseline = useMemo(() => JSON.stringify(draftFrom(payload)), [payload]);
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const offersById = useMemo(() => new Map(payload.offers.map((o) => [o.id, o])), [payload.offers]);
  const primary = draft.primaryOfferId ? offersById.get(draft.primaryOfferId) ?? null : null;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setDisplay = (patch: Partial<Draft["display"]>) => setDraft((d) => ({ ...d, display: { ...d.display, ...patch } }));
  const setBump = (id: string, patch: Partial<CheckoutBump>) => setDraft((d) => ({ ...d, bumps: d.bumps.map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

  async function save() {
    setSaving(true);
    setFieldErrors({});
    try {
      const next = await onSave(draft as unknown as Record<string, unknown>);
      setPayload((p) => ({ ...p, ...next }));
      setDraft(draftFrom({ ...payload, ...next }));
      toast.success("Checkout settings saved.");
    } catch (err) {
      const e = err as Error & { fields?: Record<string, string> };
      setFieldErrors(e.fields ?? {});
      toast.error(e.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  function addBump() {
    if (!addBumpOffer) return;
    const offer = offersById.get(addBumpOffer);
    const id = `new_${Math.random().toString(36).slice(2, 10)}`;
    setDraft((d) => ({
      ...d,
      bumps: [...d.bumps, { id, offerId: addBumpOffer, enabled: true, headline: offer?.title ?? "", description: "", imageUrl: "", badge: "", checkboxLabel: "" }],
    }));
    setAddBumpOffer(null);
    setOpenBump(id);
  }
  function moveBump(index: number, delta: number) {
    setDraft((d) => {
      const next = [...d.bumps];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return { ...d, bumps: next };
    });
  }
  async function removeBump(b: CheckoutBump) {
    const ok = await confirm({ title: "Remove this Order Bump?", description: "Buyers won't see it on this checkout after you save. The Offer itself isn't changed.", confirmLabel: "Remove", tone: "danger" });
    if (ok) setDraft((d) => ({ ...d, bumps: d.bumps.filter((x) => x.id !== b.id) }));
  }

  const bumpOptions = payload.offers
    .filter((o) => isBumpable(o, draft.primaryOfferId) && !draft.bumps.some((b) => b.offerId === o.id) && (!primary || o.currency === primary.currency))
    .map((o) => ({ value: o.id, label: `${o.title} · ${o.priceLabel}` }));
  const primaryOptions = payload.offers
    .filter((o) => !o.primaryProblem)
    .map((o) => ({ value: o.id, label: `${o.title} · ${o.priceLabel}${o.visibility !== "published" ? " (draft)" : ""}` }));

  const previewView: CheckoutView | null = useMemo(() => {
    if (!primary) return null;
    const visibleBumps = draft.bumps.filter((b) => b.enabled && offersById.has(b.offerId) && isBumpable(offersById.get(b.offerId)!, draft.primaryOfferId));
    return {
      configId: payload.config.id,
      subAccountId,
      brand: { name: "", logoUrl: null, primary: null },
      format: draft.format,
      nameFormat: draft.nameFormat,
      phone: draft.phone,
      billingAddress: draft.billingAddress,
      agreement: draft.agreement,
      couponsEnabled: draft.couponsEnabled,
      display: draft.display,
      primary: { offerId: primary.id, title: primary.title, description: "", thumbnailUrl: primary.thumbnailUrl, priceLabel: primary.priceLabel, billingNote: primary.billingNote, entitlements: primary.entitlements },
      bumps: visibleBumps.map((b) => {
        const o = offersById.get(b.offerId)!;
        return { bumpId: b.id, offerId: o.id, headline: b.headline || o.title, description: b.description, imageUrl: b.imageUrl || o.thumbnailUrl, badge: b.badge, checkboxLabel: b.checkboxLabel || "Yes, add this to my order", priceLabel: o.priceLabel };
      }),
      initialTotals: computeOrderTotals([lineFromOffer({ ...primary }, "primary")]),
      payment: { ready: false, mode: null, message: null, publishableKey: null, stripeAccount: null },
      preview: true,
    };
  }, [draft, primary, offersById, payload.config.id, subAccountId]);

  const previewQuote = async (bumpIds: string[], code: string) => {
    if (!primary) throw new Error("Choose a primary Offer.");
    const lines = [lineFromOffer(primary, "primary")];
    for (const id of bumpIds) {
      const b = draft.bumps.find((x) => x.id === id);
      const o = b && offersById.get(b.offerId);
      if (o) lines.push(lineFromOffer(o, "bump", id));
    }
    return { totals: computeOrderTotals(lines), coupon: code ? { code: code.toUpperCase(), applied: false, message: "Codes are checked on the live checkout, not in preview." } : null };
  };

  const scrollTo = (key: string) => document.getElementById(`cs-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const destinationOptions: { value: PostPurchaseDestination["type"]; label: string }[] =
    kind === "funnel_step"
      ? [
          { value: "funnel_next_step", label: "Next funnel step" },
          { value: "funnel_step", label: "A specific funnel step" },
          { value: "page", label: "A page" },
          { value: "url", label: "A web address" },
          { value: "space", label: "The buyer's Space" },
        ]
      : [
          { value: "space", label: "The buyer's Space (default)" },
          { value: "page", label: "A page" },
          { value: "url", label: "A web address" },
        ];

  return (
    <div className="flex flex-col gap-5">
      {dialog}
      <div className="flex flex-wrap items-center gap-3">
        {toolbarStart}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {dirty && <StatusPill tone="warning">Unsaved changes</StatusPill>}
          {publicUrl && (
            <Button variant="outline" render={<a href={publicUrl} target="_blank" rel="noopener noreferrer" />}>
              <Eye className="size-4" aria-hidden /> Open live checkout
            </Button>
          )}
          <Button onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
        </div>
      </div>

      <nav aria-label="Checkout settings sections" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => scrollTo(t.key)} className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2 text-body-sm font-medium focus-visible:border-primary">
            <t.icon className="size-4" aria-hidden /> {t.label}
          </button>
        ))}
      </nav>

      {Object.keys(fieldErrors).length > 0 && (
        <Alert tone="danger" title="Some settings need attention">
          {Object.values(fieldErrors).filter((v, i, a) => a.indexOf(v) === i).join(" ")}
        </Alert>
      )}

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,400px)]">
        {/* ------------------------------ Column 1 ----------------------------- */}
        <div className="flex min-w-0 flex-col gap-5">
          {kind === "hosted_offer" && (
            <Panel id="general" icon={Globe} title="Hosted checkout" description="Turn on the new checkout for this Offer's public page.">
              <ToggleRow
                id="cs-enabled"
                label={draft.enabled ? "On — the Offer page opens this checkout" : "Off — the Offer page uses the classic enroll form"}
                checked={draft.enabled}
                onChange={(v) => set("enabled", v)}
              />
              {payload.offer && payload.offer.visibility !== "published" && (
                <p className="text-muted-foreground text-caption">This Offer isn&apos;t published, so buyers can&apos;t reach either checkout yet.</p>
              )}
              {publicUrl && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cs-url">Checkout link</Label>
                  <Input id="cs-url" readOnly value={typeof window === "undefined" ? publicUrl : new URL(publicUrl, window.location.origin).toString()} onFocus={(e) => e.currentTarget.select()} />
                </div>
              )}
            </Panel>
          )}

          <Panel id={kind === "hosted_offer" ? "primary" : "general"} icon={Layers} title="Primary Offer" description="The one Offer this checkout sells. Price, billing and what's included come from the Offer.">
            {kind === "funnel_step" && (
              <OptionSelect
                aria-label="Primary Offer"
                value={draft.primaryOfferId}
                onChange={(v) => set("primaryOfferId", v)}
                options={primaryOptions}
                placeholder="Choose an Offer…"
                aria-invalid={!!fieldErrors.primaryOfferId}
              />
            )}
            {primary ? (
              <OfferSummaryCard offer={primary} subAccountId={subAccountId} />
            ) : (
              <p className="text-muted-foreground text-body-sm">Choose the Offer to sell. Bundle several things by adding them to one Offer.</p>
            )}
            {fieldErrors.primaryOfferId && <FieldError text={fieldErrors.primaryOfferId} />}
          </Panel>

          <Panel id="checkout" icon={ShoppingCart} title="Checkout format" description="How the form is presented to buyers.">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Checkout format">
              {[
                { value: "one_step" as const, title: "One-step", text: "Details, order and payment on one page." },
                { value: "two_step" as const, title: "Two-step", text: "Details first, then order and payment." },
              ].map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.format === o.value}
                  onClick={() => set("format", o.value)}
                  className={cn("rounded-xl border p-3 text-left transition-colors", draft.format === o.value ? "border-primary bg-accent/40" : "hover:bg-muted/50")}
                >
                  <span className="block font-semibold text-body-sm">{o.title}</span>
                  <span className="text-muted-foreground block text-caption">{o.text}</span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel icon={UserRound} title="Returning customers" description="Known customers can pay with their email — no sign-in required.">
            <div className="flex items-start justify-between gap-3">
              <p className="text-muted-foreground text-body-sm">
                The purchase is added to their existing account. Typing an email never signs anyone in or changes their details.
              </p>
              <StatusPill tone="success">Always on</StatusPill>
            </div>
          </Panel>

          <Panel id="bumps" icon={Layers} title="Order Bumps" description="Optional one-time add-ons buyers can tick at checkout." badge={`${draft.bumps.length} of ${MAX_ORDER_BUMPS}`}>
            {draft.bumps.length === 0 && <p className="text-muted-foreground text-body-sm">No Order Bumps yet.</p>}
            <ul className="flex flex-col gap-2">
              {draft.bumps.map((b, i) => {
                const o = offersById.get(b.offerId);
                const problem = payload.bumpStatus[b.id] ?? (o && !isBumpable(o, draft.primaryOfferId) ? "This Offer can't be an Order Bump right now." : null);
                const err = fieldErrors[`bumps.${i}`];
                return (
                  <li key={b.id} className={cn("rounded-xl border", err && "border-destructive")}>
                    <div className="flex items-center gap-2 p-2.5">
                      <div className="flex flex-col">
                        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveBump(i, -1)} className="text-muted-foreground hover:text-foreground rounded p-0.5 disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                        <button type="button" aria-label="Move down" disabled={i === draft.bumps.length - 1} onClick={() => moveBump(i, 1)} className="text-muted-foreground hover:text-foreground rounded p-0.5 disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                      </div>
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenBump(openBump === b.id ? null : b.id)} aria-expanded={openBump === b.id}>
                        <span className="block truncate font-semibold text-body-sm">{b.headline || o?.title || "Deleted Offer"}</span>
                        <span className="text-muted-foreground block truncate text-caption">{o ? `${o.title} · ${o.priceLabel}` : "Offer not found"}</span>
                      </button>
                      <Switch checked={b.enabled} onCheckedChange={(v) => setBump(b.id, { enabled: v })} aria-label={`Show ${b.headline || o?.title || "bump"}`} />
                      <button type="button" aria-label="Remove Order Bump" onClick={() => removeBump(b)} className="text-muted-foreground hover:text-destructive rounded p-1"><Trash2 className="size-4" /></button>
                    </div>
                    {(problem || err) && <p className="text-destructive px-3 pb-2 text-caption">{err ?? problem}{problem && b.enabled ? " Turn it off or remove it." : ""}</p>}
                    {openBump === b.id && (
                      <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
                        <TextField id={`bh-${b.id}`} label="Headline" value={b.headline} onChange={(v) => setBump(b.id, { headline: v })} max={120} wide />
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <Label htmlFor={`bd-${b.id}`}>Short description</Label>
                          <Textarea id={`bd-${b.id}`} rows={2} maxLength={400} value={b.description} onChange={(e) => setBump(b.id, { description: e.target.value })} />
                        </div>
                        <TextField id={`bc-${b.id}`} label="Checkbox label" placeholder="Yes, add this to my order" value={b.checkboxLabel} onChange={(v) => setBump(b.id, { checkboxLabel: v })} max={80} />
                        <TextField id={`bb-${b.id}`} label="Badge (optional)" placeholder="Most popular" value={b.badge} onChange={(v) => setBump(b.id, { badge: v })} max={30} />
                        <TextField id={`bi-${b.id}`} label="Image link (optional)" placeholder="https://" value={b.imageUrl} onChange={(v) => setBump(b.id, { imageUrl: v })} max={2000} wide />
                        <p className="text-muted-foreground text-caption sm:col-span-2">Price and what&apos;s included always come from the Offer and can&apos;t be changed here.</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {draft.bumps.length < MAX_ORDER_BUMPS && (
              <div className="flex flex-wrap gap-2">
                <OptionSelect
                  aria-label="Offer to add as an Order Bump"
                  className="min-w-0 flex-1"
                  value={addBumpOffer}
                  onChange={setAddBumpOffer}
                  options={bumpOptions}
                  placeholder={bumpOptions.length ? "Choose a one-time Offer…" : "No eligible one-time Offers"}
                  disabled={!primary || bumpOptions.length === 0}
                />
                <Button variant="outline" onClick={addBump} disabled={!addBumpOffer}>
                  <Plus className="size-4" aria-hidden /> Add Order Bump
                </Button>
              </div>
            )}
            <p className="text-muted-foreground text-caption">Order Bumps must be published, paid, one-time Offers in the same currency. They charge today, even when the main Offer starts with a free trial.</p>
          </Panel>
        </div>

        {/* ------------------------------ Column 2 ----------------------------- */}
        <div className="flex min-w-0 flex-col gap-5">
          <Panel icon={UsersRound} title="Customer fields" description="What buyers are asked for. Stripe collects the billing address with the payment.">
            <FieldRow label="Name">
              <OptionSelect aria-label="Name format" value={draft.nameFormat} onChange={(v) => v && set("nameFormat", v)} options={[{ value: "full", label: "Full name" }, { value: "first_last", label: "First + last name" }]} size="sm" />
            </FieldRow>
            <FieldRow label="Email"><StatusPill tone="info">Required</StatusPill></FieldRow>
            <FieldRow label="Phone">
              <OptionSelect aria-label="Phone" value={draft.phone} onChange={(v) => v && set("phone", v)} options={[{ value: "hidden", label: "Don't ask" }, { value: "optional", label: "Optional" }, { value: "required", label: "Required" }]} size="sm" />
            </FieldRow>
            <FieldRow label="Billing address">
              <OptionSelect aria-label="Billing address" value={draft.billingAddress} onChange={(v) => v && set("billingAddress", v)} options={[{ value: "auto", label: "Only what the card needs" }, { value: "full", label: "Full address (Stripe)" }]} size="sm" />
            </FieldRow>
            <FieldRow label="Shipping address"><span className="text-muted-foreground text-caption">Not collected</span></FieldRow>
            <FieldRow label="Tax collection"><span className="text-muted-foreground text-caption">Not available yet</span></FieldRow>
            <div className="flex flex-col gap-2 border-t pt-3">
              <FieldRow label="Agreement checkbox">
                <OptionSelect
                  aria-label="Agreement"
                  value={draft.agreement.mode}
                  onChange={(v) => v && set("agreement", { ...draft.agreement, mode: v })}
                  options={[{ value: "notRequired", label: "Not shown" }, { value: "required", label: "Standard terms" }, { value: "custom", label: "Custom text" }]}
                  size="sm"
                />
              </FieldRow>
              {draft.agreement.mode === "custom" && (
                <Textarea aria-label="Agreement text" rows={2} maxLength={600} value={draft.agreement.customText} onChange={(e) => set("agreement", { ...draft.agreement, customText: e.target.value })} />
              )}
              {draft.agreement.mode !== "notRequired" && (
                <TextField id="cs-agree-link" label="Terms link (optional)" placeholder="https://" value={draft.agreement.linkUrl} onChange={(v) => set("agreement", { ...draft.agreement, linkUrl: v })} max={2000} wide error={fieldErrors.agreement} />
              )}
            </div>
            {kind === "hosted_offer" && (
              <ToggleRow id="cs-classic-address" label="Classic enroll form: ask for an address" hint="Only used while the new checkout is off." checked={draft.classicCollectAddress === true} onChange={(v) => set("classicCollectAddress", v)} />
            )}
          </Panel>

          <Panel id="coupons" icon={TagIcon} title="Discount codes" description="Let buyers enter a coupon code at checkout.">
            <ToggleRow id="cs-coupons" label={draft.couponsEnabled ? "Buyers can enter a code" : "Codes aren't accepted"} checked={draft.couponsEnabled} onChange={(v) => set("couponsEnabled", v)} />
            <p className="text-muted-foreground text-caption">
              Codes are created in{" "}
              <Link className="underline" href={`/sa/${subAccountId}/courses?tab=coupons`}>Courses → Coupons</Link>. A coupon set to include Order Bumps discounts the whole eligible order.
            </p>
          </Panel>

          <Panel icon={CreditCard} title="Payment methods" description="Handled by Stripe.">
            <p className="text-body-sm">Card payments are always available. Apple Pay, Google Pay, Link and other methods appear automatically when they&apos;re turned on in your Stripe account and the buyer&apos;s device supports them.</p>
          </Panel>

          <Panel icon={Route} title="After purchase" description="Where buyers go once payment succeeds.">
            <OptionSelect aria-label="After purchase" value={draft.postPurchase.type} onChange={(v) => {
              if (!v) return;
              const next: PostPurchaseDestination =
                v === "url" ? { type: "url", url: "" } : v === "page" ? { type: "page", pageId: payload.pages?.[0]?.id ?? "" } : v === "funnel_step" ? { type: "funnel_step", stepId: "" } : ({ type: v } as PostPurchaseDestination);
              set("postPurchase", next);
            }} options={destinationOptions} />
            {draft.postPurchase.type === "url" && (
              <TextField id="cs-dest-url" label="Web address" placeholder="https://" value={draft.postPurchase.url} onChange={(v) => set("postPurchase", { type: "url", url: v })} max={2000} wide error={fieldErrors.postPurchase} />
            )}
            {draft.postPurchase.type === "page" && (
              <OptionSelect aria-label="Page" value={draft.postPurchase.pageId || null} onChange={(v) => set("postPurchase", { type: "page", pageId: v ?? "" })} options={(payload.pages ?? []).map((p) => ({ value: p.id, label: `${p.name}${p.status !== "published" ? " (draft)" : ""}` }))} placeholder="Choose a page…" />
            )}
            {draft.postPurchase.type === "funnel_step" && (
              <OptionSelect aria-label="Funnel step" value={draft.postPurchase.stepId || null} onChange={(v) => set("postPurchase", { type: "funnel_step", stepId: v ?? "" })} options={(payload.steps ?? []).filter((s) => payload.config.context.type !== "funnel_step" || s.id !== payload.config.context.stepId).map((s) => ({ value: s.id, label: `${s.order + 1}. ${s.name}` }))} placeholder="Choose a step…" />
            )}
            {draft.postPurchase.type === "funnel_next_step" && <p className="text-muted-foreground text-caption">Goes to the step after this one. If it&apos;s the last step, buyers go to their Space.</p>}
            {draft.postPurchase.type === "space" && <p className="text-muted-foreground text-caption">Buyers land in their Space, where everything they bought is waiting.</p>}
            {fieldErrors.postPurchase && draft.postPurchase.type !== "url" && <FieldError text={fieldErrors.postPurchase} />}
          </Panel>

          <Panel icon={FileText} title="Order display" description="What buyers see around the order.">
            <TextField id="cs-headline" label="Headline" value={draft.display.headline} onChange={(v) => setDisplay({ headline: v })} max={120} wide />
            <TextField id="cs-sub" label="Subheadline" value={draft.display.subheadline} onChange={(v) => setDisplay({ subheadline: v })} max={300} wide />
            <TextField id="cs-submit" label="Button text (optional)" placeholder="Pay $97.00" value={draft.display.submitLabel} onChange={(v) => setDisplay({ submitLabel: v })} max={40} wide />
            <ToggleRow id="cs-terms" label="Show recurring terms" checked={draft.display.showRecurringTerms} onChange={(v) => setDisplay({ showRecurringTerms: v })} />
            <ToggleRow id="cs-trial" label="Show trial timing" checked={draft.display.showTrialTiming} onChange={(v) => setDisplay({ showTrialTiming: v })} />
            <ToggleRow id="cs-due" label="Show amount due today" checked={draft.display.showDueToday} onChange={(v) => setDisplay({ showDueToday: v })} />
            <ToggleRow id="cs-ent" label="Show what's included" checked={draft.display.showEntitlements} onChange={(v) => setDisplay({ showEntitlements: v })} />
            <ToggleRow id="cs-secure" label="Show secure checkout note" checked={draft.display.showSecureBadge} onChange={(v) => setDisplay({ showSecureBadge: v })} />
            <ToggleRow id="cs-guar" label="Show a guarantee" checked={draft.display.guaranteeEnabled} onChange={(v) => setDisplay({ guaranteeEnabled: v })} />
            {draft.display.guaranteeEnabled && (
              <>
                <TextField id="cs-gt" label="Guarantee title" placeholder="14-day money-back guarantee" value={draft.display.guaranteeTitle} onChange={(v) => setDisplay({ guaranteeTitle: v })} max={80} wide />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cs-gx">Guarantee text</Label>
                  <Textarea id="cs-gx" rows={2} maxLength={400} value={draft.display.guaranteeText} onChange={(e) => setDisplay({ guaranteeText: e.target.value })} />
                </div>
              </>
            )}
            <p className="text-muted-foreground text-caption">Testimonials belong on the page around the checkout — add them with the Page Builder&apos;s Testimonial block.</p>
          </Panel>
        </div>

        {/* ---------------------------- Live preview --------------------------- */}
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-body-sm">Live checkout preview</p>
                <p className="text-muted-foreground text-caption">Shows your unsaved changes. Preview never takes payments.</p>
              </div>
              <div className="flex gap-1" role="group" aria-label="Preview device">
                <Button size="sm" variant={device === "desktop" ? "secondary" : "ghost"} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} aria-label="Desktop"><Monitor className="size-4" /></Button>
                <Button size="sm" variant={device === "mobile" ? "secondary" : "ghost"} aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} aria-label="Mobile"><Smartphone className="size-4" /></Button>
              </div>
            </div>
            <div className="tenant-surface tenant-wash max-h-[80vh] overflow-y-auto rounded-xl border p-3" data-public-shell="checkout-preview">
              <div className={cn("mx-auto", device === "mobile" ? "max-w-sm" : "w-full")}>
                {previewView ? (
                  <CheckoutRenderer key={JSON.stringify(previewView.bumps.map((b) => b.bumpId)) + draft.format} view={previewView} previewQuote={previewQuote} device={device === "mobile" ? "mobile" : "tablet"} />
                ) : (
                  <p className="text-muted-foreground p-6 text-center text-body-sm">Choose a primary Offer to see the preview.</p>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ------------------------------ Advanced ------------------------------ */}
      <Panel id="advanced" icon={ListChecks} title="Advanced" description="Notes and behaviour for your team.">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-body-sm">Free trial + Order Bumps</p>
            <p className="text-muted-foreground text-caption">Order Bumps are charged today. A trial Offer&apos;s first charge happens when its trial ends. Buyers see both amounts before paying.</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 font-semibold text-body-sm">Abandoned checkout <StatusPill tone="neutral">Not available yet</StatusPill></p>
            <p className="text-muted-foreground text-caption">No reminder emails are sent. Unpaid orders are kept so this can be added later.</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-body-sm">Confirmation email</p>
            <p className="text-muted-foreground text-caption">Stripe emails the payment receipt. Access emails are the ones your Offers already send (for example, booking links).</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cs-notes">Internal notes</Label>
            <Textarea id="cs-notes" rows={3} maxLength={500} value={draft.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} placeholder="Only your team sees this." />
            <span className="text-muted-foreground text-caption tabular-nums">{draft.internalNotes.length} / 500</span>
          </div>
        </div>
        {kind === "hosted_offer" && (
          <p className="text-muted-foreground flex items-center gap-2 text-caption">
            <ShieldCheck className="size-4" aria-hidden /> Tracking codes and custom code for this Offer are in the Offer&apos;s Advanced settings and also run on the hosted checkout&apos;s Offer page.
          </p>
        )}
      </Panel>
    </div>
  );
}

/* --------------------------------- pieces --------------------------------- */

function Panel({ id, icon: Icon, title, description, badge, children }: { id?: string; icon: React.ComponentType<{ className?: string }>; title: string; description?: string; badge?: string; children: React.ReactNode }) {
  return (
    <Card id={id ? `cs-${id}` : undefined} className="flex scroll-mt-4 flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-lg"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-body">{title}</h2>
          {description && <p className="text-muted-foreground text-caption">{description}</p>}
        </div>
        {badge && <StatusPill tone="info">{badge}</StatusPill>}
      </div>
      {children}
    </Card>
  );
}

function ToggleRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-body-sm">{label}</Label>
        {hint && <p className="text-muted-foreground text-caption">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,190px)] items-center gap-3">
      <span className="text-body-sm">{label}</span>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder, max, wide, error }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; max: number; wide?: boolean; error?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      {error && <FieldError text={error} />}
    </div>
  );
}

function FieldError({ text }: { text: string }) {
  return <p className="text-destructive text-caption">{text}</p>;
}

function OfferSummaryCard({ offer, subAccountId }: { offer: OfferOptionDTO; subAccountId: string }) {
  return (
    <div className="flex gap-3 rounded-xl border p-3">
      {offer.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={offer.thumbnailUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="bg-accent text-accent-foreground flex size-14 shrink-0 items-center justify-center rounded-lg"><Layers className="size-5" /></span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate font-semibold text-body-sm">{offer.title}</p>
          <p className="shrink-0 font-semibold text-body-sm tabular-nums">{offer.priceLabel}</p>
        </div>
        {offer.billingNote && <p className="text-muted-foreground text-caption">{offer.billingNote}</p>}
        {offer.entitlements.length > 0 && <p className="text-muted-foreground mt-1 line-clamp-2 text-caption">{offer.entitlements.join(" · ")}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {offer.visibility !== "published" && <StatusPill tone="warning">Draft Offer</StatusPill>}
          <Link href={`/sa/${subAccountId}/courses/offers/${offer.id}`} className="text-caption underline">Edit Offer pricing</Link>
          <Lock className="text-muted-foreground size-3" aria-hidden />
        </div>
      </div>
    </div>
  );
}
