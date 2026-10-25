"use client";

import { useEffect } from "react";
import { Compass } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { OverviewTab } from "@/components/agency/getting-started/overview-tab";
import { FeaturesTab } from "@/components/agency/getting-started/features-tab";
import { NextStepsTab } from "@/components/agency/getting-started/next-steps-tab";
import { SetupStatusBanner } from "@/components/agency/getting-started/setup-status-banner";

/**
 * Owner-aimed orientation page. A setup-progress banner (deep-links to
 * Guided setup while keys are missing) above three tabs: workflow overview,
 * feature tour, recommended next steps. Tab content is static; the banner
 * makes one counts-only call to /api/agency/setup/summary.
 */
export default function GetStartedPage() {
  const { user, loading, agencyRole, memberships } = useAuth();
  const firstSubAccountId = memberships[0]?.subAccountId ?? null;
  const agency = useAgency();

  useEffect(() => {
    document.title = `Get started · ${agency.name}`;
  }, [agency.name]);

  if (loading) {
    return <PageShellLoading width="data" />;
  }

  if (!user) {
    return (
      <PageShell width="data">
        <EmptyState icon={Compass} title="Sign in to view this page" />
      </PageShell>
    );
  }

  if (agencyRole !== "owner") {
    return (
      <PageShell width="data">
        <EmptyState icon={Compass} title="Owner only" description="Only the agency owner can view this orientation page." />
      </PageShell>
    );
  }

  return (
    <PageShell width="data">
      <PageHeader
        icon={Compass}
        title="Get started"
        description={`A two-minute tour of ${agency.name} and the agency workflow it supports.`}
      />

      <SetupStatusBanner />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="next-steps">Next steps</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab agencyName={agency.name} />
        </TabsContent>
        <TabsContent value="features" className="mt-4">
          <FeaturesTab firstSubAccountId={firstSubAccountId} />
        </TabsContent>
        <TabsContent value="next-steps" className="mt-4">
          <NextStepsTab firstSubAccountId={firstSubAccountId} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
