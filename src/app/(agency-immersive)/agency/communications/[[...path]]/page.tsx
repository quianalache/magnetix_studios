import { notFound } from "next/navigation";
import DashboardLayout from "@/app/(dashboard)/layout";
import AgencyCommunicationsHubPage from "@/lib/agency-communications-pages/hub";
import AgencyBroadcastsListPage from "@/lib/agency-communications-pages/broadcast-list";
import AgencyBroadcastDetailPage from "@/lib/agency-communications-pages/broadcast-detail";
import NewAgencyBroadcastPage from "@/lib/agency-communications-pages/broadcast-new";
import EditAgencyBroadcastPage from "@/lib/agency-communications-pages/broadcast-edit";
import AgencyEmailTemplateLibraryPage from "@/lib/agency-communications-pages/template-list";
import AgencyEmailTemplatePage from "@/lib/agency-communications-pages/template-edit";
import NewAgencyEmailTemplatePage from "@/lib/agency-communications-pages/template-new";

export const dynamic = "force-dynamic";

function DashboardPage({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

export default async function AgencyCommunicationsPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const path = (await params).path ?? [];

  if (path.length === 0) {
    return <DashboardPage><AgencyCommunicationsHubPage /></DashboardPage>;
  }
  if (path.length === 1 && path[0] === "broadcasts") {
    return <DashboardPage><AgencyBroadcastsListPage /></DashboardPage>;
  }
  if (path.length === 2 && path[0] === "broadcasts" && path[1] === "new") {
    return <NewAgencyBroadcastPage />;
  }
  if (path.length === 2 && path[0] === "broadcasts") {
    return <AgencyBroadcastDetailPage params={Promise.resolve({ id: path[1] })} />;
  }
  if (path.length === 3 && path[0] === "broadcasts" && path[2] === "edit") {
    return <EditAgencyBroadcastPage params={Promise.resolve({ id: path[1] })} />;
  }
  if (path.length === 1 && path[0] === "templates") {
    return <DashboardPage><AgencyEmailTemplateLibraryPage /></DashboardPage>;
  }
  if (path.length === 2 && path[0] === "templates" && path[1] === "new") {
    return <NewAgencyEmailTemplatePage />;
  }
  if (path.length === 2 && path[0] === "templates") {
    return <AgencyEmailTemplatePage params={Promise.resolve({ id: path[1] })} />;
  }
  notFound();
}
