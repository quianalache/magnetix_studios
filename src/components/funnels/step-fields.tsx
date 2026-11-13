"use client";

import Link from "next/link";
import { CopyPlus, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import { OptionSelect } from "@/components/system/option-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { hasRouting, NEXT_STEP } from "@/lib/checkout/funnel-routing";
import type { FunnelStep, FunnelStepType, StepRoute, StepRouting } from "@/types/checkout";

/**
 * Shared step fields (Funnel Phase 2) — used by the funnel hub's dialogs AND
 * the Step Settings page, so both edit the same values the same way.
 */

export interface PageChoice {
  pageId: string | null;
  copyPage: boolean;
}

export function PageField({
  id,
  type,
  currentPageId,
  value,
  onChange,
  pages,
  needsCopy,
  onDuplicateAndUse,
  duplicating = false,
  subAccountId,
  onRefresh,
  error,
}: {
  id: string;
  type: FunnelStepType;
  /** The step's saved page (null for a new step). Cancel goes back to it. */
  currentPageId: string | null;
  value: PageChoice;
  onChange: (v: PageChoice) => void;
  pages: Array<{ id: string; name: string; status: string }>;
  /** The selected page is used by an upsell/downsell (or this is one): it must be copied first. */
  needsCopy: boolean;
  /** "Duplicate & Use": copy the selected page and assign the copy. */
  onDuplicateAndUse: () => void;
  duplicating?: boolean;
  subAccountId: string;
  onRefresh?: () => void;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{type === "checkout" ? "Checkout page" : "Page"}</Label>
      <OptionSelect
        id={id}
        aria-label={type === "checkout" ? "Checkout page" : "Page"}
        value={value.pageId}
        onChange={(v) => onChange({ pageId: v, copyPage: false })}
        noneLabel={type === "checkout" ? "Hosted checkout page" : "No page yet"}
        options={pages.map((p) => ({ value: p.id, label: `${p.name}${p.status !== "published" ? " (draft)" : ""}` }))}
        aria-invalid={!!error && !needsCopy}
        disabled={duplicating}
      />
      {type === "checkout" && !value.pageId ? <p className="text-caption text-muted-foreground">Buyers use the hosted checkout page. Choose a page that holds a Checkout block to use it instead.</p> : null}
      {needsCopy ? (
        <div className="flex flex-col gap-3 rounded-lg border border-status-warning-dot/40 bg-status-warning-bg p-3" role="alert" data-duplicate-use>
          <div className="flex flex-col gap-1 text-body-sm text-status-warning-fg">
            <p className="font-semibold">
              {hasRouting(type) ? "This page is already being used by another funnel step." : "This page is already being used by another upsell or downsell step."}
            </p>
            <p>To keep each offer page independent, Magnetix can create a copy for this step. You can edit the new page without changing the original.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={duplicating} onClick={() => onChange({ pageId: currentPageId, copyPage: false })}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={duplicating} onClick={onDuplicateAndUse}>
              {duplicating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CopyPlus aria-hidden="true" />}
              Duplicate &amp; Use
            </Button>
          </div>
        </div>
      ) : value.pageId && value.pageId !== currentPageId ? (
        <label className="flex items-start gap-2 text-body-sm">
          <Checkbox checked={value.copyPage} onCheckedChange={(c) => onChange({ ...value, copyPage: c === true })} className="mt-0.5" />
          <span className="flex flex-col gap-0.5">
            <span>Use a copy of this page instead</span>
            <span className="text-caption text-muted-foreground">Optional. Makes a new draft copy just for this step, so editing it never changes the original.</span>
          </span>
        </label>
      ) : null}
      {error && !needsCopy ? <p className="text-caption text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href={`/sa/${subAccountId}/pages-funnels?create=page`} target="_blank" rel="noopener noreferrer" />}>
          <Plus aria-hidden="true" /> Create a new page <ExternalLink className="opacity-70" aria-hidden="true" />
        </Button>
        {onRefresh ? (
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw aria-hidden="true" /> Refresh pages
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const NEXT = "__next__";
const toValue = (r: StepRoute) => (r.type === "funnel_next_step" ? NEXT : r.stepId);
const toRoute = (v: string | null): StepRoute => (!v || v === NEXT ? NEXT_STEP : { type: "funnel_step", stepId: v });

/** Accept / Decline route pickers. Lists only this funnel's other steps. */
export function RoutingFields({
  idPrefix,
  steps,
  stepId,
  value,
  onChange,
  error,
}: {
  idPrefix: string;
  steps: FunnelStep[];
  stepId: string;
  value: StepRouting;
  onChange: (v: StepRouting) => void;
  error?: string | null;
}) {
  const index = steps.findIndex((s) => s.id === stepId);
  const next = steps[index + 1];
  const options = [
    { value: NEXT, label: next ? `Next step (Step ${index + 2} · ${next.name})` : "Next step (end of funnel)" },
    ...steps.map((s, i) => ({ value: s.id, label: `Step ${i + 1} · ${s.name}` })).filter((o) => o.value !== stepId),
  ];
  const field = (key: "accept" | "decline", label: string, help: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <OptionSelect id={`${idPrefix}-${key}`} aria-label={label} value={toValue(value[key])} onChange={(v) => onChange({ ...value, [key]: toRoute(v) })} options={options} aria-invalid={!!error} />
      <p className="text-caption text-muted-foreground">{help}</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      {field("accept", "If they accept, go to", "Where buyers go after saying yes to this offer.")}
      {field("decline", "If they decline, go to", "Where buyers go after saying no, for example a downsell or the thank-you page.")}
      {error ? <p className="text-caption text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
