"use client";

import { useEffect, useState } from "react";
import { PublicForm } from "@/components/forms/public-form";
import { defaultFormFields, defaultFormSettings } from "@/types/forms";
import type { LeadForm } from "@/types/forms";
import type { PuckPageMetadata, StyleConfig } from "@/types/pages-funnels-puck";
import {
  resolveBaseStyleProps,
  resolveResponsiveCss,
} from "@/lib/pages-funnels/puck/style";

/**
 * CLIENT/EDITOR variant of the Form element (master spec §10/§11) — used
 * only by `clientPuckConfig` (config.tsx). Fetches the referenced
 * `LeadForm` on demand via the production resolver API route
 * (`/api/pages-funnels/puck/resolve-form`), since the editor canvas is a
 * client component and can't do a synchronous Admin SDK read. This is
 * DISTINCT from `form-server.tsx` (the `<Render>`/public variant, which
 * reads pre-resolved data from `puck.metadata` instead of fetching) — see
 * that file's doc comment for why the split exists.
 *
 * References the real Magnetix Form — no duplicated field schema, no
 * duplicated submission logic. `PublicForm` (the real submission engine)
 * is rendered as-is.
 *
 * System A (master spec §24.8, "Form container" spacing/border/radius
 * target): `id`/`style` wrap EVERY render state (loading/not-found/
 * error/loaded), not just the loaded card, so per-device visibility hides
 * the whole element regardless of its current fetch state.
 */
export function FormElementClientRender({
  id,
  formId,
  formName,
  style,
}: {
  id: string;
  formId: string;
  formName: string;
  style?: StyleConfig;
  // Accepted (not read) purely so this component's prop shape matches
  // `form-server.tsx`'s `FormElementServerRender` — `config.tsx`'s shared
  // factory passes `metadata` to whichever Form variant it's given without
  // caring which one actually uses it. This variant fetches instead.
  metadata?: PuckPageMetadata;
}) {
  const [form, setForm] = useState<LeadForm | null>(null);
  const [status, setStatus] = useState<
    "idle" | "loading" | "found" | "not-found" | "error"
  >("idle");

  useEffect(() => {
    if (!formId) {
      setForm(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    fetch(
      `/api/pages-funnels/puck/resolve-form?formId=${encodeURIComponent(formId)}`
    )
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: LeadForm | null) => {
        if (cancelled) return;
        setForm(data);
        setStatus(data ? "found" : "not-found");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  const responsiveCss = resolveResponsiveCss(id, style);
  const baseStyle = resolveBaseStyleProps(style);

  let body: React.ReactNode;
  if (!formId) {
    body = <FormNotConfigured />;
  } else if (status === "loading" || status === "idle") {
    body = <FormLoading />;
  } else if (status === "not-found") {
    body = <FormNotFound label={formName || formId} />;
  } else if (status === "error" || !form) {
    body = <FormError />;
  } else {
    body = (
      <div
        className="border-border bg-card rounded-2xl border p-4 shadow-sm"
        style={baseStyle}
      >
        <PublicForm form={form} />
      </div>
    );
  }

  return (
    <div id={id}>
      {responsiveCss && (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      )}
      {body}
    </div>
  );
}

/** POC-proven demo form, built from the SAME factories the real Forms
 *  feature uses (defaultFormFields/defaultFormSettings) — kept as an
 *  exported helper (not just inline) so the production harness (§18) can
 *  demonstrate a real, interactive PublicForm without depending on a real
 *  formId existing in Firestore. Its id ("puck-demo-form") does not exist
 *  in the real forms collection, so a submit attempt fails safely (404)
 *  rather than writing anything real — never used when a real formId is set. */
export function demoLeadForm(): LeadForm {
  return {
    id: "puck-demo-form",
    name: "Puck Foundation Demo Form",
    slug: "puck-foundation-demo-form",
    fields: defaultFormFields(),
    settings: defaultFormSettings(),
    agencyId: "demo",
    subAccountId: "demo",
    createdByUid: "demo",
    enabled: true,
    submissionCount: 0,
    createdAt: null,
    updatedAt: null,
  };
}

function FormNotConfigured() {
  return (
    <div className="border-border bg-muted text-muted-foreground flex h-24 items-center justify-center rounded-2xl border border-dashed text-sm">
      No form selected
    </div>
  );
}
function FormLoading() {
  return (
    <div className="border-border bg-muted text-muted-foreground flex h-24 items-center justify-center rounded-2xl border text-sm">
      Loading form…
    </div>
  );
}
function FormNotFound({ label }: { label: string }) {
  return (
    <div className="border-destructive/50 bg-destructive/10 text-destructive flex h-24 items-center justify-center rounded-2xl border border-dashed text-sm">
      Form &ldquo;{label}&rdquo; not found.
    </div>
  );
}
function FormError() {
  return (
    <div className="border-destructive/50 bg-destructive/10 text-destructive flex h-24 items-center justify-center rounded-2xl border text-sm">
      Couldn&apos;t load form.
    </div>
  );
}
