import type { EnergeticDecoderRequest } from "@/types/energetic-decoder";

/**
 * Public decoder submissions may contain birth/lead data only.  Internal
 * profile/contact selectors are deliberately removed before the shared save
 * service is called, so an embed cannot turn a public request into a read or
 * notification against an existing CRM record.
 */
export function sanitizePublicDecoderInput(
  body: EnergeticDecoderRequest,
): EnergeticDecoderRequest {
  const input = { ...body };
  delete input.profileId;
  delete input.contactId;
  return input;
}
