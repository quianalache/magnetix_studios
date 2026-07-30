import "server-only";

import { Resend } from "resend";

import type { ResendConfig } from "@/types/tenancy";

let _client: Resend | null = null;

export function getResend(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error(
        "RESEND_API_KEY is not set. Add it to .env.local to enable email.",
      );
    }
    _client = new Resend(key);
  }
  return _client;
}

export function emailIsConfigured(): boolean {
  // `.trim()` so a present-but-blank env var doesn't read as configured.
  return (
    !!process.env.RESEND_API_KEY?.trim() && !!process.env.EMAIL_FROM?.trim()
  );
}

/**
 * Resolves the From address for a sub-account under the platform-managed
 * sending model. Returns the tenant's dedicated sending-domain address only
 * when BOTH the agency-controlled gate is on AND the domain is verified;
 * otherwise undefined, so `sendEmail` falls back to the shared EMAIL_FROM.
 * The double check is deliberate: if an agency flips the gate off while a
 * verified resendConfig is still on the doc, runtime sending immediately
 * reverts to shared without waiting for the cleanup write.
 *
 * Pass the result straight into `sendEmail({ ..., from })`.
 */
export function tenantFrom(
  sub?: {
    resendConfig?: ResendConfig | null;
    emailDomainEnabledByAgency?: boolean;
  } | null,
): string | undefined {
  if (sub?.emailDomainEnabledByAgency !== true) return undefined;
  const cfg = sub.resendConfig;
  return cfg && cfg.status === "verified" ? cfg.emailFrom : undefined;
}

/**
 * Resolves Reply-To for every email this CRM sends on a sub-account's
 * behalf. Two addresses can both be right at once: the sub-account's own
 * `replyToEmail` (their real inbox — often what they actually want to
 * triage from day to day) AND, once a dedicated domain is verified, that
 * domain's own address (its replies land in the Conversations inbox via
 * the Resend inbound webhook). Sending BOTH as a Reply-To list — Resend
 * supports an array here — means a plain "Reply" populates both in most
 * mail clients, so neither channel loses the thread. `replyToEmail` alone
 * predates inbound support and used to be described as "required" for
 * dedicated-domain sending (the domain had no inbox); it's additive now,
 * not a replacement.
 */
export function resolveReplyTo(
  sub?: {
    resendConfig?: ResendConfig | null;
    emailDomainEnabledByAgency?: boolean;
    replyToEmail?: string | null;
  } | null,
): string | string[] | undefined {
  const personal = sub?.replyToEmail?.trim() || undefined;
  const domain = tenantFrom(sub);
  if (personal && domain) return [personal, domain];
  return personal ?? domain;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  from,
  attachments,
  headers,
}: {
  to: string;
  subject: string;
  /** Plain-text fallback. Required so clients that don't render HTML still get content. */
  text: string;
  /** Optional rich-text body. Resend uses html when present, text as fallback. */
  html?: string;
  /** Use `resolveReplyTo` — an array here (personal + dedicated domain) is fine, Resend sends it as multiple Reply-To addresses. */
  replyTo?: string | string[];
  /**
   * Per-sub-account sender override. When a sub-account has a verified
   * dedicated sending domain, pass its `emailFrom` here (use `tenantFrom`).
   * Omit for platform/transactional sends — falls back to the deployment-wide
   * EMAIL_FROM shared sender.
   */
  from?: string;
  attachments?: { filename: string; content: string }[];
  /**
   * Raw custom headers, passed straight through to Resend. Used for
   * `List-Unsubscribe`/`List-Unsubscribe-Post` on broadcast sends (see
   * `src/lib/broadcasts/compliance.ts`) — not needed for ordinary sends.
   */
  headers?: Record<string, string>;
}): Promise<{ id: string }> {
  const resolvedFrom = from ?? process.env.EMAIL_FROM;
  if (!resolvedFrom) {
    throw new Error(
      "EMAIL_FROM is not set. It must be a sender on a Resend-verified domain.",
    );
  }
  const client = getResend();
  const result = await client.emails.send({
    from: resolvedFrom,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    replyTo,
    ...(attachments ? { attachments } : {}),
    ...(headers ? { headers } : {}),
  });
  if (result.error) {
    throw new Error(result.error.message || "Resend send failed");
  }
  if (!result.data?.id) {
    throw new Error("Resend send failed: no message id returned");
  }
  return { id: result.data.id };
}

