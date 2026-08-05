import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain portal entry: yourdomain.com/portal.
 *
 * Unlike booking/decoder/courses, this is a plain redirect to the existing
 * opaque `/portal/{saId}` route rather than a full pretty-URL mirror — the
 * portal is a login-gated client area, not a public/shareable marketing
 * surface, so once a visitor is past this entry point an opaque URL is
 * normal (same pattern as e.g. a Stripe customer portal: the link you
 * SHARE is clean, what you land on once authenticated doesn't need to be).
 */
export default async function CustomDomainPortalEntry() {
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  redirect(`/portal/${sub.id}`);
}
