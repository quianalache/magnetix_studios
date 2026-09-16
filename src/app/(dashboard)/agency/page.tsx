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
  AlertCircle,
  Users,
  FlaskConical,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgencyHomeDashboard } from "@/components/agency/agency-home-dashboard";
import { LANDING_VARIANT } from "@/config/landing";
import type { SubAccountDoc } from "@/types";

function ErrorBanner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  if (error !== "no-access") return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
      <div>
        <p className="font-medium">No access to that sub-account</p>
        <p className="text-muted-foreground">
          Pick one below or ask the agency owner for an invite.
        </p>
      </div>
    </div>
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
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted/50" />
      </div>
    );
  }

  if (!user || !agencyId) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to view your agency.
        </p>
      </div>
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agency</h1>
          <p className="text-sm text-muted-foreground">
            Switch into a sub-account.
          </p>
        </div>
        <Suspense fallback={null}>
          <ErrorBanner />
        </Suspense>
        <section className="rounded-2xl border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Building2 className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Your sub-accounts</h2>
                <p className="text-xs text-muted-foreground">
                  {memberships.length} total
                </p>
              </div>
            </div>
            {memberships.length > 4 && (
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter…"
                className="h-8 w-48"
              />
            )}
          </div>

          {memberships.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
              You don&apos;t have access to any sub-accounts yet.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((m) => (
                <li key={m.subAccountId}>
                  <Link
                    href={`/sa/${m.subAccountId}/dashboard`}
                    className="group flex h-full flex-col justify-between gap-3 rounded-xl border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <div>
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-medium">
                          {m.name || "Untitled"}
                        </p>
                        {m.accountNumber !== undefined && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{m.accountNumber}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {m.role}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground">
                      Open <ArrowRight className="h-3 w-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const firstName = user.displayName?.trim().split(/\s+/)[0] || agency.name;

  return (
    <div className="space-y-6">
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
            <FlaskConical className="mr-1 h-4 w-4" />
            A/B/C test
          </Button>
          <Button variant="outline" render={<Link href="/agency/affiliates" />}>
            <Users className="mr-1 h-4 w-4" />
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
    </div>
  );
}


export default function AgencyHomePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <AgencyHomeContent />
    </div>
  );
}
