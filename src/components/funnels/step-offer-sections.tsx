"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CircleDashed, CreditCard, Minus, Plus, X } from "lucide-react";
import { SettingsSection } from "@/components/system/settings-section";
import { SearchField } from "@/components/system/search-field";
import { StatusPill } from "@/components/system/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkflowPicker, type WorkflowOptionDTO } from "@/components/checkout/checkout-crm-section";
import { tagsFetch } from "@/components/contacts/tags/tags-client";
import { tagKey } from "@/lib/contacts/tag-names";
import {
  billingSummary,
  MAX_STEP_ACTION_TAGS,
  paymentPrerequisites,
  stepConfigStatus,
  type PaymentPrerequisite,
  type StepConfigStatus,
  type StepOfferFacts,
} from "@/lib/checkout/funnel-offer";
import { cn } from "@/lib/utils";
import type { StepCrmAction, StepOfferSettings } from "@/types/checkout";

/** One Offer as Step Settings shows it (GET …/steps/{stepId}). */
export interface StepOfferOptionDTO {
  id: string;
  title: string;
  type: "free" | "oneTime" | "recurring";
  priceCents: number | null;
  currency: string;
  recurringInterval: "day" | "week" | "month" | "year" | null;
  trialDays: number;
  visibility: string;
  systemManaged: boolean;
  priceLabel: string;
  billingNote: string | null;
  entitlements: string[];
  stepProblem: string | null;
}

export interface StepOfferPayloadDTO {
  settings: StepOfferSettings;
  offers: StepOfferOptionDTO[];
  savedOffer: StepOfferOptionDTO | null;
  savedOfferDeleted: boolean;
  workflows: WorkflowOptionDTO[];
  stripe: "ready" | "not_connected" | "charges_disabled" | "unknown";
  runtime: { postPurchaseCharging: boolean };
}

const facts = (o: StepOfferOptionDTO): StepOfferFacts => ({
  id: o.id,
  title: o.title,
  type: o.type,
  priceCents: o.priceCents,
  currency: o.currency,
  recurringInterval: o.recurringInterval,
  trialDays: o.trialDays,
  visibility: o.visibility,
  systemManaged: o.systemManaged,
});

const VISIBILITY_LABEL: Record<string, string> = { published: "Published", draft: "Draft", archived: "Archived" };

/** Status + prerequisites for the chosen Offer, shared by the summary and Payment sections. */
export function useStepOfferReadiness(input: {
  payload: StepOfferPayloadDTO;
  value: StepOfferSettings;
  hasEarlierCheckout: boolean;
}): { offer: StepOfferOptionDTO | null; offerAttention: string | null; prereqs: PaymentPrerequisite[]; crmAttention: number; status: StepConfigStatus } {
  const { payload, value } = input;
  const offer = value.offerId ? (payload.offers.find((o) => o.id === value.offerId) ?? (payload.savedOffer?.id === value.offerId ? payload.savedOffer : null)) : null;
  const offerAttention = value.offerId
    ? !offer
      ? "The Offer chosen for this step was deleted. Choose another Offer."
      : offer.stepProblem
    : null;
  const deletedWorkflow = (id: string | null) => !!id && !payload.workflows.some((w) => w.id === id);
  const inactiveWorkflow = (id: string | null) => !!id && payload.workflows.some((w) => w.id === id && w.status !== "active");
  const crmAttention =
    (value.onAccept.invalidTags?.length ?? 0) +
    (value.onDecline.invalidTags?.length ?? 0) +
    [value.onAccept.workflowId, value.onDecline.workflowId].filter((id) => deletedWorkflow(id) || inactiveWorkflow(id)).length;
  const prereqs = paymentPrerequisites({
    offer: offer ? facts(offer) : value.offerId ? ({ id: value.offerId, title: "Deleted Offer", type: "oneTime", priceCents: null, currency: null, recurringInterval: null, visibility: "deleted" } as StepOfferFacts) : null,
    offerAttention,
    stripe: payload.stripe,
    hasEarlierCheckout: input.hasEarlierCheckout,
    recurringDisclosureAcknowledged: value.payment.recurringDisclosureAcknowledged,
  });
  return { offer, offerAttention, prereqs, crmAttention, status: stepConfigStatus(prereqs, crmAttention) };
}

