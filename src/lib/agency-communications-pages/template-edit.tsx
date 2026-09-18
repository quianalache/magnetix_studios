"use client";

import { use } from "react";
import { AgencyEmailTemplateEditor } from "@/components/agency-communications/agency-email-template-editor";

export default function EditAgencyEmailTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AgencyEmailTemplateEditor templateId={id} />;
}
