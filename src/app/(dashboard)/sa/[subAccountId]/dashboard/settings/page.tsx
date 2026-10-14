"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { getUserDoc } from "@/lib/firestore/users";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { serializeCsv, downloadCsv } from "@/lib/csv";
import { toDate } from "@/lib/format";
import { effectiveBillingState } from "@/lib/billing/status";
import { LANDING_VARIANT } from "@/config/landing";
import { SubAccountWorkspaceNameSection } from "@/components/settings/sub-account-workspace-name-section";
import { SubAccountBrandingSection } from "@/components/settings/sub-account-branding-section";
import { SubAccountContactSection } from "@/components/settings/sub-account-contact-section";
import { SubAccountMembersSection } from "@/components/settings/sub-account-members-section";
import { SubAccountTerritoriesSection } from "@/components/settings/sub-account-territories-section";
import { SubAccountCustomFieldsSection } from "@/components/settings/sub-account-custom-fields-section";
import { SubAccountPipelineSection } from "@/components/settings/sub-account-pipeline-section";
import { GhlImportWizard } from "@/components/import/ghl-import-wizard";
import { SubAccountSmsSection } from "@/components/settings/sub-account-sms-section";
import { SubAccountMetaSection } from "@/components/settings/sub-account-meta-section";
import { SubAccountEmailDomainSection } from "@/components/settings/sub-account-email-domain-section";
import { SubAccountCustomDomainSection } from "@/components/settings/sub-account-custom-domain-section";
import { SubAccountBroadcastComplianceSection } from "@/components/settings/sub-account-broadcast-compliance-section";
import { SubAccountPayPalSection } from "@/components/settings/sub-account-paypal-section";
import { SubAccountPlanBillingSection } from "@/components/settings/sub-account-plan-billing-section";
import { SubAccountSendingPreferencesSection } from "@/components/settings/sub-account-sending-preferences-section";
import { SubAccountGoogleReviewSection } from "@/components/settings/sub-account-google-review-section";
import { SubAccountStripeSection } from "@/components/settings/sub-account-stripe-section";
import { SubAccountApiKeysSection } from "@/components/settings/sub-account-api-keys-section";
import { SubAccountApiRecipesSection } from "@/components/settings/sub-account-api-recipes-section";
import { SubAccountCalendarSyncSection } from "@/components/settings/sub-account-calendar-sync-section";
import { SubAccountGoogleCalendarSection } from "@/components/settings/sub-account-google-calendar-section";
import { SubAccountWebhooksSection } from "@/components/settings/sub-account-webhooks-section";
import { SubAccountBusinessBrainSection } from "@/components/settings/sub-account-business-brain-section";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/system/settings-section";
import { SettingsWorkspace, type SettingsNavGroup } from "@/components/system/settings-workspace";
import { LockedNotice } from "@/components/system/locked-notice";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill, Tag, type StatusTone } from "@/components/system/status-pill";
import type { UserDoc, SubscriptionStatus } from "@/types";
import type { Contact } from "@/types/contacts";

/**
 * Sub-account Settings — one Settings workspace (Visual Direction 2,
 * Section 4.4; visual-parity pass 2026-10-14). Every section that used to
 * live under the Admin / Messaging / API / Custom Fields / Business Brain /
 * Importer tabs now has ONE home in the grouped Settings column; `?section=`
 * selects it. Old `?tab=` links and OAuth return params still land on the
 * right section (see requestedSection).
 */

const PLAN_LABEL: Record<SubscriptionStatus, { label: string; tone: StatusTone }> = {
  active: { label: "Pro · Active", tone: "success" },
  trialing: { label: "Pro · Trial", tone: "info" },
  past_due: { label: "Pro · Past due", tone: "warning" },
  canceled: { label: "Canceled", tone: "danger" },
  inactive: { label: "Free plan", tone: "neutral" },
};

type SectionKey =
  | "business-profile"
  | "members"
  | "sending-preferences"
  | "calendar"
  | "sms"
  | "facebook-instagram"
  | "email-domain"
  | "custom-domain"
  | "google-reviews"
  | "pipeline"
  | "custom-fields"
  | "import"
  | "export"
  | "payments"
  | "subscription"
  | "business-brain"
  | "api-keys"
  | "webhooks";

