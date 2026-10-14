"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  TemplateEditor,
  type TemplateFormValues,
} from "@/components/automations/template-editor";
import { TEMPLATE_PRESETS } from "@/lib/automations/template-presets";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SettingsSection } from "@/components/system/settings-section";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";

/**
 * Quick-start preset chips. The preset content lives in
 * `lib/automations/template-presets.ts` so server-side seeding (run on
 * sub-account creation) and this client-side "Start from a preset" UI use
 * the same source of truth. This page is SMS-only (2026-09-10) — email
 * templates have their own canonical library under Email — so email
 * presets are filtered out here even though the shared list still has them.
 */
const PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  values: TemplateFormValues;
}> = TEMPLATE_PRESETS.filter((p) => p.type === "sms").map((p) => ({
  id: p.id,
  label: p.label,
  description: p.description,
  values: {
    type: p.type,
    name: p.label,
    subject: p.subject,
    body: p.body,
  },
}));

const BLANK: TemplateFormValues = {
  type: "sms",
  name: "",
  subject: "",
  body: "",
};

export default function NewTemplatePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { agencyId, subAccountId, isAdmin, saPath, loading } = useSubAccount();
  const [initial, setInitial] = useState<TemplateFormValues>(BLANK);
  // The TemplateEditor only reads `initial` once (on mount) — bumping this
  // key remounts it with the new starting values when a preset is picked.
  const [editorKey, setEditorKey] = useState(0);

  function applyPreset(values: TemplateFormValues) {
    setInitial(values);
    setEditorKey((k) => k + 1);
  }

  if (!loading && !isAdmin) {
    return (
      <PageShell width="form">
        <SystemEmptyState
          title="Admins only"
          description="Only sub-account admins can manage templates."
          action={
            <Button variant="outline" size="sm" render={<Link href={saPath("/templates")} />}>
              Back
            </Button>
          }
        />
      </PageShell>
    );
  }

  async function handleSubmit(values: TemplateFormValues) {
    if (!user || !agencyId) {
      throw new Error("Not signed in.");
    }
    const ref = await addDoc(
      collection(getFirebaseDb(), "message_templates"),
      {
        type: values.type,
        name: values.name,
        subject: values.type === "email" ? values.subject : null,
        body: values.body,
        agencyId,
        subAccountId,
        createdByUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    );
    // Persist the doc id into the doc itself so server reads can use it
    // without a query (matches the pattern elsewhere in the codebase).
    const { updateDoc, doc } = await import("firebase/firestore");
    await updateDoc(doc(getFirebaseDb(), "message_templates", ref.id), {
      id: ref.id,
    });
    toast.success(`Template "${values.name}" created.`);
    router.push(saPath(`/templates/${ref.id}`));
  }

  return (
    <PageShell width="form">
      <PageHeader
        breadcrumbs={
          <Link href={saPath("/templates")} className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to SMS Templates
          </Link>
        }
        title="New SMS template"
        description={
          <>
            Write a body and use merge tags for personalisation. Building an email template?{" "}
            <Link href={saPath("/email/templates/new")} className="text-link underline-offset-2 hover:underline">
              Use the Email Template Library instead.
            </Link>
          </>
        }
      />

      <SettingsSection title="Start from a preset" description="One-click starting point. Edit anything below before saving.">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(p.values)}
              title={p.description}
            >
              <MessageSquare className="size-3.5" aria-hidden="true" />
              {p.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => applyPreset(BLANK)}
            className="text-muted-foreground"
            title="Start blank"
          >
            Clear
          </Button>
        </div>
      </SettingsSection>

      <TemplateEditor key={editorKey} initial={initial} submitLabel="Create template" onSubmit={handleSubmit} lockType />
    </PageShell>
  );
}
