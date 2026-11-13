"use client";

import { sameTag } from "@/lib/contacts/tag-names";
import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { OptionSelect } from "@/components/system/option-select";
import { StatusPill } from "@/components/system/status-pill";
import { ABANDON_DELAY_LABELS, ABANDON_DELAY_OPTIONS, MAX_CHECKOUT_TAGS, type AbandonDelayMinutes } from "@/lib/checkout/crm";
import { cn } from "@/lib/utils";
import type { CheckoutCrmSettings } from "@/types/checkout";

export interface WorkflowOptionDTO {
  id: string;
  name: string;
  status: string;
  triggerType: string | null;
}

/**
 * CRM & Follow-Up (Checkout Foundation Phase 3) — business behaviour of a
 * checkout: Contact capture, marketing opt-in, tags, abandoned-checkout
 * tracking and the Workflows to start. Shared by the Funnel Checkout Step
 * and the hosted Offer checkout editors. Never in the Page Builder.
 */
export function CheckoutCrmSection({
  value,
  onChange,
  workflows,
  subAccountId,
  errors,
}: {
  value: CheckoutCrmSettings;
  onChange: (next: CheckoutCrmSettings) => void;
  workflows: WorkflowOptionDTO[];
  subAccountId: string;
  errors: Record<string, string>;
}) {
  const set = (patch: Partial<CheckoutCrmSettings>) => onChange({ ...value, ...patch });
  const abandonedOn = value.abandoned.enabled;

  return (
    <div className="flex flex-col gap-2">
      <Group title="Contact capture" summary={value.captureContactOnStart ? "On — Contact created when checkout starts" : "Off"} defaultOpen>
        <SwitchRow
          id="crm-capture"
          label="Create or update the Contact when checkout starts"
          hint={
            abandonedOn
              ? "Required while abandoned checkout tracking is on."
              : "Two-step: when the buyer continues to payment. One-step: once a valid email is entered. Existing Contacts are matched by email and only blank fields are filled."
          }
          checked={value.captureContactOnStart}
          disabled={abandonedOn}
          onChange={(v) => set({ captureContactOnStart: v })}
        />
        <p className="text-muted-foreground text-caption">
          Source: the visit&apos;s UTM source when present, otherwise <strong>Checkout</strong>. First-touch attribution (UTMs, referrer, landing page) is kept on new Contacts.
        </p>
        <TagsField label="Tags when checkout starts" value={value.startedTags} onChange={(t) => set({ startedTags: t })} disabled={!value.captureContactOnStart} />
      </Group>

      <Group title="Marketing opt-in" summary={value.marketingOptIn.enabled ? "Checkbox shown" : "Hidden"}>
        <SwitchRow
          id="crm-optin"
          label="Show a marketing opt-in checkbox"
          hint="Unchecked by default. Buying is never treated as marketing consent — only a ticked box is."
          checked={value.marketingOptIn.enabled}
          onChange={(v) => set({ marketingOptIn: { ...value.marketingOptIn, enabled: v } })}
        />
        {value.marketingOptIn.enabled && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="crm-optin-label">Checkbox label</Label>
              <Textarea
                id="crm-optin-label"
                rows={2}
                maxLength={300}
                value={value.marketingOptIn.label}
                onChange={(e) => set({ marketingOptIn: { ...value.marketingOptIn, label: e.target.value } })}
              />
              <span className="text-muted-foreground text-caption">This exact text is saved with the Contact&apos;s consent record.</span>
            </div>
            <TagsField
              label="Tags when the buyer opts in"
              hint="Use these tags to build your email audience (Contacts → Lists or Broadcast audiences)."
              value={value.marketingOptIn.tags}
              onChange={(t) => set({ marketingOptIn: { ...value.marketingOptIn, tags: t } })}
            />
          </>
        )}
      </Group>

      <Group title="Abandoned checkout" summary={abandonedOn ? `On — after ${ABANDON_DELAY_LABELS[value.abandoned.delayMinutes].toLowerCase()}` : "Off"}>
        <SwitchRow
          id="crm-abandoned"
          label="Track abandoned checkouts"
          hint="A buyer who started checkout (identity captured) but hasn't paid after the delay is marked abandoned — once. Paying later stops any follow-up."
          checked={abandonedOn}
          onChange={(v) => set({ abandoned: { ...value.abandoned, enabled: v }, ...(v ? { captureContactOnStart: true } : {}) })}
        />
        {abandonedOn && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="crm-abandon-delay">Mark as abandoned after</Label>
              <OptionSelect<string>
                id="crm-abandon-delay"
                value={String(value.abandoned.delayMinutes)}
                onChange={(v) => v && set({ abandoned: { ...value.abandoned, delayMinutes: Number(v) as AbandonDelayMinutes } })}
                options={ABANDON_DELAY_OPTIONS.map((m) => ({ value: String(m), label: `${ABANDON_DELAY_LABELS[m]} without completing` }))}
              />
            </div>
            <WorkflowPicker
              id="crm-abandon-workflow"
              label="Start this Workflow"
              value={value.abandoned.workflowId}
              onChange={(id) => set({ abandoned: { ...value.abandoned, workflowId: id } })}
              workflows={workflows}
              subAccountId={subAccountId}
              error={errors["crm.abandoned.workflowId"]}
              help={
                <>
                  Use <code className="text-caption">{"{{checkout.resumeLink}}"}</code> in its emails for a secure link back to this checkout. Workflows with the <strong>Checkout abandoned</strong> trigger also run.
                </>
              }
            />
            <TagsField label="Tags when abandoned" value={value.abandoned.tags} onChange={(t) => set({ abandoned: { ...value.abandoned, tags: t } })} />
          </>
        )}
      </Group>

      <Group title="Purchase completed" summary={value.completed.tags.length || value.completed.workflowId ? "Actions set" : "No actions"}>
        <TagsField label="Tags when the purchase completes" value={value.completed.tags} onChange={(t) => set({ completed: { ...value.completed, tags: t } })} />
        <SwitchRow
          id="crm-remove-abandoned"
          label="Remove the abandoned-checkout tags"
          hint={value.abandoned.tags.length ? `Removes: ${value.abandoned.tags.join(", ")}` : "Applies once you add abandoned tags."}
          checked={value.completed.removeAbandonedTags}
          onChange={(v) => set({ completed: { ...value.completed, removeAbandonedTags: v } })}
        />
        <WorkflowPicker
          id="crm-complete-workflow"
          label="Start this Workflow"
          value={value.completed.workflowId}
          onChange={(id) => set({ completed: { ...value.completed, workflowId: id } })}
          workflows={workflows}
          subAccountId={subAccountId}
          error={errors["crm.completed.workflowId"]}
          help={<>Workflows with the <strong>Checkout completed</strong> trigger also run.</>}
        />
        <TagsField label="Tags when an Order Bump is bought" value={value.bumpPurchasedTags} onChange={(t) => set({ bumpPurchasedTags: t })} />
        <TagsField label="Tags when a discount code is used" value={value.couponUsedTags} onChange={(t) => set({ couponUsedTags: t })} />
      </Group>
    </div>
  );
}

