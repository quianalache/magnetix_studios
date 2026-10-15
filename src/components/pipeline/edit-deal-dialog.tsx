"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/system/option-select";
import { useSubAccount } from "@/context/sub-account-context";
import { ContactPicker } from "@/components/quotes/contact-picker";
import { CustomFieldInputs } from "@/components/custom-fields/custom-field-inputs";
import { subscribeToCustomFields } from "@/lib/firestore/custom-fields";
import { validateCustomFieldValues } from "@/lib/custom-fields/validation";
import {
  DEAL_PRIORITIES,
  type Deal,
  type DealPriority,
  type PipelineStageId,
} from "@/types/deals";
import { useDealFormOptions } from "@/hooks/use-deal-form-options";
import { dealPipelineId, findStage } from "@/types/pipelines";
import { Textarea } from "@/components/ui/textarea";
import type { Contact } from "@/types/contacts";
import type { CustomFieldDef, CustomFieldValue } from "@/types/custom-fields";
import { GLOBAL_TERRITORY_ID, type TerritoryDoc } from "@/types";

const CURRENCIES = ["USD", "AUD", "EUR", "GBP", "CAD"];

interface EditDealDialogProps {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contact picker options; loaded on demand while open when omitted. */
  contacts?: Contact[];
  territories: TerritoryDoc[];
  onSaved?: () => void;
}

