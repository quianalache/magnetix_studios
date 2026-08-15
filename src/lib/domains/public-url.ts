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

/**
 * The shared platform origin — same env var every pre-existing link
 * builder already uses. Exported (2026-08-17) for MyMagnetix's
 * Portal->MyMagnetix bridge: unlike every other destination in this file
 * (which intentionally prefers a business's verified custom domain when
 * available), MyMagnetix itself must NEVER resolve under a tenant's
 * custom domain — it's a person-wide surface, not business-branded — so
 * that one caller always wants the bare platform origin regardless of
 * which host the request came in on.
 */
export function platformOrigin(): string {
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

/** The member-facing Portal home/entry destination for admin "View Portal" actions. */
export function buildPortalHomeUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  return domain
    ? `https://${domain}/portal`
    : `${platformOrigin()}/portal/${opts.subAccountId}`;
}

/** The explicit Portal login page, used when the admin wants to open the login screen itself. */
export function buildPortalLoginPageUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  return domain
    ? `https://${domain}/portal/login`
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

/**
 * The Community group's public "View public page" link — same
 * verified-domain-or-opaque-fallback choice as every other builder here.
 * On a verified custom domain this is the clean `/communities/{slug}/about`
 * mirror route; otherwise it's today's opaque `/c/{saId}/{slug}` route.
 * See `src/lib/community/routes.ts` for the full set of Community link
 * builders used once inside the app itself (this one is specifically for
 * "what do I put on the admin's View public page button").
 */
export function buildCommunityGroupUrl(opts: {
  subAccount: HasCustomDomain | null | undefined;
  subAccountId: string;
  groupSlug: string;
}): string {
  const domain = verifiedDomain(opts.subAccount);
  return domain
    ? `https://${domain}/communities/${opts.groupSlug}/about`
    : `${platformOrigin()}/c/${opts.subAccountId}/${opts.groupSlug}`;
}