const DESCRIPTIONS: Record<SectionKey, string> = {
  "business-profile": "Your workspace name, the client contact, and the logo used on quotes, invoices and public pages.",
  members: "Who can use this workspace, their roles, and optional territory scoping.",
  "sending-preferences": "How email and SMS leave this workspace — for automations, broadcasts and one-off sends.",
  calendar: "Subscribe to this workspace's calendar elsewhere, and bring members' Google Calendar events in.",
  sms: "A dedicated Twilio number for two-way SMS, the WhatsApp sender, and Missed Call Text Back.",
  "facebook-instagram": "One Meta connection for the Messenger + Instagram inbox and Social Planner posting.",
  "email-domain": "Send this workspace's email from its own domain instead of the shared sender.",
  "custom-domain": "Put booking pages, the Decoder, course pages and the client portal on your own domain.",
  "google-reviews": "Ask happy clients for a Google review by SMS or WhatsApp.",
  pipeline: "Rename and reorder your deal stages.",
  "custom-fields": "Extra fields on contacts and deals.",
  import: "Bring contacts, pipelines and history over from GoHighLevel.",
  export: "Take your data with you, any time.",
  payments: "How clients pay your invoices.",
  subscription: "This workspace's plan with your agency.",
  "business-brain": "The shared strategic context every AI-assisted content feature reads from.",
  "api-keys": "Quick-start recipes and keys for Zapier, Make, n8n and custom integrations.",
  webhooks: "Send workspace events to other apps as they happen.",
};

/** Old tab links (and OAuth return params) → their section. */
const LEGACY_TAB: Record<string, SectionKey> = {
  admin: "business-profile",
  messaging: "sms",
  api: "api-keys",
  "custom-fields": "custom-fields",
  "business-brain": "business-brain",
  import: "import",
};
/** The section the URL asks for (before checking what this member can see). */
function requestedSection(params: URLSearchParams): SectionKey | null {
  const s = params.get("section") as SectionKey | null;
  if (s && s in DESCRIPTIONS) return s;
  if (params.has("meta")) return "facebook-instagram";
  if (params.has("gcal")) return "calendar";
  if (params.has("stripeconnect")) return "payments";
  return LEGACY_TAB[params.get("tab") ?? ""] ?? null;
}

