/**
 * Plain-language workflow run errors (CRM Foundations Batch B, 2026-11).
 * Pure; shared by the engine (Contact Activity text) and the Runs UI.
 *
 * Stored errors are short codes ("email_not_configured") or provider
 * messages. Messages are scrubbed so a provider error can never surface a
 * token, signed URL or webhook secret in the CRM.
 */

const KNOWN: Record<string, string> = {
  email_not_configured: "Email isn't set up on this workspace, so the email couldn't be sent.",
  sms_not_configured: "SMS isn't set up on this workspace, so the text couldn't be sent.",
  whatsapp_not_configured: "WhatsApp isn't set up on this workspace.",
  send_failed: "The message provider refused the send.",
  retry_exhausted: "The send kept failing after several automatic retries.",
  configuration_required: "This step needs attention before it can run.",
  invalid_email_type: "The email step has an invalid email type.",
  invalid_email_config: "The email step's design is missing or invalid.",
  email_document_missing: "The email step's design is missing.",
  workflow_chain_depth_exceeded: "Too many workflows started each other in a row, so this one was stopped.",
  workflow_self_invocation: "A workflow can't start itself.",
  workflow_not_active: "The workflow to start isn't active.",
  workflow_not_found: "The workflow to start no longer exists.",
  workflow_has_no_steps: "The workflow to start has no steps.",
  community_payment_required: "That community requires payment, so access wasn't granted.",
  contact_missing: "The contact no longer exists.",
  workflow_missing: "The workflow no longer exists.",
  schedule_failed: "The next step couldn't be scheduled.",
  action_failed: "The step failed.",
};

/** Remove anything that looks like a secret, signed URL query or token. */
export function scrubErrorText(text: string): string {
  return text
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, "$1")
    .replace(/\b(bearer|token|key|secret|password|signature|sig|auth)\s*[:=]\s*\S+/gi, "$1=…")
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, "…")
    .slice(0, 400);
}

/** Readable sentence for a stored error code and/or message. */
export function describeRunError(category: string | null | undefined, message?: string | null): string {
  const code = (category ?? "").trim();
  const msg = message ? scrubErrorText(message) : "";
  if (code && KNOWN[code]) {
    // Keep a provider/config message that adds detail beyond the code.
    return msg && msg !== code && !KNOWN[msg] ? `${KNOWN[code]} (${msg})` : KNOWN[code];
  }
  if (msg && KNOWN[msg]) return KNOWN[msg];
  if (msg) return msg;
  if (code) return code.replace(/[_:]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()) + ".";
  return "The step failed.";
}

/** Error code from a history entry's `result` string ("error:send_failed"). */
export function errorCodeFromResult(result: string | null | undefined): string | null {
  if (!result || !result.startsWith("error:")) return null;
  return result.slice("error:".length) || null;
}
