"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Settings2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { subscribeToForms } from "@/lib/firestore/forms";
import type { LeadForm } from "@/types/forms";

/**
 * Form element's Settings field editor (real user QA blocker — the Form
 * element previously asked for a raw Magnetix Form ID, "unacceptable
 * customer UX" per that task). A Puck `custom` field (`type: "custom"`,
 * same proven pattern `BackgroundFieldEditor`/`StyleFieldEditor` already
 * establish — see their own doc comments) bound to the Form component's
 * existing `formId: string` prop — the STORED value/shape is completely
 * unchanged (still a flat string id, so every already-persisted page with
 * a Form element keeps working with zero migration), only how it's EDITED
 * changes.
 *
 * DATA SOURCE (task's explicit instruction — "reuse the existing Magnetix
 * Forms data/service architecture, do not invent a second Forms collection/
 * query system"): `subscribeToForms` is the exact same client-SDK Firestore
 * subscription the real Forms list page (`(dashboard)/sa/[subAccountId]/
 * forms/page.tsx`) already uses — same collection, same
 * `where("subAccountId", "==", ...)` scoping, same security rules. This is
 * a genuine reuse, not a parallel query path, and respects existing
 * permissions/tenant isolation exactly as-is (no admin-bypass route
 * involved at all, unlike `resolve-form/route.ts`'s Admin-SDK single-doc
 * resolver, which this field editor does NOT use).
 *
 * SUB-ACCOUNT SCOPE: Puck's own `CustomFieldRender` signature
 * (`{field, name, id, value, onChange, readOnly}` — confirmed in the
 * installed 0.23.0 package's types) does not carry `puck.metadata` the way
 * a component's `render` function does, so this field can't read
 * `subAccountId` from Puck itself. It instead reads `useOptionalSubAccount()`
 * — the SAME context every other component in this route tree already
 * relies on (`new-builder/page.tsx`, the Pages & Funnels dashboard, etc.):
 * this field editor mounts inside `overrides.fields`, which is part of the
 * HOST document tree (not the canvas iframe), so it sits inside the exact
 * same `SubAccountProvider` the rest of the authenticated route does. The
 * "optional" variant (not the throwing `useSubAccount()`) so this same
 * component doesn't crash the unauthenticated QA harness
 * (`pages-funnels-new-builder-shell`), which has no provider — it shows a
 * clear "can't load forms here" state instead in that case.
 */
export function FormFieldEditor({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const sub = useOptionalSubAccount();
  const [forms, setForms] = useState<LeadForm[] | null>(null);

  useEffect(() => {
    if (!sub?.agencyId || !sub.subAccountId) return;
    const unsub = subscribeToForms(
      { agencyId: sub.agencyId, subAccountId: sub.subAccountId },
      setForms
    );
    return () => unsub();
  }, [sub?.agencyId, sub?.subAccountId]);

  const formId = value ?? "";

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">Choose Form</Label>

      {!sub ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
          Forms aren&apos;t available in this preview context.
        </p>
      ) : forms === null ? (
        <div className="text-muted-foreground flex items-center gap-2 rounded-md border p-2.5 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading forms…
        </div>
      ) : forms.length === 0 ? (
        <div className="border-border bg-muted/40 flex flex-col items-start gap-2 rounded-md border border-dashed p-3">
          <p className="text-muted-foreground text-xs">No forms yet</p>
          <a
            href={sub.saPath("/forms")}
            target="_blank"
            rel="noreferrer"
            className="text-primary flex items-center gap-1 text-xs font-medium hover:underline"
          >
            <FileText className="h-3.5 w-3.5" /> Create a Form
          </a>
        </div>
      ) : (
        <>
          <select
            value={formId}
            onChange={(e) => onChange(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
          >
            <option value="">Select a form…</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
          <a
            href={sub.saPath("/forms")}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <Settings2 className="h-3 w-3" /> Manage Forms
          </a>
        </>
      )}
    </div>
  );
}
