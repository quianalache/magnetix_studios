"use client";

import { useEffect, useState, type ReactNode } from "react";
import { EmailTemplateContext } from "@/context/email-template-context";
import type { EmailTemplateSummary, LoadedTemplate } from "@/lib/email/template-library";
import type { BroadcastContent } from "@/types/broadcast-content";

/** Agency templates load through the owner-only agency API — never the
 *  tenant client-Firestore loader (which can't see `agencies/**`). */
async function loadAgencyTemplate(summary: EmailTemplateSummary): Promise<LoadedTemplate | null> {
  const res = await fetch(`/api/agency/email-templates/${encodeURIComponent(summary.id)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    template?: { name: string; subject: string; preheader: string | null; content: BroadcastContent };
  };
  if (!data.template) return null;
  return { source: "visual", ...data.template };
}

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

  return (
    <EmailTemplateContext.Provider value={{ templates, loading, loadTemplate: loadAgencyTemplate }}>
      {children}
    </EmailTemplateContext.Provider>
  );
}
