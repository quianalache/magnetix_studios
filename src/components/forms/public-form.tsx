"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultSmsConsentText,
  evaluateCondition,
  type FormField,
  type LeadForm,
} from "@/types/forms";
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
        <div key={f.id} className="space-y-1.5">
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
      <div key={f.id} className="space-y-1.5">
        <Label htmlFor={f.id} className="text-[0.875em]">
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
          >
            <option value="">— Choose —</option>
            {f.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
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
                    : "text"
            }
            value={values[f.id] ?? ""}
            onChange={(e) => setValue(f.id, e.target.value)}
            placeholder={f.placeholder}
            aria-invalid={!!errors[f.id]}
            className="text-[1em] md:text-[1em]"
          />
        )}
        {errors[f.id] && (
          <p className="text-[0.75em] text-destructive">{errors[f.id]}</p>
        )}
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
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
          <Button type="submit" className="flex-1 text-[1em]" disabled={submitting}>
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
          <Button type="button" className="flex-1 text-[1em]" onClick={handleNext}>
            Next
          </Button>
        )}
      </div>
    </form>
  );
}
