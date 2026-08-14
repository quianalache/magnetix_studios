import { notFound } from "next/navigation";
import { PortalHomeView, type PortalSection } from "../../portal-home-view";

export const dynamic = "force-dynamic";

const portalSections = new Set<Exclude<PortalSection, "home">>([
  "appointments",
  "communities",
  "courses",
  "projects",
  "billing",
]);

export default async function PlatformPortalSectionPage({
  params,
}: {
  params: Promise<{ saId: string; section: string }>;
}) {
  const { saId, section } = await params;
  if (!portalSections.has(section as Exclude<PortalSection, "home">))
    notFound();

  return (
    <PortalHomeView
      saId={saId}
      loginPath={`/portal/${saId}/login`}
      section={section as Exclude<PortalSection, "home">}
    />
  );
}
