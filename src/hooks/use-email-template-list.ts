"use client";

import { useEffect, useState } from "react";
import {
  subscribeToEmailTemplates,
  type EmailTemplateSummary,
} from "@/lib/email/template-library";

/**
 * Live Email Template list for a sub-account — thin hook wrapper around
 * `subscribeToEmailTemplates` so the Library page and the Email landing
 * page (template count) share one subscription shape.
 */
export function useEmailTemplateList(subAccountId: string) {
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subAccountId) return;
    setLoading(true);
    const unsub = subscribeToEmailTemplates(subAccountId, (list) => {
      setTemplates(list);
      setLoading(false);
    });
    return () => unsub();
  }, [subAccountId]);

  return { templates, loading };
}
