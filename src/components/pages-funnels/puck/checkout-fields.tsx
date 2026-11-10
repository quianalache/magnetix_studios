"use client";

import { useContext, useEffect, useId, useState } from "react";
import { createUsePuck } from "@puckeditor/core";
import { setCheckoutPreviewStep, useCheckoutPreviewStep } from "@/components/pages-funnels/puck/checkout-preview";
import { AlertTriangle, ChevronDown, ExternalLink, Info, Link2, Loader2, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { OptionSelect } from "@/components/system/option-select";
import { ActionFieldContext } from "@/components/pages-funnels/puck/action-field";
import { Hint } from "@/components/pages-funnels/puck/color-controls";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { applyPreset, connectionLabel, normalizePresentation, type CheckoutPresentation, type CheckoutShow, type CheckoutText } from "@/lib/checkout/presentation";
import { AUTO_CHECKOUT_KEY, checkoutSettingsHref, type CheckoutStepContext } from "@/lib/pages-funnels/checkout-block";
import { cn } from "@/lib/utils";

/**
 * Checkout / Order Form block settings (Checkout Foundation Phase 3).
 *
 *  - Connection: a Funnel Checkout Step of THIS workspace (never an Offer).
 *  - Presentation: preset, layout, visibility and text — presentation only.
 *
 * Pricing, Offers, Order Bumps, Coupons and fulfilment live in the Checkout
 * Step's Checkout Settings (linked from here) and can't be changed here.
 */

const useTypedPuck = createUsePuck();

interface ContextsResponse {
  subAccountId: string;
  contexts: CheckoutStepContext[];
  autoConfigId: string | null;
  pageInFunnel: boolean;
  resolved: Record<string, { connection: CheckoutStepContext; problem: string | null; view: { format: string; couponsEnabled: boolean; bumps: unknown[] } | null } | null>;
}

export function CheckoutConnectionFieldEditor({ value, onChange }: { value: string | undefined; onChange: (configId: string) => void }) {
  const ctx = useContext(ActionFieldContext);
  const sub = useOptionalSubAccount();
  const blockId = useTypedPuck((s) => (s.selectedItem?.props as { id?: string } | undefined)?.id) ?? "";
  const previewStep = useCheckoutPreviewStep(blockId, true);
  const pageId = ctx?.pageId ?? "";
  const configId = value ?? "";
  const key = configId || AUTO_CHECKOUT_KEY;
  const [data, setData] = useState<ContextsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    setFailed(false);
    fetch(`/api/pages-funnels/puck/resolve-checkout?pageId=${encodeURIComponent(pageId)}&keys=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: ContextsResponse) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [pageId, key]);

  if (!pageId) return <Hint>Checkout connection is available when editing a page.</Hint>;
  if (failed) return <Hint>Couldn&apos;t load this workspace&apos;s Checkout Steps. Reload to try again.</Hint>;
  if (!data) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 rounded-md border p-2.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Loading Checkout Steps…
      </div>
    );
  }

  const resolved = data.resolved[key] ?? null;
  const connection = resolved?.connection ?? null;
  const saId = sub?.subAccountId ?? data.subAccountId;
  const options = data.contexts.map((c) => ({ value: c.configId, label: `${connectionLabel(c)}${c.funnelStatus !== "published" ? " (draft funnel)" : ""}` }));
  if (configId && !data.contexts.some((c) => c.configId === configId)) options.unshift({ value: configId, label: connection ? connectionLabel(connection) : "Unavailable Checkout Step" });

  return (
    <div className="space-y-2.5" data-checkout-connection-field="">
      {connection ? (
        <div className="border-primary/30 bg-primary/5 space-y-2 rounded-lg border p-2.5 text-xs">
          <p className="flex items-start gap-1.5">
            <Link2 className="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Connected to: <strong>{connectionLabel(connection)}</strong>
              {!configId && <span className="text-muted-foreground"> (automatic — this page&apos;s Checkout Step)</span>}
            </span>
          </p>
          <p className="ps-5">
            Primary Offer: <strong>{connection.primaryOfferTitle ?? "Not chosen yet"}</strong>
          </p>
          <a
            href={checkoutSettingsHref(saId, connection)}
            target="_blank"
            rel="noreferrer"
            className="border-primary/40 text-primary hover:bg-primary/10 flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 font-medium"
            data-checkout-edit-settings=""
          >
            Edit Checkout Settings <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          {resolved?.problem && (
            <p className="flex items-start gap-1.5 text-amber-700" role="status">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {resolved.problem}
            </p>
          )}
        </div>
      ) : (
        <p className="flex items-start gap-1.5 rounded-lg border border-dashed p-2.5 text-xs" role="status">
          <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {data.contexts.length === 0
            ? "This workspace has no Funnel Checkout Steps yet. Add a Checkout step to a funnel, then connect it here."
            : data.pageInFunnel
              ? "Choose which of this funnel's Checkout Steps this block shows."
              : "Choose a Checkout Step. Tip: set this page as a Checkout step's page in the funnel to connect automatically."}
        </p>
      )}

      {(options.length > 1 || !connection || configId) && options.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">Checkout Step</Label>
          <OptionSelect
            size="sm"
            className="w-full"
            aria-label="Checkout Step"
            value={configId || null}
            onChange={(v) => onChange(v ?? "")}
            options={options}
            noneLabel={data.autoConfigId ? "Automatic (this page's Checkout Step)" : "Select a Checkout Step…"}
          />
        </div>
      )}

      {resolved?.view?.format === "two_step" && (
        <div className="space-y-1" data-checkout-step-switcher="">
          <Label className="text-xs">Preview step</Label>
          <SegmentedControl<"1" | "2">
            value={String(previewStep) as "1" | "2"}
            onChange={(v) => setCheckoutPreviewStep(blockId, v === "2" ? 2 : 1)}
            options={[
              { value: "1", label: "Step 1" },
              { value: "2", label: "Step 2" },
            ]}
          />
          <Hint>Step 1 is &ldquo;Your information&rdquo;, Step 2 is &ldquo;Payment &amp; review&rdquo;. Shows that step on the canvas — nothing is submitted or saved.</Hint>
        </div>
      )}

      <p className="bg-muted/50 flex items-start gap-1.5 rounded-md p-2 text-xs" data-checkout-locked-note="">
        <Lock className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>Presentation only. Offer, pricing, Order Bumps, Coupons and fulfillment are managed in the Checkout Settings.</span>
      </p>
    </div>
  );
}

/* ------------------------------ Presentation ------------------------------ */

export function CheckoutPresentationFieldEditor({ value, onChange }: { value: unknown; onChange: (next: CheckoutPresentation) => void }) {
  const p = normalizePresentation(value);
  const set = (patch: Partial<CheckoutPresentation>) => onChange({ ...p, ...patch });
  const setShow = (patch: Partial<CheckoutShow>) => onChange({ ...p, show: { ...p.show, ...patch } });
  const setText = (patch: Partial<CheckoutText>) => onChange({ ...p, text: { ...p.text, ...patch } });

  return (
    <div className="space-y-2" data-checkout-presentation-field="">
      <Group title="Presentation preset" defaultOpen>
        <SegmentedControl<CheckoutPresentation["preset"]>
          value={p.preset}
          onChange={(preset) => onChange(applyPreset(p, preset))}
          options={[
            { value: "full", label: "Full" },
            { value: "minimal", label: "Minimal" },
          ]}
        />
        <Hint>
          {p.preset === "full"
            ? "Conversion-focused: Offer image, benefits, full summary, trust and guarantee."
            : "Lighter and focused: buyer details, price and terms, payment and the purchase button. Required pricing, terms and agreement always stay."}
        </Hint>
      </Group>

      <Group title="Layout" defaultOpen>
        <Row label="Columns">
          <SegmentedControl<CheckoutPresentation["layout"]>
            value={p.layout}
            onChange={(layout) => set({ layout })}
            options={[
              { value: "auto", label: "Auto" },
              { value: "two_column", label: "Two" },
              { value: "single_column", label: "One" },
            ]}
          />
        </Row>
        <Row label="Width">
          <SegmentedControl<CheckoutPresentation["width"]>
            value={p.width}
            onChange={(width) => set({ width })}
            options={[
              { value: "full", label: "Full" },
              { value: "wide", label: "Wide" },
              { value: "narrow", label: "Narrow" },
            ]}
          />
        </Row>
        <Row label="Alignment">
          <SegmentedControl<CheckoutPresentation["alignment"]>
            value={p.alignment}
            onChange={(alignment) => set({ alignment })}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
            ]}
          />
        </Row>
        <Row label="Container">
          <SegmentedControl<CheckoutPresentation["container"]>
            value={p.container}
            onChange={(container) => set({ container })}
            options={[
              { value: "plain", label: "Transparent" },
              { value: "card", label: "Card" },
            ]}
          />
        </Row>
        <Row label="Summary side">
          <SegmentedControl<CheckoutPresentation["summaryPosition"]>
            value={p.summaryPosition}
            onChange={(summaryPosition) => set({ summaryPosition })}
            options={[
              { value: "right", label: "Right" },
              { value: "left", label: "Left" },
            ]}
          />
        </Row>
        <Row label="Summary on phones">
          <SegmentedControl<CheckoutPresentation["mobileSummary"]>
            value={p.mobileSummary}
            onChange={(mobileSummary) => set({ mobileSummary })}
            options={[
              { value: "top", label: "Top" },
              { value: "bottom", label: "Bottom" },
            ]}
          />
        </Row>
        <Hint>Phones always stack into one column; two columns start at laptop width.</Hint>
      </Group>

      <Group title="Show">
        <Toggle label="Brand header" checked={p.show.header} onChange={(v) => setShow({ header: v })} />
        <Toggle label="Heading" checked={p.show.heading} onChange={(v) => setShow({ heading: v })} />
        <Toggle label="Subheading" checked={p.show.subheading} onChange={(v) => setShow({ subheading: v })} />
        <Toggle label="Offer image" checked={p.show.offerImage} onChange={(v) => setShow({ offerImage: v })} />
        <Toggle label="Offer description" checked={p.show.offerDescription} onChange={(v) => setShow({ offerDescription: v })} />
        <Toggle label="Benefits list" checked={p.show.benefits} onChange={(v) => setShow({ benefits: v })} />
        <Toggle label="Full order summary" hint="Off: a concise summary — every price, discount and term still shows." checked={p.show.orderSummary} onChange={(v) => setShow({ orderSummary: v })} />
        <Toggle label="Discount code field" hint="Only when the checkout accepts codes." checked={p.show.couponField} onChange={(v) => setShow({ couponField: v })} />
        <Toggle label="Order Bumps" hint="Only the Order Bumps set up in Checkout Settings." checked={p.show.bumps} onChange={(v) => setShow({ bumps: v })} />
        <Toggle label="Guarantee" hint="Only when a guarantee is set in Checkout Settings." checked={p.show.guarantee} onChange={(v) => setShow({ guarantee: v })} />
        <Toggle label="Trust & security" checked={p.show.trust} onChange={(v) => setShow({ trust: v })} />
      </Group>

      <Group title="Two-step checkout">
        <Hint>Applies when the connected Checkout Step uses two steps.</Hint>
        <Toggle label="Progress indicator" checked={p.show.progress} onChange={(v) => setShow({ progress: v })} />
        <Toggle label="Order summary on Step 1 too" checked={p.show.summaryOnStep1} onChange={(v) => setShow({ summaryOnStep1: v })} />
        <TextInput label="Step 1 title" placeholder="Your information" value={p.text.step1Title} max={60} onChange={(v) => setText({ step1Title: v })} />
        <TextInput label="Step 2 title" placeholder="Payment & review" value={p.text.step2Title} max={60} onChange={(v) => setText({ step2Title: v })} />
        <TextInput label="Continue button" placeholder="Continue to payment" value={p.text.continueLabel} max={40} onChange={(v) => setText({ continueLabel: v })} />
      </Group>

      <Group title="Text">
        <TextInput label="Heading" placeholder="From Checkout Settings" value={p.text.heading} max={120} onChange={(v) => setText({ heading: v })} />
        <TextInput label="Subheading" placeholder="From Checkout Settings" value={p.text.subheading} max={300} onChange={(v) => setText({ subheading: v })} />
        <TextInput label="Purchase button" placeholder="From Checkout Settings" value={p.text.submitLabel} max={40} onChange={(v) => setText({ submitLabel: v })} />
        <Hint>Blank uses the checkout&apos;s own text. The amount and trial wording on the button are added automatically.</Hint>
      </Group>

      <Group title="Order Bump appearance">
        <Row label="Style">
          <SegmentedControl<CheckoutPresentation["bumpStyle"]>
            value={p.bumpStyle}
            onChange={(bumpStyle) => set({ bumpStyle })}
            options={[
              { value: "card", label: "Dashed" },
              { value: "outlined", label: "Outline" },
              { value: "highlight", label: "Highlight" },
            ]}
          />
        </Row>
        <Toggle label="Images" checked={p.showBumpImages} onChange={(v) => set({ showBumpImages: v })} />
        <Toggle label="Descriptions" checked={p.showBumpDescriptions} onChange={(v) => set({ showBumpDescriptions: v })} />
        <Hint>Selected add-ons are always marked by the checkbox, a label and a solid border.</Hint>
      </Group>

      <Group title="Payment area">
        <Row label="Order Bumps">
          <SegmentedControl<CheckoutPresentation["bumpPlacement"]>
            value={p.bumpPlacement}
            onChange={(bumpPlacement) => set({ bumpPlacement })}
            options={[
              { value: "before_payment", label: "Above payment" },
              { value: "after_payment", label: "Below payment" },
            ]}
          />
        </Row>
        <Row label="Discount code">
          <SegmentedControl<CheckoutPresentation["couponPlacement"]>
            value={p.couponPlacement}
            onChange={(couponPlacement) => set({ couponPlacement })}
            options={[
              { value: "summary", label: "In summary" },
              { value: "before_payment", label: "Own card" },
            ]}
          />
        </Row>
        <Hint>The agreement checkbox always sits right above the purchase button.</Hint>
      </Group>

      <Group title="Button">
        <Row label="Width">
          <SegmentedControl<CheckoutPresentation["buttonWidth"]>
            value={p.buttonWidth}
            onChange={(buttonWidth) => set({ buttonWidth })}
            options={[
              { value: "full", label: "Full" },
              { value: "auto", label: "Fit text" },
            ]}
          />
        </Row>
        <Row label="Alignment">
          <SegmentedControl<CheckoutPresentation["buttonAlign"]>
            value={p.buttonAlign}
            onChange={(buttonAlign) => set({ buttonAlign })}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
            ]}
          />
        </Row>
        <Hint>Button color follows the checkout&apos;s brand color.</Hint>
      </Group>
    </div>
  );
}

/* --------------------------------- pieces --------------------------------- */

function Group({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  return (
    <section className="rounded-lg border" data-checkout-group={title}>
      <button type="button" className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-xs font-semibold tracking-wide uppercase" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {title}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="space-y-2.5 border-t px-2.5 py-2.5">
          {children}
        </div>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-muted-foreground block text-xs">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        {hint && <p className="text-muted-foreground text-xs leading-snug">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function TextInput({ label, value, placeholder, max, onChange }: { label: string; value: string; placeholder: string; max: number; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} value={value} placeholder={placeholder} maxLength={max} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}