const STATUS_COPY: Record<StepConfigStatus, { tone: "success" | "warning" | "neutral"; label: string }> = {
  complete: { tone: "success", label: "Configuration complete" },
  attention: { tone: "warning", label: "Needs attention" },
  missing: { tone: "neutral", label: "Setup incomplete" },
};

/** Compact overview at the top of an Upsell / Downsell step's settings. */
export function StepOfferSummary({ status, runtimeAvailable, offer, value, workflows }: { status: StepConfigStatus; runtimeAvailable: boolean; offer: StepOfferOptionDTO | null; value: StepOfferSettings; workflows: WorkflowOptionDTO[] }) {
  const s = STATUS_COPY[status];
  return (
    <section aria-label="Step summary" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={s.tone}>{s.label}</StatusPill>
        <StatusPill tone="neutral">{runtimeAvailable ? "Post-purchase charging on" : "Post-purchase charging not enabled yet"}</StatusPill>
      </div>
      <p className="text-body-sm">
        {offer ? (
          <>
            Sells <strong>{offer.title}</strong> · {offer.priceLabel} · {billingSummary(facts(offer))}
          </>
        ) : (
          "No Offer chosen yet."
        )}
      </p>
      {!runtimeAvailable ? (
        <p className="rounded-lg bg-tint-violet px-3 py-2 text-caption text-muted-foreground">
          {status === "complete" ? "Payment configuration saved. " : ""}Post-purchase charging is not yet enabled, so buyers aren&apos;t charged on this step and no CRM actions run yet.
        </p>
      ) : null}
      <CrmActionsSummary value={value} workflows={workflows} />
    </section>
  );
}

function CrmActionsSummary({ value, workflows }: { value: StepOfferSettings; workflows: WorkflowOptionDTO[] }) {
  const line = (a: StepCrmAction) => {
    const parts: React.ReactNode[] = [];
    a.addTags.forEach((t) => parts.push(<li key={`a-${t}`}>+ {t}</li>));
    a.removeTags.forEach((t) => parts.push(<li key={`r-${t}`}>− {t}</li>));
    if (a.workflowId) parts.push(<li key="wf">Start: {workflows.find((w) => w.id === a.workflowId)?.name ?? "a deleted Workflow"}</li>);
    return parts.length ? <ul className="text-caption">{parts}</ul> : <p className="text-caption text-muted-foreground">No actions</p>;
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0 rounded-lg border px-3 py-2">
        <p className="text-caption font-semibold uppercase tracking-wide">On accept</p>
        <p className="text-caption text-muted-foreground">After a successful payment</p>
        {line(value.onAccept)}
      </div>
      <div className="min-w-0 rounded-lg border px-3 py-2">
        <p className="text-caption font-semibold uppercase tracking-wide">On decline</p>
        <p className="text-caption text-muted-foreground">After the buyer declines</p>
        {line(value.onDecline)}
      </div>
    </div>
  );
}

/* --------------------------------- Offer --------------------------------- */

