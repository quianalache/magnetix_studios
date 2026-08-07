import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import { PortalHomeView } from "./portal-home-view";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain portal entry: yourdomain.com/portal — a real
 * pretty-URL mirror now (same pattern as booking/decoder/courses), not a
 * redirect. Previously this bounced to the opaque `/portal/{saId}`, which
 * itself then bounced unauthenticated visitors to `/portal/{saId}/login` —
 * two redirects that left the pretty entry point undone by the time anyone
 * actually saw a URL. Fixed 2026-08-07.
 */
export default async function CustomDomainPortalEntry() {
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();
  return <PortalHomeView saId={sub.id} loginPath="/portal/login" />;
}
