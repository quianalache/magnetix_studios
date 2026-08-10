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

/**
 * The actual client-facing report link — "Share report" in the Readings
 * tab, and what the public tool's success screen points a visitor to
 * after they generate their own reading. Host-aware from the start
 * (learned that lesson the hard way with the Portal's magic-link
 * invite — see Build Log, Aug 7): a coach's own verified domain, not the
 * shared platform domain, same as every other public link here.
 */
export function buildDecoderReportUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
  readingId: string;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  return domain
    ? `https://${domain}/decoder/report/${opts.readingId}`
    : `${platformOrigin()}/decoder/${opts.subAccountId}/report/${opts.readingId}`;
}

/** Same as buildDecoderReportUrl, but for a specific saved Report Design instead of the default fixed layout — the actual delivery link once a practitioner has built a real design in the Report Builder. */
export function buildDecoderReportDesignUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
  readingId: string;
  reportId: string;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  return domain
    ? `https://${domain}/decoder/report/${opts.readingId}/design/${opts.reportId}`
    : `${platformOrigin()}/decoder/${opts.subAccountId}/report/${opts.readingId}/design/${opts.reportId}`;
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

/**
 * Bare origin (no path) for building portal links FROM the server side —
 * the magic-link email's verify URL, the "sign in" redirect target, etc.
 * Same domain-or-platform choice as `buildPortalLoginUrl`, just without a
 * path baked in, since these callers append their own.
 */
export function resolvePortalOrigin(subAccount: HasCustomDomain | null | undefined): string {
  const domain = verifiedDomain(subAccount);
  return domain ? `https://${domain}` : platformOrigin();
}
