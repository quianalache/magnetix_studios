import { PortalHomeView } from "../portal-home-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ saId: string }>;
}

export default async function PortalPage({ params }: PageProps) {
  const { saId } = await params;
  return <PortalHomeView saId={saId} loginPath={`/portal/${saId}/login`} />;
}
