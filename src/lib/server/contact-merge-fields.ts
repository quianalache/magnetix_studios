import type { Contact } from "@/types/contacts";

/** Shared by manual linking and general merges. Consent restrictions always
 * survive, even when the caller selected a different primary identity. */
export function contactMergeFields(survivor: Omit<Contact, "id">, loser: Omit<Contact, "id">): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of ["name", "email", "phone", "company", "address", "source", "pipelineStage", "attribution", "metaUserId", "smsConsent"] as const) {
    if (!survivor[field] && loser[field] != null) patch[field] = loser[field];
  }
  patch.tags = Array.from(new Set([...(survivor.tags ?? []), ...(loser.tags ?? [])]));
  const customFields = { ...(loser.customFields ?? {}) };
  for (const [key, value] of Object.entries(survivor.customFields ?? {})) {
    if (value !== "" && value != null) customFields[key] = value;
  }
  if (survivor.customFields || loser.customFields) patch.customFields = customFields;
  for (const field of ["emailOptedOut", "smsOptedOut", "whatsappOptedOut", "voiceOptedOut", "deliverabilitySuppressed"] as const) {
    patch[field] = !!(survivor[field] || loser[field]);
  }
  const consent = survivor.emailConsent?.status === "unsubscribed" ? survivor.emailConsent :
    loser.emailConsent?.status === "unsubscribed" ? loser.emailConsent : survivor.emailConsent ?? loser.emailConsent;
  if (consent) patch.emailConsent = consent;
  const suppressed = survivor.deliverabilitySuppressed ? survivor : loser.deliverabilitySuppressed ? loser : undefined;
  if (suppressed) {
    for (const field of ["deliverabilitySuppressedReason", "deliverabilitySuppressedAt"] as const) {
      if (suppressed[field] != null) patch[field] = suppressed[field];
    }
  }
  return patch;
}
