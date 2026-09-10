"use client";

import { EmailTemplateEditor } from "@/components/email-authoring/email-template-editor";

/** No draft exists yet — the editor creates one on first Save. */
export default function NewEmailTemplatePage() {
  return <EmailTemplateEditor />;
}
