"use client";

import Link from "next/link";
import { KeyRound, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { SetupEnvForm } from "@/components/agency/setup-env-form";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { CUSTOM_BRAND } from "@/config/landing";

/**
 * Agency-owner-only "guided setup" surface. Houses the enable toggle + the env
 * setup form. Client-gated for UX (the real security is server-side in every
 * /api/agency/setup/* route via requireAgencyOwner + the formEnabled toggle).
 */
export default function AgencySetupPage() {
  const { agencyRole, loading } = useAuth();

  if (!loading && agencyRole !== "owner") {
    return (
      <PageShell width="data">
        <EmptyState
          icon={Lock}
          title="Owner only"
          description="Only the agency owner can access guided setup."
          action={
            <Button variant="outline" size="sm" render={<Link href="/agency" />}>
              Back to agency
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell width="data">
      <PageHeader
        icon={KeyRound}
        title="Guided setup"
        breadcrumbs={
          <Link href="/agency/settings?section=guided-setup" className="hover:text-foreground hover:underline">
            Agency Settings
          </Link>
        }
        description={
          <>
            Optionally enter your remaining API keys here and let {CUSTOM_BRAND.name} write them to Vercel (and your
            local <code>.env.local</code>) for you. Affects the whole deployment. This is an alternative to setting
            environment variables by hand — both paths are fully supported.
          </>
        }
      />

      <SetupEnvForm />
    </PageShell>
  );
}