export function OfferSection({ payload, value, onChange, error, subAccountId }: { payload: StepOfferPayloadDTO; value: StepOfferSettings; onChange: (v: StepOfferSettings) => void; error?: string; subAccountId: string }) {
  const [q, setQ] = useState("");
  const listId = useId();
  const selected = value.offerId ? (payload.offers.find((o) => o.id === value.offerId) ?? (payload.savedOffer?.id === value.offerId ? payload.savedOffer : null)) : null;
  const deleted = !!value.offerId && !selected;
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return payload.offers.filter((o) => o.id !== value.offerId && (!needle || o.title.toLowerCase().includes(needle))).slice(0, 8);
  }, [payload.offers, q, value.offerId]);
  return (
    <SettingsSection title="Offer" description="The Offer this step sells. Price and billing come from the Offer; change them on the Offer itself.">
      {selected ? (
        <OfferCard offer={selected} subAccountId={subAccountId} onClear={() => onChange({ ...value, offerId: null })} />
      ) : deleted ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-status-danger-bg p-3 text-body-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-danger-fg" aria-hidden="true" />
          <span className="min-w-0 flex-1">The Offer chosen for this step was deleted. Choose another Offer below.</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${listId}-search`}>{selected ? "Change Offer" : "Choose an Offer"}</Label>
        <SearchField value={q} onChange={setQ} placeholder="Search your Offers" aria-label="Search Offers" />
        {payload.offers.length === 0 ? (
          <p className="text-caption text-muted-foreground">
            No Offers in this workspace yet. <Link href={`/sa/${subAccountId}/courses/offers`} className="underline">Create one in Offers</Link>.
          </p>
        ) : matches.length === 0 ? (
          <p className="text-caption text-muted-foreground">No Offers match “{q}”.</p>
        ) : (
          <ul id={listId} aria-label="Offers" className="flex flex-col divide-y rounded-lg border">
            {matches.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={!!o.stepProblem}
                  onClick={() => {
                    onChange({ ...value, offerId: o.id });
                    setQ("");
                  }}
                  className="flex w-full min-w-0 items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm font-medium">{o.title}</span>
                    <span className="block text-caption text-muted-foreground">
                      {o.priceLabel} · {billingSummary(facts(o))}
                      {o.stepProblem ? ` — ${o.stepProblem}` : ""}
                    </span>
                  </span>
                  <StatusPill tone={o.visibility === "published" ? "success" : "neutral"}>{VISIBILITY_LABEL[o.visibility] ?? o.visibility}</StatusPill>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-caption text-muted-foreground">Sold only inside this funnel: choosing an Offer here doesn&apos;t create a public purchase link.</p>
      {error ? <p className="text-caption text-destructive" role="alert">{error}</p> : null}
    </SettingsSection>
  );
}

function OfferCard({ offer, subAccountId, onClear }: { offer: StepOfferOptionDTO; subAccountId: string; onClear: () => void }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", offer.stepProblem && "border-status-warning-fg/40")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{offer.title}</p>
          <p className="text-caption text-muted-foreground">
            {offer.priceLabel} · {offer.currency} · {billingSummary(facts(offer))}
            {offer.type === "recurring" && offer.trialDays ? ` · ${offer.trialDays}-day free trial` : ""}
          </p>
          {offer.billingNote ? <p className="text-caption text-muted-foreground">{offer.billingNote}</p> : null}
        </div>
        <StatusPill tone={offer.visibility === "published" ? "success" : offer.visibility === "archived" ? "warning" : "neutral"}>{VISIBILITY_LABEL[offer.visibility] ?? offer.visibility}</StatusPill>
      </div>
      {offer.entitlements.length ? <p className="text-caption text-muted-foreground">Includes: {offer.entitlements.join(" · ")}</p> : null}
      {offer.stepProblem ? (
        <p role="alert" className="flex items-start gap-1.5 text-caption text-status-warning-fg">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> Needs attention: {offer.stepProblem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" render={<Link href={`/sa/${subAccountId}/courses/offers/${offer.id}`} />}>Open Offer</Button>
        <Button variant="ghost" size="sm" onClick={onClear}>Remove Offer</Button>
      </div>
    </div>
  );
}

/* -------------------------------- Payment -------------------------------- */

const PREREQ_ICON: Record<PaymentPrerequisite["state"], React.ReactNode> = {
  met: <Check className="size-4 text-status-success-fg" aria-hidden="true" />,
  missing: <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />,
  attention: <AlertTriangle className="size-4 text-status-warning-fg" aria-hidden="true" />,
};
const PREREQ_SR: Record<PaymentPrerequisite["state"], string> = { met: "Done", missing: "Missing", attention: "Needs attention" };

export function PaymentSection({ offer, value, onChange, prereqs, runtimeAvailable }: { offer: StepOfferOptionDTO | null; value: StepOfferSettings; onChange: (v: StepOfferSettings) => void; prereqs: PaymentPrerequisite[]; runtimeAvailable: boolean }) {
  const recurring = offer?.type === "recurring";
  const ackId = useId();
  return (
    <SettingsSection title="Payment" description="How this Offer is paid for inside the funnel.">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body-sm">
        <dt className="text-muted-foreground">Payment</dt>
        <dd>{offer ? (recurring ? "Subscription — one click" : "One-time — one click") : "Choose an Offer first"}</dd>
        {offer ? (
          <>
            <dt className="text-muted-foreground">Price</dt>
            <dd>
              {offer.priceLabel} ({offer.currency})
            </dd>
            {recurring ? (
              <>
                <dt className="text-muted-foreground">Billed</dt>
                <dd>{billingSummary(facts(offer)).replace("Subscription · ", "")}{offer.trialDays ? ` after a ${offer.trialDays}-day free trial` : ""}</dd>
              </>
            ) : null}
          </>
        ) : null}
        <dt className="text-muted-foreground">Card</dt>
        <dd>The payment method the buyer saved at this funnel&apos;s checkout — no card details to re-enter.</dd>
        <dt className="text-muted-foreground">If it fails</dt>
        <dd>The buyer stays on this step and sees an inline payment form. A failed or pending payment never counts as declining the offer.</dd>
      </dl>

      {recurring ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-body-sm font-medium">Subscription disclosure</p>
          <p className="text-caption text-muted-foreground">
            Before a one-click subscription starts, buyers must be shown the recurring amount ({offer?.priceLabel}), how often they&apos;re billed, and the terms that apply, and must agree. Add your terms and wording to this step&apos;s page and the Offer.
          </p>
          <div className="flex items-start gap-2">
            <Checkbox id={ackId} checked={value.payment.recurringDisclosureAcknowledged} onCheckedChange={(v) => onChange({ ...value, payment: { ...value.payment, recurringDisclosureAcknowledged: v === true } })} />
            <Label htmlFor={ackId} className="text-body-sm font-normal">
              I&apos;ll show buyers the recurring amount, billing frequency and terms, and they must agree before being charged.
            </Label>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-body-sm font-medium">Before this step can take payments</p>
        <ul aria-label="Payment prerequisites" className="flex flex-col gap-1.5">
          {prereqs.map((p) => (
            <li key={p.key} className="flex items-start gap-2 text-body-sm">
              <span className="mt-0.5">{PREREQ_ICON[p.state]}</span>
              <span className="min-w-0">
                <span className="font-medium">{p.label}</span>
                <span className="sr-only"> — {PREREQ_SR[p.state]}</span>
                <span className="block text-caption text-muted-foreground">{p.detail}</span>
              </span>
            </li>
          ))}
          <li className="flex items-start gap-2 text-body-sm">
            <span className="mt-0.5">
              <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="font-medium">Post-purchase charging</span>
              <span className="block text-caption text-muted-foreground">
                {runtimeAvailable ? "Enabled." : "Not yet enabled. Your payment configuration is saved; this step won't charge buyers until it is."}
              </span>
            </span>
          </li>
        </ul>
      </div>
    </SettingsSection>
  );
}

/* ---------------------------------- CRM ---------------------------------- */

export function CrmSection({ subAccountId, value, onChange, workflows, errors }: { subAccountId: string; value: StepOfferSettings; onChange: (v: StepOfferSettings) => void; workflows: WorkflowOptionDTO[]; errors: Record<string, string> }) {
  const [library, setLibrary] = useState<string[] | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    tagsFetch<{ names: string[] }>(subAccountId, "?names=1")
      .then((d) => !cancelled && setLibrary(d.names))
      .catch((e) => !cancelled && setLibraryError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);
  const set = (side: "onAccept" | "onDecline", action: StepCrmAction) => onChange({ ...value, [side]: action });
  return (
    <SettingsSection title="CRM & follow-up" description="Tags and Workflows for each outcome. Nothing runs when you save or preview.">
      {libraryError ? <p className="text-caption text-destructive">Couldn&apos;t load your Tags library: {libraryError}</p> : null}
      <ActionGroup
        title="On accept"
        when="Runs only after the payment succeeds — clicking Accept alone, or a failed or pending payment, runs nothing."
        side="onAccept"
        action={value.onAccept}
        onChange={(a) => set("onAccept", a)}
        library={library}
        workflows={workflows}
        subAccountId={subAccountId}
        errors={errors}
      />
      <ActionGroup
        title="On decline"
        when="Runs only when the buyer chooses to decline — never when a payment fails."
        side="onDecline"
        action={value.onDecline}
        onChange={(a) => set("onDecline", a)}
        library={library}
        workflows={workflows}
        subAccountId={subAccountId}
        errors={errors}
      />
    </SettingsSection>
  );
}

function ActionGroup(props: {
  title: string;
  when: string;
  side: "onAccept" | "onDecline";
  action: StepCrmAction;
  onChange: (a: StepCrmAction) => void;
  library: string[] | null;
  workflows: WorkflowOptionDTO[];
  subAccountId: string;
  errors: Record<string, string>;
}) {
  const { action, onChange, side } = props;
  const invalid = action.invalidTags ?? [];
  return (
    <fieldset className="flex min-w-0 flex-col gap-3 rounded-xl border p-3">
      <legend className="px-1 text-body-sm font-semibold">{props.title}</legend>
      <p className="text-caption text-muted-foreground">{props.when}</p>
      {invalid.map((m) => (
        <div key={`${m.list}-${m.tag}`} role="alert" className="flex items-start gap-2 rounded-lg bg-status-warning-bg px-3 py-2 text-caption">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning-fg" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Needs attention: “{m.tag}” was deleted from your Tags library, so it&apos;s no longer {m.list === "addTags" ? "added" : "removed"}. Choose another tag if you still need one.
          </span>
          <button type="button" className="shrink-0 underline" onClick={() => onChange({ ...action, invalidTags: invalid.filter((x) => x !== m) })} aria-label={`Dismiss warning about ${m.tag}`}>
            Dismiss
          </button>
        </div>
      ))}
      <LibraryTagsField id={`${side}-add`} label="Add tags" icon="add" value={action.addTags} other={action.removeTags} library={props.library} subAccountId={props.subAccountId} onChange={(t) => onChange({ ...action, addTags: t })} />
      <LibraryTagsField id={`${side}-remove`} label="Remove tags" icon="remove" value={action.removeTags} other={action.addTags} library={props.library} subAccountId={props.subAccountId} onChange={(t) => onChange({ ...action, removeTags: t })} />
      {props.errors[`${side}.tags`] ? <p className="text-caption text-destructive" role="alert">{props.errors[`${side}.tags`]}</p> : null}
      <WorkflowPicker
        id={`${side}-workflow`}
        label="Start a Workflow (optional)"
        value={action.workflowId}
        onChange={(id) => onChange({ ...action, workflowId: id })}
        workflows={props.workflows}
        subAccountId={props.subAccountId}
        error={props.errors[`${side}.workflowId`]}
        help="The contact is enrolled in an existing Workflow."
      />
    </fieldset>
  );
}

/** Tags from the workspace Tags library only (search + pick; no new tags here). */
function LibraryTagsField({ id, label, icon, value, other, library, onChange, subAccountId }: { id: string; label: string; icon: "add" | "remove"; value: string[]; other: string[]; library: string[] | null; onChange: (tags: string[]) => void; subAccountId: string }) {
  const [q, setQ] = useState("");
  const full = value.length >= MAX_STEP_ACTION_TAGS;
  const taken = new Set([...value, ...other].map(tagKey));
  const needle = tagKey(q);
  const suggestions = needle && library ? library.filter((n) => !taken.has(tagKey(n)) && tagKey(n).includes(needle)).slice(0, 6) : [];
  const Icon = icon === "add" ? Plus : Minus;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {value.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-caption font-medium text-secondary-foreground">
              <Icon className="size-3" aria-hidden="true" />
              {t}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t} from ${label}`} className="opacity-70 hover:opacity-100">
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={id}
        value={q}
        disabled={full || !library}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && suggestions[0]) {
            e.preventDefault();
            onChange([...value, suggestions[0]]);
            setQ("");
          }
        }}
        placeholder={!library ? "Loading tags…" : full ? `Up to ${MAX_STEP_ACTION_TAGS} tags` : "Search your Tags library"}
        aria-autocomplete="list"
      />
      {needle && library ? (
        suggestions.length ? (
          <ul aria-label={`${label} suggestions`} className="flex flex-col rounded-lg border">
            {suggestions.map((n) => (
              <li key={n}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-body-sm hover:bg-muted/40"
                  onClick={() => {
                    onChange([...value, n]);
                    setQ("");
                  }}
                >
                  {n}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-muted-foreground">
            No tag in your library matches “{q.trim()}”. Create tags in <Link href={`/sa/${subAccountId}/contacts?view=tags`} className="underline">Contacts → Tags</Link> first.
          </p>
        )
      ) : null}
    </div>
  );
}
