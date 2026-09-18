"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EmailTemplateContext } from "@/context/email-template-context";
import type { EmailTemplateSummary } from "@/lib/email/template-library";

/**
 * Agency-scope sibling of EmailTemplateProvider — fetch-based instead of a
 * client Firestore listener (the agency owner has no client-readable path
 * into `agencies/**`, matching every other agency-owner surface in this
 * codebase), feeding the SAME `EmailTemplateContext` tenant's
 * `EmailTemplatePickerDialog`/`useEmailTemplateContext` already read from.
 * That component needed zero changes to work for Agency Communications.
 */
export function AgencyEmailTemplateProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agency/email-templates")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { templates?: EmailTemplateSummary[] } | null) => {
        if (cancelled) return;
        setTemplates(d?.templates ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <EmailTemplateContext.Provider value={{ templates, loading }}>{children}</EmailTemplateContext.Provider>;
}
