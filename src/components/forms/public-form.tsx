"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultFormAppearance,
  defaultSmsConsentText,
  evaluateCondition,
  fieldInnerGapPx,
  normalizeFieldSpacingPx,
  type FormAppearance,
  type FormField,
  type LeadForm,
} from "@/types/forms";
import { inputElementStyle, labelElementStyle } from "@/lib/forms/appearance";
import type { ContactAttribution } from "@/types/contacts";
import {
  readAttributionFromBrowser,
  trackLeadEvent,
} from "@/lib/attribution";

interface PublicFormProps {
  form: LeadForm;
}

/**
 * Groups fields into steps by splitting on `page_break` markers (which are
 * themselves excluded from every step's field list) — `hidden` fields are
 * dropped too since they never render and their value is captured
 * separately on mount regardless of step. A form with zero page breaks
 * yields exactly one step, so single-step forms render identically to
 * before this feature existed (no progress bar, no Back/Next).
 */
function groupIntoSteps(fields: FormField[]): FormField[][] {
  const steps: FormField[][] = [[]];
  for (const f of fields) {
    if (f.type === "hidden") continue;
    if (f.type === "page_break") {
      steps.push([]);
      continue;
    }
    steps[steps.length - 1].push(f);
  }
  return steps;
}


/** variant + extra classes so an "outline"/"text" button reads in the
 *  operator's accent colour rather than the neutral default — the base
 *  variants alone don't touch colour, only border/background treatment. */
function buttonAppearance(
  style: NonNullable<FormAppearance["buttonStyle"]>,
): { variant: "default" | "outline" | "ghost"; className: string } {
  if (style === "outline") {
    return {
      variant: "outline",
      className: "border-primary text-primary hover:bg-primary/10 hover:text-primary",
    };
  }
  if (style === "text") {
    return { variant: "ghost", className: "text-primary hover:bg-primary/10 hover:text-primary" };
  }
  return { variant: "default", className: "" };
}

/**
 * "Textbox list" field — a repeatable set of short free-text rows (e.g.
 * "list your goals, one per line"). Stored as one flat string in the
 * parent's `values[id]`, entries joined by "\n" (not ", " like
 * checkboxes/multiselect — free-text entries can plausibly contain
 * commas themselves). This component just splits/joins around that edge
 * so the parent never needs to know rows exist.
 */