/** Thrown by `sendTenantEmail` when the sub-account has no verified
 *  dedicated sending domain — callers decide whether to surface this to an
 *  operator or log-and-continue (see the function's doc comment). */
export class NoTenantDomainError extends Error {
  constructor() {
    super(
      "This sub-account has no verified dedicated sending domain. Set one up in Settings → Email before sending.",
    );
    this.name = "NoTenantDomainError";
  }
}

/**
 * Sends an email on a sub-account's behalf — REQUIRES a verified dedicated
 * domain (`tenantFrom` must resolve), throwing `NoTenantDomainError`
 * instead of silently falling back to the shared platform sender
 * (`EMAIL_FROM`, "LeadStack <notifications@…>"). Deliberate product
 * decision: every sub-account's customer-facing email — booking
 * confirmations, broadcasts, automations, purchase receipts — must be
 * branded to that sub-account's own domain, never the shared one, even if
 * that means an unconfigured sub-account's email doesn't go out at all
 * until they finish domain setup. Use bare `sendEmail` + `EMAIL_FROM`
 * directly for genuine platform-level sends (password resets, agency
 * notifications) that were never meant to carry a sub-account's branding.
 */
export async function sendTenantEmail({
  sub,
  to,
  subject,
  text,
  html,
  attachments,
  replyTo,
  headers,
}: {
  sub:
    | {
        resendConfig?: ResendConfig | null;
        emailDomainEnabledByAgency?: boolean;
        replyToEmail?: string | null;
      }
    | null
    | undefined;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string }[];
  /** Overrides `resolveReplyTo(sub)` for the rare send that needs a
   *  different reply target (e.g. quotes reply to the staff member who
   *  sent them, not the sub-account's general address). */
  replyTo?: string | string[];
  headers?: Record<string, string>;
}): Promise<{ id: string }> {
  const from = tenantFrom(sub);
  if (!from) throw new NoTenantDomainError();
  return sendEmail({
    to,
    subject,
    text,
    html,
    from,
    replyTo: replyTo ?? resolveReplyTo(sub),
    attachments,
    headers,
  });
}

/**
 * Sends the SAME plain-text email to many recipients as INDIVIDUAL emails
 * (each recipient's own To: line — no CC/BCC leakage) via Resend's batch API,
 * which takes up to 100 messages per call. Used by the agency "Email
 * purchasers" tool. Best-effort per chunk: a failed batch counts its whole
 * chunk as failed and keeps going, so one bad chunk never aborts the rest.
 */
export async function sendPlainTextBroadcast({
  recipients,
  subject,
  text,
  from,
  replyTo,
}: {
  recipients: string[];
  subject: string;
  text: string;
  from?: string;
  replyTo?: string;
}): Promise<{ sent: number; failed: number; errors: string[] }> {
  const resolvedFrom = from ?? process.env.EMAIL_FROM;
  if (!resolvedFrom) {
    throw new Error(
      "EMAIL_FROM is not set. It must be a sender on a Resend-verified domain.",
    );
  }
  const client = getResend();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100);
    try {
      const res = await client.batch.send(
        chunk.map((to) => ({
          from: resolvedFrom,
          to,
          subject,
          text,
          ...(replyTo ? { replyTo } : {}),
        })),
      );
      if (res.error) {
        failed += chunk.length;
        errors.push(res.error.message ?? "Resend batch error");
      } else {
        sent += chunk.length;
      }
    } catch (err) {
      failed += chunk.length;
      errors.push(err instanceof Error ? err.message : "Unknown batch error");
    }
  }

  return { sent, failed, errors: errors.slice(0, 5) };
}
