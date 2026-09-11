"use client";

import { useEmailTemplateContext } from "@/context/email-template-context";

/**
 * Live Email Template list for a sub-account — thin hook wrapper around
 * `subscribeToEmailTemplates` so the Library page and the Email landing
 * page (template count) share one subscription shape.
 */
export function useEmailTemplateList(subAccountId: string) {
  void subAccountId;
  return useEmailTemplateContext();
}
