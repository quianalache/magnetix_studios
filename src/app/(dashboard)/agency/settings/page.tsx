"use client";

import { Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/system/page-shell";
import { SettingsSection } from "@/components/system/settings-section";
import { SettingsWorkspace, type SettingsNavGroup } from "@/components/system/settings-workspace";
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

/**
 * Agency Settings — the SAME Settings workspace as sub-account Settings
 * (Visual Direction 2, Section 4.4; visual-parity pass 2026-10-14):
 * different content, same architecture. `?section=` selects a section.
 */

type SectionKey =
  | "branding"
  | "sales-page"
  | "app-icon"
  | "guided-setup"
  | "status"
  | "messaging"
  | "assistant"
  | "ai-model"
  | "password"
  | "demo-data";

const DESCRIPTIONS: Record<SectionKey, string> = {
  branding: "Your agency name, logo, support email and domain — shown in the sidebar, browser tab and public landing page.",
  "sales-page": "Where new customers land before signing up, plus the acquisition-tracking snippet.",
  "app-icon": "The home-screen icon people see when they install your app on their phone.",
  "guided-setup": "Enter remaining API keys in-app and have them written to Vercel for you.",
  status: "Live health of every integration this deployment depends on.",
  messaging: "The shared SMS and email senders every sub-account falls back to.",
  assistant: "Your owner-level AI for running the agency.",
  "ai-model": "The deployment-wide model powering AI Agents.",
  password: "Change the password you sign in with.",
  "demo-data": "Load or clear sample data for demos.",
};

function AgencySettingsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const groups = useMemo<SettingsNavGroup[]>(() => {
    const item = (key: SectionKey, label: string) => ({ key, label, description: DESCRIPTIONS[key] });
    return [
      { label: "Agency", items: [item("branding", "Branding"), item("sales-page", "Sales page"), item("app-icon", "Mobile app icon")] },
      {
        label: "Deployment",
        items: [item("guided-setup", "Guided setup"), item("status", "System status"), item("messaging", "Shared senders")],
      },
      { label: "AI", items: [item("assistant", "Agency Assistant"), item("ai-model", "AI model")] },
      {
        label: "Account",
        items: [item("password", "Password"), ...(LANDING_VARIANT === "leadstack" ? [item("demo-data", "Demo data")] : [])],
      },
    ];
  }, []);

  const keys = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.key as SectionKey)), [groups]);
  const requested = params.get("section") as SectionKey | null;
  const active: SectionKey = requested && keys.includes(requested) ? requested : keys[0];

  const hrefFor = useCallback((key: string) => `${pathname}?section=${key}`, [pathname]);
  const navigate = useCallback(
    (key: string) => {
      router.replace(hrefFor(key), { scroll: false });
      document.querySelector("main")?.scrollTo({ top: 0 });
    },
    [router, hrefFor],
  );

  return (
    <SettingsWorkspace
      subtitle="Agency preferences · apply across every sub-account"
      groups={groups}
      activeKey={active}
      onNavigate={navigate}
      hrefFor={hrefFor}
      footer={
        <>
          Workspace-level settings live in each sub-account&apos;s{" "}
          <Link href="/agency/sub-accounts" className="font-medium text-link underline-offset-2 hover:underline">
            Settings
          </Link>
          .
        </>
      }
    >
      {active === "branding" && <BrandingSection />}

      {/* No-code pointer to the agency's own SaaS sales page + the copy-
          paste acquisition-tracking snippet — see Agency → Traffic &
          Signups for what it measures. */}
      {active === "sales-page" && <SalesPageSection />}

      {/* Home-screen icon for the installable app (PWA) — pairs with the
          Branding card: logo URL brands the pages, this brands the phone. */}
      {active === "app-icon" && <AppIconSection />}

      {active === "guided-setup" && (
        <SettingsSection
          title="Guided setup"
          description="Optionally enter your remaining API keys in-app and have them written to Vercel for you — an alternative to editing environment variables by hand."
          action={
            <Button variant="outline" size="sm" render={<Link href="/agency/setup" />}>
              Open
            </Button>
          }
        />
      )}

      {/* Deployment/integration health (Stripe, Resend, Twilio, Firebase…). */}
      {active === "status" && <StatusTab />}

      {/* Read-only view of the shared (env-var) Twilio + Resend senders. */}
      {active === "messaging" && <MessagingSection />}

      {active === "assistant" && (
        <>
          {/* Agency Assistant master switch — OFF by default; every reply
              spends OpenRouter credits so the owner opts in deliberately. */}
          <AgencyAssistantSection />
          {/* AI Suite knowledge-base review — renders ONLY in local dev. */}
          <AgencyAiKbSection />
        </>
      )}

      {/* Read-only view of the deployment-wide AI model powering AI Agents. */}
      {active === "ai-model" && <AiModelSection />}

      {/* Password change — user-level, mounted here too so it's reachable
          wherever the operator is sitting. Handles its own reauth. */}
      {active === "password" && <PasswordSection />}

      {/* Demo seed/unseed — LeadStack-branded deployment only. */}
      {active === "demo-data" && <SeedDemoSection />}
    </SettingsWorkspace>
  );
}

export default function AgencySettingsPage() {
  const { agencyRole, loading } = useAuth();

  if (!loading && agencyRole !== "owner") {
    return (
      <PageShell width="form">
        <EmptyState
          icon={Lock}
          title="Owner only"
          description="Only the agency owner can manage agency-level settings."
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
    <Suspense fallback={null}>
      <AgencySettingsInner />
    </Suspense>
  );
}
