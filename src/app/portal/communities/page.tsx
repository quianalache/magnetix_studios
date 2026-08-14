import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSubAccountByCustomDomain } from "@/lib/domains/custom-domain-service";
import { PortalHomeView } from "../portal-home-view";

export const dynamic = "force-dynamic";

export default async function CustomDomainPortalCommunitiesPage() {
  const sub = await getSubAccountByCustomDomain((await headers()).get("host"));
  if (!sub) notFound();
  return (
    <PortalHomeView
      saId={sub.id}
      loginPath="/portal/login"
      basePath="/portal"
      section="communities"
    />
  );
}
