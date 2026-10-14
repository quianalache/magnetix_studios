"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SettingsSection } from "@/components/system/settings-section";
import { EmptyState } from "@/components/system/empty-state";
import { BrandingSection } from "@/components/agency/branding-section";
import { SalesPageSection } from "@/components/agency/sales-page-section";
import { AppIconSection } from "@/components/agency/app-icon-section";
import { MessagingSection } from "@/components/agency/messaging-section";
import { AiModelSection } from "@/components/agency/ai-model-section";
import { AgencyAssistantSection } from "@/components/agency/agency-assistant-section";
import { AgencyAiKbSection } from "@/components/agency/agency-ai-kb-section";
import { SeedDemoSection } from "@/components/agency/seed-demo-section";
import { StatusTab } from "@/components/agency/status-tab";
import { PasswordSection } from "@/components/settings/password-section";
import { LANDING_VARIANT } from "@/config/landing";
import {
  SettingsSubNavigation,
  type SettingsSubNavigationItem,
} from "@/components/settings/settings-sub-navigation";

const AGENCY_SETTINGS_NAV: SettingsSubNavigationItem[] = [
  { key: "guided-setup", label: "Guided setup", href: "#guided-setup" },
  { key: "status", label: "System status", href: "#status" },
  { key: "branding", label: "Branding", href: "#branding" },
  { key: "sales-page", label: "Sales page", href: "#sales-page" },
  { key: "app-icon", label: "App icon", href: "#app-icon" },
  { key: "messaging", label: "Messaging", href: "#messaging" },
  { key: "ai-model", label: "AI model", href: "#ai-model" },
  { key: "assistant", label: "Agency Assistant", href: "#assistant" },
  { key: "password", label: "Password", href: "#password" },
];

export default function AgencySettingsPage() {
  const { agencyRole, loading } = useAuth();

  if (!loading && agencyRole !== "owner") {
    return (
      <PageShell width="data">
        <EmptyState
          icon={Lock}
          title="Owner only"
          description="Only the agency owner can manage agency-level settings."
          action={
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/agency" />}
            >
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
        title="Settings"
        description="Agency-level configuration. These settings apply across every sub-account and the public landing page."
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[11rem_minmax(0,1fr)] xl:items-start">
        <SettingsSubNavigation
          items={AGENCY_SETTINGS_NAV}
          activeKey="guided-setup"
        />
        <div className="min-w-0 space-y-6">
          <div id="guided-setup" className="scroll-mt-6">
            <SettingsSection
              title="Guided setup"
              description="Optionally enter your remaining API keys in-app and have them written to Vercel for you — an alternative to editing environment variables by hand."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/agency/setup" />}
                >
                  Open
                </Button>
              }
            />
          </div>

          {/* Deployment/integration health (Stripe, Resend, Twilio, Firebase…) —
          moved here from Agency Home's "Status" tab (2026-09-16 shell
          cleanup): it's a devops/config diagnostic, not a SaaS-business
          metric, so it belongs next to the rest of the deployment config
          rather than on the operator's business overview dashboard. */}
          <div id="status" className="scroll-mt-6">
            <StatusTab />
          </div>

          <div id="branding" className="scroll-mt-6">
            <BrandingSection />
          </div>

          {/* No-code pointer to the agency's own SaaS sales page + the copy-
          paste acquisition-tracking snippet — see Agency → Traffic &
          Signups for what it measures. */}
          <div id="sales-page" className="scroll-mt-6">
            <SalesPageSection />
          </div>

          {/* Home-screen icon for the installable app (PWA) — pairs with the
          Branding card: logo URL brands the pages, this brands the phone. */}
          <div id="app-icon" className="scroll-mt-6">
            <AppIconSection />
          </div>

          {/* App theme picker retired 2026-10-13 — the internal CRM uses the one
          fixed Magnetix visual system (see components/theme/crm-scope.tsx). */}

          {/* Read-only view of the shared (env-var) Twilio + Resend senders, so the
          owner can see exactly what "agency-level" SMS/email resolves to. */}
          <div id="messaging" className="scroll-mt-6">
            <MessagingSection />
          </div>

          {/* Read-only view of the deployment-wide AI model powering AI Agents. */}
          <div id="ai-model" className="scroll-mt-6">
            <AiModelSection />
          </div>

          {/* Agency Assistant master switch — OFF by default; every reply spends
          OpenRouter credits so the owner opts in deliberately. */}
          <div id="assistant" className="scroll-mt-6">
            <AgencyAssistantSection />
          </div>

          {/* AI Suite knowledge-base review — renders ONLY in local dev (the
          availability probe is false on deployed instances, where there's no
          source tree to review or write). */}
          <AgencyAiKbSection />

          {/* Password change — user-level concern but mounted on both the
          agency-settings and sub-account-settings pages so it's reachable
          wherever the operator happens to be sitting. Same component
          either place; handles its own reauth. */}
          <div id="password" className="scroll-mt-6">
            <PasswordSection />
          </div>

          {/* Demo seed/unseed panel — LeadStack-branded deployment only.
          Buyer clones (LANDING_VARIANT === "custom") don't see this, and
          the underlying API route 404s for them too. */}
          {LANDING_VARIANT === "leadstack" && <SeedDemoSection />}
        </div>
      </div>
    </PageShell>
  );
}
