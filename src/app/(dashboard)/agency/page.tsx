"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import {
  Building2,
  ArrowRight,
  Users,
  FlaskConical,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SectionHeader } from "@/components/system/section-header";
import { SearchField } from "@/components/system/search-field";
import { EmptyState } from "@/components/system/empty-state";
import { AgencyHomeDashboard } from "@/components/agency/agency-home-dashboard";
import { LANDING_VARIANT } from "@/config/landing";
import type { SubAccountDoc } from "@/types";

function ErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  if (error !== "no-access") return null;
  return (
    <Alert tone="warning" title="No access to that sub-account">
      Pick one below or ask the agency owner for an invite.
    </Alert>
  );
}

function AgencyHomeContent() {
  const { user, loading, agencyId, agencyRole, memberships } = useAuth();
  const [filter, setFilter] = useState("");
  const isOwner = agencyRole === "owner";

  const visible = memberships.filter((m) =>
    m.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  // Owner-only: real subAccounts docs feeding the Overview dashboard's
  // metrics/charts. This is a DIRECT `subAccounts` query (agencyId ==), not
  // the `memberships` (userMemberships index) list above — that index is
  // scoped to "workspaces THIS viewer belongs to" and can go stale (see the
  // canonical-visibility note in agency-home-dashboard.tsx); this query is
  // the source of truth for "which sub-accounts actually exist," the same
  // one the dedicated /agency/sub-accounts page uses.
  const [subs, setSubs] = useState<SubAccountDoc[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);

  useEffect(() => {
    if (!isOwner || !agencyId) {
      setSubs([]);
      setSubsLoading(false);
      return;
    }
    const q = query(
      collection(getFirebaseDb(), "subAccounts"),
      where("agencyId", "==", agencyId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSubs(snap.docs.map((d) => d.data() as SubAccountDoc));
        setSubsLoading(false);
      },
      (err) => {
        console.error("[agency] sub-account listen failed", err);
        setSubsLoading(false);
      },
    );
    return () => unsub();
  }, [isOwner, agencyId]);

  const agency = useAgency();
  useEffect(() => {
    document.title = `Agency · ${agency.name}`;
  }, [agency.name]);

  if (loading) {
    return <PageShellLoading width="data" />;
  }

  if (!user || !agencyId) {
    return (
      <PageShell width="data">
        <EmptyState icon={Building2} title="Sign in to view your agency" />
      </PageShell>
    );
  }

  // Non-owners (including staff who happen to belong to multiple
  // sub-accounts) get a plain picker — nothing else. The SaaS operator
  // dashboard below is owner-only: it surfaces platform revenue/customer
  // data that has no reason to be visible to anyone else, reusing the same
  // `agencyRole === "owner"` check every other real Agency control in this
  // app already gates on (no parallel permission system). This is also the
  // ONLY place `memberships` (the per-viewer userMemberships index) drives
  // what's shown — it's correct here because it's answering "which
  // workspaces can *I* open," not "how many sub-accounts exist."
  if (!isOwner) {
    return (
      <PageShell width="data">
        <PageHeader title="Agency" description="Switch into a sub-account." />
        <Suspense fallback={null}>
          <ErrorBanner />
        </Suspense>
        <section className="flex flex-col gap-4 rounded-card border border-border bg-card p-5 shadow-card">
          <SectionHeader
            icon={Building2}
            title="Your sub-accounts"
            description={`${memberships.length} total`}
            action={
              memberships.length > 4 ? (
                <SearchField
                  value={filter}
                  onChange={setFilter}
                  placeholder="Filter…"
                  aria-label="Filter sub-accounts"
                  className="w-48"
                />
              ) : null
            }
          />

          {memberships.length === 0 ? (
            <EmptyState compact icon={Building2} title="You don't have access to any sub-accounts yet" />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((m) => (
                <li key={m.subAccountId}>
                  <Link
                    href={`/sa/${m.subAccountId}/dashboard`}
                    className="group flex h-full flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-tint-violet"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate text-body font-medium text-foreground">{m.name || "Untitled"}</p>
                        {m.accountNumber !== undefined && (
                          <span className="font-mono text-micro text-muted-foreground">#{m.accountNumber}</span>
                        )}
                      </div>
                      <p className="text-caption capitalize text-muted-foreground">{m.role}</p>
                    </div>
                    <span className="flex items-center gap-1 text-caption font-medium text-link">
                      Open <ArrowRight className="size-3" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageShell>
    );
  }

  const firstName = user.displayName?.trim().split(/\s+/)[0] || agency.name;

  return (
    <PageShell width="data">
      <Suspense fallback={null}>
        <ErrorBanner />
      </Suspense>

      {/* LeadStack-template-only surfaces (the underlying template's own
          A/B landing test + reseller affiliate program) — dead/hidden on
          Magnetix's own "custom" deployment; see the Agency Architecture
          audit. Kept generic so a LANDING_VARIANT="leadstack" deployment
          still has them. */}
      {LANDING_VARIANT === "leadstack" && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" render={<Link href="/agency/landing" />}>
            <FlaskConical />
            A/B/C test
          </Button>
          <Button variant="outline" render={<Link href="/agency/affiliates" />}>
            <Users />
            Affiliates
          </Button>
        </div>
      )}

      {/* Agency Home = the SaaS/operator overview dashboard, full stop.
          Sub-account management lives at the dedicated /agency/sub-accounts
          page (linked from Quick Actions below); integration/deployment
          health lives at Agency Settings. Neither is duplicated here
          anymore (2026-09-16 shell cleanup — see the task's "AGENCY HOME
          TAB CLEANUP" note for why both were removed). */}
      <AgencyHomeDashboard
        firstName={firstName}
        agencyName={agency.name}
        subs={subs}
        subsLoading={subsLoading}
      />
    </PageShell>
  );
}


export default function AgencyHomePage() {
  return <AgencyHomeContent />;
}
