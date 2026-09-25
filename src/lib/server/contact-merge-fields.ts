import type { Contact } from "@/types/contacts";

/** Shared by manual linking and general merges. Consent restrictions always
 * survive, even when the caller selected a different primary identity. */
export function contactMergeFields(survivor: Omit<Contact, "id">, loser: Omit<Contact, "id">): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of ["name", "email", "phone", "company", "address", "state", "postalCode", "source", "pipelineStage", "attribution", "metaUserId", "smsConsent"] as const) {
    if (!survivor[field] && loser[field] != null) patch[field] = loser[field];
  }
  // Contacts redesign: first/last name travel WITH the full name that
  // survives, never field-by-field — otherwise a merge could pair the
  // survivor's "Jane Doe" with the other record's "Bob" / "Smith". The
  // survivor keeps its own parts when it has any; it only borrows the other
  // record's parts when it has none AND that record's full name is the one
  // that ends up on the survivor (its name was blank, or both names match).
  const survivorHasParts = !!(survivor.firstName?.trim() || survivor.lastName?.trim());
  const loserHasParts = !!(loser.firstName?.trim() || loser.lastName?.trim());
  const sameName = (survivor.name ?? "").trim().toLowerCase() === (loser.name ?? "").trim().toLowerCase();
  if (!survivorHasParts && loserHasParts && (!survivor.name?.trim() || sameName)) {
    if (loser.firstName != null) patch.firstName = loser.firstName;
    if (loser.lastName != null) patch.lastName = loser.lastName;
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