function SettingsPageInner() {
  const { user, role } = useAuth();
  const { subAccountId, agencyId, subAccount, isAdmin } = useSubAccount();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const workspaceName = subAccount?.name ?? "this sub-account";
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const showLegacySubscription = role === "admin" && LANDING_VARIANT === "leadstack";
  const billing = subAccount?.billing ?? null;
  const billed = !!billing && effectiveBillingState(billing) !== "comped";
  const metaOn = subAccount?.metaInboxEnabledByAgency === true || subAccount?.socialPlannerEnabledByAgency === true;

  const groups = useMemo<SettingsNavGroup[]>(() => {
    const item = (key: SectionKey, label: string, locked = false) => ({ key, label, description: DESCRIPTIONS[key], locked });
    // Admin-only sections render nothing for collaborators, so they only
    // see the sections they can actually use.
    const all: SettingsNavGroup[] = [
      {
        label: "Workspace",
        items: isAdmin
          ? [item("business-profile", "Business profile"), item("members", "Members"), item("sending-preferences", "Sending preferences"), item("calendar", "Calendar")]
          : [item("calendar", "Calendar")],
      },
      {
        label: "Channels",
        items: isAdmin
          ? [
              item("sms", "SMS & WhatsApp"),
              item("facebook-instagram", "Facebook & Instagram", !metaOn),
              item("email-domain", "Email domain", subAccount?.emailDomainEnabledByAgency !== true),
              item("custom-domain", "Custom domain", subAccount?.customDomainEnabledByAgency !== true),
              item("google-reviews", "Google reviews"),
            ]
          : [],
      },
      {
        label: "CRM data",
        items: isAdmin
          ? [item("pipeline", "Pipeline stages"), item("custom-fields", "Custom fields"), item("import", "Import"), item("export", "Export")]
          : [item("import", "Import")],
      },
      {
        label: "Money",
        items: [
          ...(isAdmin ? [item("payments", "Payments")] : []),
          ...(isAdmin || billed ? [item("subscription", "Your subscription")] : []),
        ],
      },
      { label: "AI", items: isAdmin ? [item("business-brain", "Business Brain")] : [] },
      { label: "Developers", items: isAdmin ? [item("api-keys", "API keys"), item("webhooks", "Webhooks")] : [] },
    ];
    return all.filter((g) => g.items.length > 0);
  }, [isAdmin, metaOn, billed, subAccount?.emailDomainEnabledByAgency, subAccount?.customDomainEnabledByAgency]);

  const keys = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.key as SectionKey)), [groups]);
  const requested = requestedSection(new URLSearchParams(params.toString()));
  const active: SectionKey = requested && keys.includes(requested) ? requested : keys[0];

  const hrefFor = useCallback((key: string) => `${pathname}?section=${key}`, [pathname]);

  // Old `?tab=` links and OAuth returns (`?meta=` / `?gcal=` /
  // `?stripeconnect=`) resolve to a section above. Pin that section in the
  // URL BEFORE the section's card runs its effects (a layout effect runs
  // ahead of every child's useEffect): the card reads its one-shot status
  // param on mount and then strips it, which would otherwise drop the page
  // back to the first section. The status param is kept for the card.
  // Resolved from the URL alone — membership may still be loading, and a
  // collaborator-only nav must not swallow an admin's OAuth return.
  const hasSectionParam = params.has("section");
  useLayoutEffect(() => {
    if (hasSectionParam || !requested) return;
    const q = new URLSearchParams(window.location.search);
    q.delete("tab");
    q.set("section", requested);
    window.history.replaceState(window.history.state, "", `${pathname}?${q.toString()}`);
  }, [hasSectionParam, requested, pathname]);
  const navigate = useCallback(
    (key: string) => {
      router.replace(hrefFor(key), { scroll: false });
      document.querySelector("main")?.scrollTo({ top: 0 });
    },
    [router, hrefFor],
  );

  useEffect(() => {
    if (!user) return;
    getUserDoc(user.uid).then((d) => setProfile(d));
  }, [user]);

  // Contacts are only needed for the Export section's count + CSV.
  useEffect(() => {
    if (!user || !agencyId || active !== "export") return;
    const unsub = subscribeToContacts({ agencyId, subAccountId }, setContacts);
    return () => unsub();
  }, [user, agencyId, subAccountId, active]);

  function handleExportContacts() {
    if (contacts.length === 0) {
      toast.error("No contacts to export yet.");
      return;
    }
    const headers = ["name", "email", "phone", "company", "source", "tags", "pipelineStage", "createdAt"];
    const rows = contacts.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      company: c.company,
      source: c.source,
      tags: c.tags ?? [],
      pipelineStage: c.pipelineStage ?? "",
      createdAt: toDate(c.createdAt)?.toISOString() ?? "",
    }));
    const csv = serializeCsv(headers, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`leadstack-contacts-${stamp}.csv`, csv);
    toast.success(`Exported ${rows.length} contacts`);
  }

  const plan = profile?.subscriptionStatus ? PLAN_LABEL[profile.subscriptionStatus] : PLAN_LABEL.inactive;

  return (
    <SettingsWorkspace
      subtitle={`Workspace preferences · ${workspaceName}`}
      groups={groups}
      activeKey={active}
      onNavigate={navigate}
      hrefFor={hrefFor}
      footer={
        <>
          Your own profile and password live in{" "}
          <Link href="/me/settings" className="font-medium text-link underline-offset-2 hover:underline">
            Your account
          </Link>
          .
        </>
      }
    >
      {active === "business-profile" && (
        <>
          {/* Workspace / business name — self-service rename, admin-only.
              Same canonical field + membership sync as the Agency-side
              rename dialog; only the slug (the public Space URL) is off
              limits here. */}
          <SubAccountWorkspaceNameSection />
          {/* Account contact — the human at the client this sub-account belongs to. */}
          <SubAccountContactSection />
          {/* Branding — the client's logo, used on quote/invoice emails, public
              link pages, and PDFs. Independent of agency-level branding. */}
          <SubAccountBrandingSection />
        </>
      )}

      {active === "members" && (
        <>
          {/* Members — admins (and the agency owner) invite, promote, remove. */}
          <SubAccountMembersSection />
          {/* Territory Scoping — opt-in restriction pinning collaborators to
              the regions they cover. Off by default. */}
          <SubAccountTerritoriesSection />
        </>
      )}

      {active === "sending-preferences" && (
        <>
          {/* Reply-To, send window, pause-all-workflows. Rehomed from the
              deleted legacy Automations → Settings page. */}
          <SubAccountSendingPreferencesSection />
          {/* Business mailing address — CAN-SPAM footer requirement, gates
              broadcast sending. */}
          <SubAccountBroadcastComplianceSection />
        </>
      )}

      {active === "calendar" && (
        <>
          {/* Calendar sync — per-sub-account .ics subscription URL. */}
          <SubAccountCalendarSyncSection />
          {/* Google Calendar two-way sync — pull a connected member's own
              events in. Self-gating (agency switch). */}
          <SubAccountGoogleCalendarSection />
        </>
      )}

      {/* SMS — opt-in dedicated Twilio number (also hosts the WhatsApp
          sender + Missed Call Text Back). */}
      {active === "sms" && <SubAccountSmsSection />}

      {active === "facebook-instagram" &&
        (metaOn ? (
          // Facebook + Instagram — the ONE shared Meta connection (inbox + Social Planner).
          <SubAccountMetaSection />
        ) : (
          <LockedNotice title="Locked by your agency">
            Facebook + Instagram (inbox and Social Planner) is switched off for this workspace. Ask your agency owner to
            enable it.
          </LockedNotice>
        ))}

      {/* Email sending domain — opt-in dedicated Resend domain (shows its own locked state). */}
      {active === "email-domain" && <SubAccountEmailDomainSection />}

      {/* Custom domain — opt-in Vercel domain for public pages (shows its own locked state). */}
      {active === "custom-domain" && <SubAccountCustomDomainSection />}

      {/* Google reviews — SMS / WhatsApp review-request sends. */}
      {active === "google-reviews" && <SubAccountGoogleReviewSection />}

      {/* Pipeline — rename + reorder deal stages (labels/order only). */}
      {active === "pipeline" && <SubAccountPipelineSection />}

      {/* Custom Fields — operator-defined fields on contacts + deals. */}
      {active === "custom-fields" && <SubAccountCustomFieldsSection />}

      {/* Import — GoHighLevel migration wizard. */}
      {active === "import" && <GhlImportWizard />}

      {active === "export" && (
        <SettingsSection title="Export contacts" description="CSV with tags, source, and timestamps.">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-4">
            <p className="text-body-sm text-foreground">
              <span className="font-medium">{contacts.length}</span> contact{contacts.length === 1 ? "" : "s"}
            </p>
            <Button variant="outline" size="sm" onClick={handleExportContacts} disabled={contacts.length === 0}>
              <Download className="size-3.5" aria-hidden="true" />
              Download CSV
            </Button>
          </div>
        </SettingsSection>
      )}

      {active === "payments" && (
        <>
          {/* PayPal.me username for the Products + Invoices flow. */}
          <SubAccountPayPalSection />
          {/* Stripe Connect. */}
          <SubAccountStripeSection />
        </>
      )}

      {active === "subscription" && (
        <>
          {/* Client Billing v1 — self-gating: renders only when the agency
              bills this workspace through the platform. */}
          <SubAccountPlanBillingSection />
          {/* Legacy plan card — LeadStack-branded deployment only. */}
          {showLegacySubscription && (
            <SettingsSection
              title="Subscription"
              description="This sub-account's plan with the agency. Defaults to free; upgrade unlocks higher limits + premium features."
              action={<Tag color="gray">Roadmap</Tag>}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-4">
                <StatusPill tone={plan.tone}>{plan.label}</StatusPill>
                <span
                  title="Per-sub-account billing is on the roadmap. Coming with the Stripe Connect upgrade."
                  className="cursor-not-allowed"
                >
                  <Button size="sm" disabled className="pointer-events-none">
                    See plans
                  </Button>
                </span>
              </div>
            </SettingsSection>
          )}
          {!billed && !showLegacySubscription && (
            <EmptyState
              compact
              title="No plan to manage"
              description="Your agency doesn't bill this workspace through the platform, so there's nothing to manage here."
            />
          )}
        </>
      )}

      {/* Business Brain — the canonical businessBrain/main document every
          AI-assisted content feature reads via getBusinessBrain(). */}
      {active === "business-brain" && <SubAccountBusinessBrainSection />}

      {active === "api-keys" && (
        <>
          {/* Quick start — guided setup for the common integrations. */}
          <SubAccountApiRecipesSection />
          {/* API keys — programmatic access for Zapier, Make, custom pages. */}
          <SubAccountApiKeysSection />
        </>
      )}

      {/* Webhooks — outbound event delivery to subscriber URLs. */}
      {active === "webhooks" && <SubAccountWebhooksSection />}
    </SettingsWorkspace>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}