/* --------------------------------- pieces --------------------------------- */

function Group({ title, summary, defaultOpen, children }: { title: string; summary: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const id = useId();
  return (
    <div className="rounded-xl border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-body-sm">{title}</span>
          <span className="text-muted-foreground block truncate text-caption">{summary}</span>
        </span>
        <ChevronDown className={cn("text-muted-foreground size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-3 border-t px-3 py-3">
          {children}
        </div>
      )}
    </div>
  );
}

function SwitchRow({ id, label, hint, checked, disabled, onChange }: { id: string; label: string; hint?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-body-sm">{label}</Label>
        {hint && <p className="text-muted-foreground text-caption">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function TagsField({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: string[]; onChange: (tags: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const id = useId();
  const full = value.length >= MAX_CHECKOUT_TAGS;
  function add() {
    const t = draft.replace(/\s+/g, " ").trim().slice(0, 60);
    setDraft("");
    if (!t || value.some((v) => sameTag(v, t)) || full) return;
    onChange([...value, t]);
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {value.map((tag) => (
            <li key={tag} className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium">
              {tag}
              <button type="button" disabled={disabled} onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove tag ${tag}`} className="opacity-70 hover:opacity-100">
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          disabled={disabled || full}
          maxLength={60}
          placeholder={full ? `Up to ${MAX_CHECKOUT_TAGS} tags` : "Type a tag and press Enter"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={add} disabled={disabled || full || !draft.trim()} aria-label={`Add to ${label}`}>
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      {hint && <p className="text-muted-foreground text-caption">{hint}</p>}
    </div>
  );
}

export function WorkflowPicker({
  id,
  label,
  value,
  onChange,
  workflows,
  subAccountId,
  error,
  help,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  workflows: WorkflowOptionDTO[];
  subAccountId: string;
  error?: string;
  help?: React.ReactNode;
}) {
  const current = value ? workflows.find((w) => w.id === value) ?? null : null;
  // New picks: active Workflows only. A saved pick that's no longer active
  // stays visible (and labelled) instead of silently disappearing.
  const options = workflows
    .filter((w) => w.status === "active" || w.id === value)
    .map((w) => ({ value: w.id, label: w.status === "active" ? w.name : `${w.name} (${w.status} — won't run)` }));
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <OptionSelect<string> id={id} value={value} onChange={onChange} options={options} noneLabel="No Workflow" aria-invalid={!!error} />
      {value && !current && <p className="text-destructive text-caption">The selected Workflow was deleted. Choose another.</p>}
      {current && current.status !== "active" && (
        <p className="flex items-center gap-2 text-caption">
          <StatusPill tone="warning">Inactive</StatusPill> Activate it in Workflows or it won&apos;t run.
        </p>
      )}
      {error && <p className="text-destructive text-caption">{error}</p>}
      <p className="text-muted-foreground text-caption">
        {help} <Link href={`/sa/${subAccountId}/workflows`} className="underline">Open Workflows</Link>
      </p>
    </div>
  );
}