function TextboxListField({
  value,
  onChange,
  placeholder,
  inputStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputStyle: CSSProperties;
}) {
  const entries = value ? value.split("\n") : [""];

  function updateEntry(i: number, v: string) {
    const next = [...entries];
    next[i] = v;
    onChange(next.join("\n"));
  }
  function addEntry() {
    onChange([...entries, ""].join("\n"));
  }
  function removeEntry(i: number) {
    const next = entries.filter((_, idx) => idx !== i);
    onChange((next.length ? next : [""]).join("\n"));
  }

  return (
    <div className="space-y-1.5">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={entry}
            onChange={(e) => updateEntry(i, e.target.value)}
            placeholder={placeholder}
            className="text-[1em] md:text-[1em]"
            style={inputStyle}
          />
          {entries.length > 1 && (
            <button
              type="button"
              onClick={() => removeEntry(i)}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label="Remove entry"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addEntry}
        className="flex items-center gap-1 text-[0.8em] font-medium text-primary hover:underline"
      >
        <Plus className="h-3 w-3" /> Add another
      </button>
    </div>
  );
}

export function PublicForm({ form }: PublicFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of form.fields) initial[f.id] = "";
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{
    message: string;
    redirectUrl: string | null;
  } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const attributionRef = useRef<ContactAttribution | null>(null);
  const steps = groupIntoSteps(form.fields);
  const [stepIndex, setStepIndex] = useState(0);
  const isLastStep = stepIndex === steps.length - 1;
  const appearance = form.settings.appearance ?? defaultFormAppearance();
  const formGapPx = normalizeFieldSpacingPx(appearance.fieldSpacing);
  const fieldGapPx = fieldInnerGapPx(formGapPx);
  const fieldGapStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: `${fieldGapPx}px`,
  };
  const inputStyle = inputElementStyle(appearance);
  const labelStyle = labelElementStyle(appearance);
  const btn = buttonAppearance(appearance.buttonStyle ?? "fill");

  // Snapshot attribution on mount — before the user navigates, refreshes, or
  // the URL is rewritten by a redirect after submission.
  useEffect(() => {
    attributionRef.current = readAttributionFromBrowser();
  }, []);

  // Hidden fields auto-capture a URL query param on mount — invisible to
  // the visitor, submitted like any other field.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const captured: Record<string, string> = {};
    for (const f of form.fields) {
      if (f.type === "hidden" && f.queryParam) {
        captured[f.id] = params.get(f.queryParam) ?? "";
      }
    }
    if (Object.keys(captured).length > 0) {
      setValues((prev) => ({ ...prev, ...captured }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setValue(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  // Checkboxes store their selection as one comma-joined string (same
  // Record<string, string> shape every other field uses) rather than an
  // array — split/rejoin on toggle.
  function toggleCheckboxOption(id: string, option: string, checked: boolean) {
    setValues((prev) => {
      const current = (prev[id] ?? "")
        .split(", ")
        .map((s) => s.trim())
        .filter(Boolean);
      const next = checked
        ? [...current, option]
        : current.filter((o) => o !== option);
      return { ...prev, [id]: next.join(", ") };
    });
  }

  function validateFields(fields: FormField[]): Record<string, string> {
    const next: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "text_block" || f.type === "hidden") continue; // Never answerable by the visitor.
      if (!evaluateCondition(f.visibleIf, values)) continue; // Conditionally hidden right now.
      if (f.type === "sms_consent") {
        // Consent is opt-in: a value of "true" means checked. Only blocks
        // submission when the operator marked the consent field required.
        if (f.required && values[f.id] !== "true") {
          next[f.id] = "Please tick this box to continue";
        }
        continue;
      }
      if (f.required && !values[f.id]?.trim()) {
        next[f.id] = `${f.label} is required`;
      } else if (f.type === "email" && values[f.id]) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f.id])) {
          next[f.id] = "Enter a valid email";
        }
      } else if (f.type === "url" && values[f.id]) {
        try {
          new URL(values[f.id]);
        } catch {
          next[f.id] = "Enter a valid link (include https://)";
        }
      } else if (f.type === "date" && values[f.id]) {
        if (Number.isNaN(Date.parse(values[f.id]))) {
          next[f.id] = "Enter a valid date";
        }
      } else if (f.type === "number" && values[f.id]) {
        if (!/^-?\d+(\.\d+)?$/.test(values[f.id].trim())) {
          next[f.id] = "Enter a valid number";
        }
      } else if (f.type === "currency" && values[f.id]) {
        if (!/^\d+(\.\d{1,2})?$/.test(values[f.id].trim())) {
          next[f.id] = "Enter a valid amount (e.g. 25 or 25.00)";
        }
      }
    }
    return next;
  }

  function handleNext() {
    const stepErrors = validateFields(steps[stepIndex]);
    setErrors((prev) => ({ ...prev, ...stepErrors }));
    if (Object.keys(stepErrors).length > 0) return;
    setStepIndex((s) => Math.min(s + 1, steps.length - 1));
  }

  function handleBack() {
    setStepIndex((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    const stepErrors = validateFields(steps[stepIndex]);
    setErrors((prev) => ({ ...prev, ...stepErrors }));
    if (Object.keys(stepErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/${form.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values,
          attribution: attributionRef.current,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        thankYouMessage?: string;
        redirectUrl?: string | null;
      };
      if (!res.ok || !data.ok) {
        setApiError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Fire the Meta Pixel Lead event before any redirect — once the
      // browser navigates, the pixel script unloads with the page.
      trackLeadEvent({
        utmCampaign: attributionRef.current?.utmCampaign ?? null,
      });
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      setSuccess({
        message: data.thankYouMessage ?? "Thanks — we'll be in touch shortly.",
        redirectUrl: null,
      });
    } catch (err) {
      console.error(err);
      setApiError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-5 w-5" />
        </div>
        <p className="text-[1em] font-medium">{success.message}</p>
      </div>
    );
  }

  function renderField(f: FormField) {
    if (f.type === "text_block") {
      return (
        <div key={f.id} className="space-y-1">
          {f.label.trim() && (
            <h3 className="text-[1em] font-semibold">{f.label}</h3>
          )}
          {f.content?.trim() && (
            <p className="text-[1em] whitespace-pre-line text-muted-foreground">
              {f.content}
            </p>
          )}
        </div>
      );
    }
    if (f.type === "sms_consent") {
      return (
        <div key={f.id} style={fieldGapStyle}>
          <label className="flex cursor-pointer items-start gap-2 text-[0.875em] leading-snug text-muted-foreground">
            <input
              type="checkbox"
              checked={values[f.id] === "true"}
              onChange={(e) => setValue(f.id, e.target.checked ? "true" : "")}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
              aria-invalid={!!errors[f.id]}
            />
            <span>
              {f.consentText?.trim() || defaultSmsConsentText()}
              {f.required && <span className="text-destructive"> *</span>}
            </span>
          </label>
          {errors[f.id] && (
            <p className="text-[0.75em] text-destructive">{errors[f.id]}</p>
          )}
        </div>
      );
    }
    return (
      <div key={f.id} style={fieldGapStyle}>
        <Label htmlFor={f.id} className="text-[0.875em]" style={labelStyle}>
          {f.label}
          {f.required && <span className="text-destructive">*</span>}
        </Label>
        {f.type === "textarea" ? (
          <Textarea
            id={f.id}
            value={values[f.id] ?? ""}
            onChange={(e) => setValue(f.id, e.target.value)}
            placeholder={f.placeholder}
            rows={4}
            aria-invalid={!!errors[f.id]}
            className="text-[1em] md:text-[1em]"
            style={inputStyle}
          />
        ) : f.type === "radio" ? (
          <div className="space-y-1.5">
            {f.options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 text-[0.875em]"
              >
                <input
                  type="radio"
                  name={f.id}
                  checked={values[f.id] === opt}
                  onChange={() => setValue(f.id, opt)}
                  className="h-4 w-4 shrink-0 cursor-pointer"
                />
                {opt}
              </label>
            ))}
          </div>
        ) : f.type === "checkboxes" ? (
          <div className="space-y-1.5">
            {f.options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 text-[0.875em]"
              >
                <input
                  type="checkbox"
                  checked={(values[f.id] ?? "").split(", ").includes(opt)}
                  onChange={(e) =>
                    toggleCheckboxOption(f.id, opt, e.target.checked)
                  }
                  className="h-4 w-4 shrink-0 cursor-pointer"
                />
                {opt}
              </label>
            ))}
          </div>
        ) : f.type === "select" ? (
          <select
            id={f.id}
            value={values[f.id] ?? ""}
            onChange={(e) => setValue(f.id, e.target.value)}
            className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-[0.875em] outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
            style={inputStyle}
          >
            <option value="">— Choose —</option>
            {f.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : f.type === "multiselect" ? (
          <select
            id={f.id}
            multiple
            value={(values[f.id] ?? "").split(", ").filter(Boolean)}
            onChange={(e) =>
              setValue(
                f.id,
                Array.from(e.target.selectedOptions, (o) => o.value).join(", "),
              )
            }
            className="flex h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-[0.875em] outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
            style={inputStyle}
          >
            {f.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : f.type === "textbox_list" ? (
          <TextboxListField
            value={values[f.id] ?? ""}
            onChange={(v) => setValue(f.id, v)}
            placeholder={f.placeholder}
            inputStyle={inputStyle}
          />
        ) : f.type === "currency" ? (
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[0.875em] text-muted-foreground">
              $
            </span>
            <Input
              id={f.id}
              type="number"
              step="0.01"
              min="0"
              value={values[f.id] ?? ""}
              onChange={(e) => setValue(f.id, e.target.value)}
              placeholder={f.placeholder}
              aria-invalid={!!errors[f.id]}
              className="pl-6 text-[1em] md:text-[1em]"
              style={inputStyle}
            />
          </div>
        ) : (
          <Input
            id={f.id}
            type={
              f.type === "email"
                ? "email"
                : f.type === "phone"
                  ? "tel"
                  : f.type === "url"
                    ? "url"
                    : f.type === "date"
                      ? "date"
                      : f.type === "number"
                        ? "number"
                        : "text"
            }
            value={values[f.id] ?? ""}
            onChange={(e) => setValue(f.id, e.target.value)}
            placeholder={f.placeholder}
            aria-invalid={!!errors[f.id]}
            className="text-[1em] md:text-[1em]"
            style={inputStyle}
          />
        )}
        {errors[f.id] && (
          <p className="text-[0.75em] text-destructive">{errors[f.id]}</p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* Permanent (non-editable) rule for placeholder colour — React's
          inline `style` prop can't target the `::placeholder` pseudo-
          element, so this reads the CSS custom property `appearanceStyle`
          sets on the page wrapper instead. `!important` because it only
          fires when the operator explicitly chose a placeholder colour
          (the var is simply absent otherwise), same "operator override
          must win" reasoning as the customCss escape hatch below. */}
      <style>{`.ls-form ::placeholder { color: var(--ls-placeholder-color, inherit) !important; opacity: 1; }`}</style>
      <form
        className="ls-form"
        style={{ display: "flex", flexDirection: "column", gap: `${formGapPx}px` }}
        onSubmit={handleSubmit}
      >
      {steps.length > 1 && (
        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${((stepIndex + 1) / steps.length) * 100}%`,
              }}
            />
          </div>
          <p className="text-[0.75em] text-muted-foreground">
            Step {stepIndex + 1} of {steps.length}
          </p>
        </div>
      )}

      {steps[stepIndex]
        .filter((f) => evaluateCondition(f.visibleIf, values))
        .map(renderField)}

      {apiError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[0.875em] text-destructive">
          {apiError}
        </div>
      )}

      <div className="flex items-center gap-2">
        {stepIndex > 0 && (
          <Button
            type="button"
            variant="outline"
            className="flex-1 text-[1em]"
            onClick={handleBack}
            disabled={submitting}
          >
            Back
          </Button>
        )}
        {isLastStep ? (
          <Button
            type="submit"
            variant={btn.variant}
            className={`flex-1 text-[1em] ${btn.className}`}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit"
            )}
          </Button>
        ) : (
          <Button
            type="button"
            variant={btn.variant}
            className={`flex-1 text-[1em] ${btn.className}`}
            onClick={handleNext}
          >
            Next
          </Button>
        )}
      </div>
      </form>
    </>
  );
}
