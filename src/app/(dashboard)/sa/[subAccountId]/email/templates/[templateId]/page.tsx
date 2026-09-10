"use client";

import { useParams } from "next/navigation";
import { EmailTemplateEditor } from "@/components/email-authoring/email-template-editor";

export default function EditEmailTemplatePage() {
  const params = useParams<{ templateId: string }>();
  return <EmailTemplateEditor templateId={params.templateId} />;
}
