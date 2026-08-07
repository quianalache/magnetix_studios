import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import { PortalLoginView } from "../portal-login-view";

export const dynamic = "force-dynamic";

/**
 * Human-readable custom-domain mirror of `/portal/{saId}/login` — a real
 * pretty-URL page (same pattern as `/booking/[slug]` and `/courses/[slug]`),
 * NOT a redirect to the opaque route. Only ever resolves on a verified
 * custom domain; the opaque `/portal/{saId}/login` still works unchanged
 * on the shared platform domain.
 */
export default async function CustomDomainPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const host = (await headers()).get("host");
  const sub = await getSubAccountByCustomDomain(host);
  if (!sub) notFound();

  const sp = await searchParams;
  return <PortalLoginView saId={sub.id} subName={sub.name ?? "your portal"} errorCode={sp.error} />;
}
