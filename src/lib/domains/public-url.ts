/**
 * Public-link builders — the "which domain does this URL go on" layer.
 * Deliberately NOT "server-only": several call sites are client components
 * reading `subAccount.customDomain` off `useSubAccount()` context, others
 * are server routes/services. Every builder takes the same shape (an object
 * with a `customDomain` field, i.e. `Pick<SubAccountDoc, "customDomain">`)
 * so either side can call it identically.
 *
 * Falls back to today's opaque-ID `NEXT_PUBLIC_APP_URL`-based URL whenever
 * there's no VERIFIED custom domain — existing behavior for every
 * sub-account that hasn't set one up is completely unchanged.
 */

interface HasCustomDomain {
  customDomain?: {
    domain: string;
    status: "pending" | "verified" | "error";
  } | null;
}

function verifiedDomain(sub: HasCustomDomain | null | undefined): string | null {
  return sub?.customDomain?.status === "verified" ? sub.customDomain.domain : null;
}

/** The shared platform origin — same env var every pre-existing link builder already uses. */
function platformOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export function buildBookingUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
  slug: string;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  return domain
    ? `https://${domain}/booking/${opts.slug}`
    : `${platformOrigin()}/b/${opts.subAccountId}/${opts.slug}`;
}

export function buildDecoderUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  return domain ? `https://${domain}/decoder` : `${platformOrigin()}/decoder/${opts.subAccountId}`;
}

/** `slug` is nullable so callers with a legacy (pre-slug) doc degrade gracefully to the opaque URL instead of building a broken link. */
export function buildCourseUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
  courseId: string;
  slug?: string | null;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  if (domain && opts.slug) return `https://${domain}/courses/${opts.slug}`;
  return `${platformOrigin()}/course/${opts.subAccountId}/${opts.courseId}`;
}

export function buildOfferUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
  offerId: string;
  slug?: string | null;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  if (domain && opts.slug) return `https://${domain}/courses/${opts.slug}`;
  return `${platformOrigin()}/offer/${opts.subAccountId}/${opts.offerId}`;
}

/**
 * The portal LOGIN link specifically (what gets copied/emailed to a
 * client). On a verified custom domain this is just the bare `/portal` —
 * `src/app/portal/page.tsx` redirects to `/portal/{saId}`, which itself
 * redirects to the login page when there's no member session, so the
 * pretty entry point cascades to the right place without needing its own
 * `/portal/login` route. On the shared platform domain, keeps today's
 * exact `/portal/{saId}/login` URL unchanged.
 */
export function buildPortalLoginUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  return domain
    ? `https://${domain}/portal`
    : `${platformOrigin()}/portal/${opts.subAccountId}/login`;
}
