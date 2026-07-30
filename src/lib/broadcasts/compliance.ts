import "server-only";

import { tenantFrom } from "@/lib/comms/resend";
import type { ResendConfig, SubAccountMailingAddress } from "@/types/tenancy";

/** Thrown by `requireMailingAddress` when a sub-account hasn't set a
 *  physical mailing address yet — required before any broadcast can send
 *  (CAN-SPAM). Mirrors `NoTenantDomainError`'s shape/wording. */
export class MissingMailingAddressError extends Error {
  constructor() {
    super(
      "This sub-account hasn't set a business mailing address yet. Add one in Settings → Sending preferences before sending a broadcast — it's required by CAN-SPAM.",
    );
    this.name = "MissingMailingAddressError";
  }
}

/**
 * Returns the sub-account's mailing address, throwing `MissingMailingAddressError`
 * if unset. A required (non-optional) return type — a call site literally
 * can't compile without resolving this first, matching `tenantFrom`'s gate
 * pattern for the sending-domain requirement.
 */
export function requireMailingAddress(
  sub: { mailingAddress?: SubAccountMailingAddress | null } | null | undefined,
): SubAccountMailingAddress {
  const addr = sub?.mailingAddress;
  if (!addr) throw new MissingMailingAddressError();
  return addr;
}

export function formatMailingAddress(addr: SubAccountMailingAddress): string {
  const cityLine = [addr.city, addr.region, addr.postalCode]
    .filter(Boolean)
    .join(", ");
  return [addr.line1, addr.line2, cityLine, addr.country]
    .filter((part): part is string => !!part && part.trim() !== "")
    .join(", ");
}

/**
 * One-click unsubscribe (RFC 8058) — Gmail/Yahoo have required this since
 * 2024 for any bulk sender. `mailtoAddress` should be the sub-account's own
 * verified domain address (`tenantFrom`) so a client that falls back to a
 * manual "compose to" (no one-click support) still lands somewhere a human
 * sees it, via the existing inbound-email → Conversations pipeline.
 */
export function buildListUnsubscribeHeaders(
  unsubscribeUrl: string,
  mailtoAddress: string,
): Record<string, string> {
  return {
    "List-Unsubscribe": `<mailto:${mailtoAddress}>, <${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Convenience wrapper: resolves the mailto target for `buildListUnsubscribeHeaders`
 * from the same sub-account shape `tenantFrom` already accepts. Broadcasts
 * always have a verified domain by the time this runs (`sendTenantEmail`
 * requires it), so `tenantFrom` resolving is a safe assumption here — callers
 * that can't guarantee that should build headers manually instead.
 */
export function buildBroadcastUnsubscribeHeaders(
  sub: {
    resendConfig?: ResendConfig | null;
    emailDomainEnabledByAgency?: boolean;
  } | null | undefined,
  unsubscribeUrl: string,
): Record<string, string> | undefined {
  const from = tenantFrom(sub);
  if (!from || !unsubscribeUrl) return undefined;
  // `emailFrom` is a full "Name <addr@domain>" header — extract the bare address.
  const match = from.match(/<([^>]+)>/);
  const mailto = match ? match[1] : from;
  return buildListUnsubscribeHeaders(unsubscribeUrl, mailto);
}