export function EditDealDialog({
  deal,
  open,
  onOpenChange,
  contacts: contactsProp,
  territories,
  onSaved,
}: EditDealDialogProps) {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const { pipelines, contacts } = useDealFormOptions({ open, contacts: contactsProp });
  const [pipelineId, setPipelineId] = useState("");
  const [description, setDescription] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const pipeline = pipelines?.find((p) => p.id === pipelineId);
  // Active stages of the selected pipeline, plus the deal's current stage
  // when it's archived (so the form can show where the deal sits today).
  const stages = pipeline
    ? pipeline.stages.filter(
        (st) => !st.archived || (deal && pipelineId === dealPipelineId(deal) && st.id === deal.stageId),
      )
    : [];
  // Changing the contact re-homes the deal's territory, which is an
  // admin-only action when scoping is on. Collaborators see it read-only.
  const canEditContact = !scopingOn || isAdmin;

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [stageId, setStageId] = useState<PipelineStageId>("new");
  const [priority, setPriority] = useState<DealPriority>("medium");
  const [contactId, setContactId] = useState("");
  const [cfDefs, setCfDefs] = useState<CustomFieldDef[]>([]);
  const [cfValues, setCfValues] = useState<Record<string, CustomFieldValue>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && deal) {
      setTitle(deal.title);
      setValue(deal.value ? String(deal.value) : "");
      setCurrency(deal.currency || "USD");
      setStageId(deal.stageId);
      setPipelineId(dealPipelineId(deal));
      setDescription(deal.description ?? "");
      setExpectedCloseDate(deal.expectedCloseDate ?? "");
      setPriority(deal.priority ?? "medium");
      setContactId(deal.contactId);
      setCfValues(
        (deal.customFields ?? {}) as Record<string, CustomFieldValue>,
      );
      setErrors({});
    }
  }, [open, deal]);

  // Live custom-field definitions for deals (only while the sheet is open).
  useEffect(() => {
    if (!open || !subAccountId) {
      setCfDefs([]);
      return;
    }
    const unsub = subscribeToCustomFields(
      subAccountId,
      "deal",
      setCfDefs,
      () => {},
    );
    return () => unsub();
  }, [open, subAccountId]);

  const selectedContact = contacts.find((c) => c.id === contactId);

  const territoryNameById = new Map(territories.map((t) => [t.id, t.name]));
  const labelForTerritory = (id: string | null | undefined) =>
    !id || id === GLOBAL_TERRITORY_ID
      ? "Global"
      : (territoryNameById.get(id) ?? "Global");
  const territoryLabel = labelForTerritory(selectedContact?.territoryId);
  // Per-row territory chip in the contact picker — only when scoping is on.
  const contactTerritoryLabel = scopingOn
    ? (c: Contact) => labelForTerritory(c.territoryId)
    : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!deal) return;
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    if (!contactId) next.contactId = "Pick a contact";
    const pipelineChanged = pipelineId !== dealPipelineId(deal);
    if (!stageId || (pipeline && !findStage(pipeline, stageId))) {
      next.stageId = pipelineChanged
        ? "Choose a stage in the destination pipeline"
        : "Pick a stage";
    }
    const num = Number(value);
    if (value && (Number.isNaN(num) || num < 0)) next.value = "Enter a valid amount";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const cf = validateCustomFieldValues(cfValues, cfDefs);
    if (!cf.ok) {
      toast.error(cf.error);
      return;
    }

    setSaving(true);
    try {
      // Fields + stage in one PATCH — the server detects the stage change,
      // logs the move activity, and fires deal.updated (+ stage.changed /
      // won / lost) as needed.
      const base: Record<string, unknown> = {
        title: title.trim(),
        value: Number(value) || 0,
        currency,
        priority,
        stageId,
        description: description.trim() || null,
        expectedCloseDate: expectedCloseDate || null,
        customFields: cf.value,
      };
      if (pipelineChanged) base.pipelineId = pipelineId;
      // Only admins (or scoping-off) may re-home the contact. When they do,
      // the deal's territory follows the new contact. Collaborators send no
      // contact/territory change so the territoryId stays put (rules require
      // it). Re-deriving territory keeps the deal consistent with its contact.
      const contactChanged = contactId !== deal.contactId;
      if (canEditContact && contactChanged) {
        base.contactId = contactId;
        base.territoryId = selectedContact?.territoryId ?? GLOBAL_TERRITORY_ID;
      }
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(base),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't update deal. Try again.");
        return;
      }
      toast.success(pipelineChanged ? `Moved to ${pipeline?.name ?? "pipeline"}` : "Deal updated");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update deal. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit Deal</SheetTitle>
          <SheetDescription>
            Update the deal&apos;s details. Stage changes are logged on the
            contact&apos;s timeline.
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-4 p-4 pt-0" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-title">
              Deal title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="edit-deal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Website rebuild — Acme"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-caption text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="edit-deal-value">Value</Label>
              <Input
                id="edit-deal-value"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="5000"
                aria-invalid={!!errors.value}
              />
              {errors.value && (
                <p className="text-caption text-destructive">{errors.value}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-deal-currency">Currency</Label>
              <OptionSelect
                id="edit-deal-currency"
                className="w-28"
                value={currency}
                onChange={(v) => v && setCurrency(v)}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-deal-pipeline">Pipeline</Label>
              <OptionSelect
                id="edit-deal-pipeline"
                value={pipelineId || null}
                disabled={!pipelines}
                onChange={(v) => {
                  if (!v) return;
                  setPipelineId(v);
                  // Moving pipelines needs an explicit destination stage.
                  setStageId(deal && v === dealPipelineId(deal) ? deal.stageId : "");
                }}
                options={[
                  ...(pipelines && !pipeline && pipelineId
                    ? [{ value: pipelineId, label: "Current pipeline (archived)" }]
                    : []),
                  ...(pipelines ?? []).map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-deal-stage">Stage</Label>
              <OptionSelect
                id="edit-deal-stage"
                value={stageId || null}
                onChange={(v) => v && setStageId(v as PipelineStageId)}
                aria-invalid={!!errors.stageId}
                placeholder="Choose a stage…"
                options={stages.map((s) => ({ value: s.id, label: `${s.name}${s.archived ? " (archived)" : ""}` }))}
              />
              {errors.stageId && (
                <p className="text-caption text-destructive">{errors.stageId}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-close">Expected closing date</Label>
            <Input
              id="edit-deal-close"
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-description">Description</Label>
            <Textarea
              id="edit-deal-description"
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-priority">Priority</Label>
            <OptionSelect
              id="edit-deal-priority"
              value={priority}
              onChange={(v) => v && setPriority(v as DealPriority)}
              options={DEAL_PRIORITIES.map((p) => ({ value: p.id, label: p.label }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-deal-contact">
              Contact <span className="text-destructive">*</span>
            </Label>
            {canEditContact ? (
              <ContactPicker
                id="edit-deal-contact"
                contacts={contacts}
                value={contactId}
                onChange={setContactId}
                title="Pick a contact"
                territoryLabel={contactTerritoryLabel}
              />
            ) : (
              <div className="flex h-9 items-center rounded-control border border-border bg-surface-sunken px-3 text-body-sm">
                {selectedContact?.name || selectedContact?.email || "Contact"}
              </div>
            )}
            {errors.contactId && (
              <p className="text-caption text-destructive">{errors.contactId}</p>
            )}
          </div>

          {scopingOn && (
            <div className="space-y-1.5">
              <Label>Territory</Label>
              <div className="flex h-9 items-center gap-2 rounded-control border border-border bg-surface-sunken px-3 text-body-sm">
                <span className="font-medium">{territoryLabel}</span>
                <span className="text-caption text-muted-foreground">
                  · inherited from the contact
                </span>
              </div>
            </div>
          )}

          {cfDefs.length > 0 && (
            <div className="space-y-4 border-t border-border pt-4">
              <p className="text-overline font-semibold tracking-[0.12em] text-ink-tertiary uppercase">
                Custom fields
              </p>
              <CustomFieldInputs
                idPrefix="edit-deal-cf"
                defs={cfDefs}
                values={cfValues}
                onChange={setCfValues}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
