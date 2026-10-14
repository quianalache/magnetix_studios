"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import {
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import {
  TemplateEditor,
  type TemplateFormValues,
} from "@/components/automations/template-editor";
import type { MessageTemplateDoc } from "@/types";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";

export default function EditTemplatePage() {
  const params = useParams<{ templateId: string }>();
  const id = params.templateId;
  const router = useRouter();
  const { isAdmin, saPath, loading: subLoading } = useSubAccount();
  const [template, setTemplate] = useState<MessageTemplateDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(getFirebaseDb(), "message_templates", id),
      (snap) => {
        if (!snap.exists()) {
          setTemplate(null);
          setLoading(false);
          return;
        }
        const data = snap.data() as MessageTemplateDoc;
        // This page is SMS-only now — a bookmark or old link to what used
        // to be an email template here still needs to land somewhere real,
        // not a 404. Same id, same record: just a different route.
        if (data.type === "email") {
          router.replace(saPath(`/email/templates/${id}?source=legacy`));
          return;
        }
        setTemplate(data);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [id, router, saPath]);

  async function handleSubmit(values: TemplateFormValues) {
    await updateDoc(doc(getFirebaseDb(), "message_templates", id), {
      name: values.name,
      subject: values.type === "email" ? values.subject : null,
      body: values.body,
      updatedAt: serverTimestamp(),
    });
    toast.success("Template saved.");
  }

  const back = (
    <Link href={saPath("/templates")} className="inline-flex items-center gap-1 hover:text-foreground">
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      Back to SMS Templates
    </Link>
  );

  if (loading || subLoading) {
    return <PageShellLoading width="form" />;
  }

  if (!template) {
    return (
      <PageShell width="form">
        <SystemEmptyState
          icon={FileText}
          title="Template not found"
          action={
            <Button variant="outline" size="sm" render={<Link href={saPath("/templates")} />}>
              Back to SMS Templates
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="form">
      <PageHeader breadcrumbs={back} title={template.name} description="SMS template" />

      <TemplateEditor
        initial={{
          type: template.type,
          name: template.name,
          subject: template.subject ?? "",
          body: template.body,
        }}
        lockType
        submitLabel={isAdmin ? "Save changes" : "Read-only"}
        onSubmit={handleSubmit}
      />
    </PageShell>
  );
}
