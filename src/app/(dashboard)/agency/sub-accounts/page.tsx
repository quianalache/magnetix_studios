"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { ArrowRight, Building2, ChevronRight, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getFirebaseDb } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { SubAccountManageDialog } from "@/components/agency/sub-account-manage-dialog";
import { SnapshotsSection } from "@/components/agency/snapshots-section";
import { BillingStatusBadge } from "@/components/agency/billing-status-badge";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { SearchField } from "@/components/system/search-field";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import {
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_ROW,
  DATA_TABLE_TD,
  DATA_TABLE_TH,
  DataTableShell,
} from "@/components/system/data-table";
import type { SubAccountDoc } from "@/types";

export default function SubAccountsListPage() {
  const { agencyId, agencyRole, loading: authLoading } = useAuth();
  const [subs, setSubs] = useState<SubAccountDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [managingId, setManagingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const isAgencyOwner = agencyRole === "owner";
  const managing = subs.find((s) => s.id === managingId) ?? null;

  useEffect(() => {
    if (!agencyId) {
      setSubs([]);
      setLoading(false);
      return;
    }
    // Filter by agencyId only; sort client-side. Adding orderBy here would
    // require a composite (agencyId, createdAt) index, which is friction we
    // don't need for what's typically a small list per agency.
    //
    // This IS the canonical sub-account list — a direct query against
    // `subAccounts`, not the `memberships` (userMemberships index) the
    // workspace switcher renders from. See agency-home-dashboard.tsx's
    // "CANONICAL VISIBILITY RULE" for why that distinction matters (a
    // stale userMemberships pointer once made the switcher disagree with
    // this page about how many sub-accounts exist).
    const q = query(
      collection(getFirebaseDb(), "subAccounts"),
      where("agencyId", "==", agencyId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SubAccountDoc);
        list.sort(
          (a, b) =>
            (a.accountNumber ?? Number.MAX_SAFE_INTEGER) -
            (b.accountNumber ?? Number.MAX_SAFE_INTEGER),
        );
        setSubs(list);
        setLoading(false);
      },
      (err) => {
        console.error("[agency/sub-accounts] listen failed", err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [agencyId]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? subs.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.accountNumber !== undefined && `#${s.accountNumber}`.includes(q)) ||
          (s.billing?.planName ?? "").toLowerCase().includes(q),
      )
    : subs;

  if (authLoading || loading) {
    return <PageShellLoading width="data" />;
  }

  const empty = (
    <EmptyState
      compact
      icon={Building2}
      title={subs.length === 0 ? "No sub-accounts yet" : "No matches"}
      description={
        subs.length === 0
          ? "Create a workspace for your first client."
          : "Try a different name, plan or account number."
      }
    />
  );

  return (
    <PageShell width="data">
      <PageHeader
        title="Sub-accounts"
        description="One workspace per client. Each sub-account has its own contacts, pipeline, and team."
        actions={
          agencyRole === "owner" ? (
            <Button render={<Link href="/agency/sub-accounts/new" />}>
              <Plus />
              New sub-account
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3">
        {subs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search by name, plan or #"
              aria-label="Search sub-accounts"
              className="sm:max-w-xs"
            />
            <p className="text-caption text-muted-foreground">
              {visible.length === subs.length
                ? `${subs.length} ${subs.length === 1 ? "sub-account" : "sub-accounts"}`
                : `${visible.length} of ${subs.length}`}
            </p>
          </div>
        )}

        {/* Phones: card rows — the whole row OPENS the sub-account (a table's
            crushed action cell is unreachable at 390px); Manage stays a
            discrete button for owners. */}
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-card md:hidden">
          {visible.length === 0 ? (
            empty
          ) : (
            <ul className="divide-y divide-border-subtle">
              {visible.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sa/${s.id}/dashboard`}
                    className="flex min-h-14 select-none items-center gap-3 px-4 py-3 transition-colors active:bg-tint-violet"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-foreground">{s.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
                        <span className="font-mono">
                          {s.accountNumber !== undefined ? `#${s.accountNumber}` : "—"}
                        </span>
                        {s.billing?.planName ? <span className="truncate">{s.billing.planName}</span> : null}
                        <BillingStatusBadge billing={s.billing} />
                      </div>
                    </div>
                    {isAgencyOwner && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={(e) => {
                          // Inside the row Link — keep the tap from navigating.
                          e.preventDefault();
                          e.stopPropagation();
                          setManagingId(s.id);
                        }}
                      >
                        Manage
                      </Button>
                    )}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DataTableShell className="hidden md:block" minWidth="52rem">
          <thead>
            <tr className={DATA_TABLE_HEAD_ROW}>
              <th className={`${DATA_TABLE_TH} w-20`}>#</th>
              <th className={DATA_TABLE_TH}>Name</th>
              <th className={DATA_TABLE_TH}>Workspace</th>
              <th className={DATA_TABLE_TH}>Plan</th>
              <th className={DATA_TABLE_TH}>Billing</th>
              <th className={`${DATA_TABLE_TH} hidden lg:table-cell`}>Timezone</th>
              <th className={DATA_TABLE_TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7}>{empty}</td>
              </tr>
            ) : (
              visible.map((s) => (
                <tr key={s.id} className={DATA_TABLE_ROW}>
                  <td className={`${DATA_TABLE_TD} font-mono text-caption text-muted-foreground`}>
                    {s.accountNumber !== undefined ? `#${s.accountNumber}` : "—"}
                  </td>
                  <td className={`${DATA_TABLE_TD} max-w-72 font-medium text-foreground`}>
                    <span className="line-clamp-2">{s.name}</span>
                  </td>
                  <td className={DATA_TABLE_TD}>
                    <StatusPill status={s.status ?? "active"} className="capitalize">
                      {s.status ?? "active"}
                    </StatusPill>
                  </td>
                  <td className={`${DATA_TABLE_TD} max-w-56 text-muted-foreground`}>
                    <span className="line-clamp-2">{s.billing?.planName ?? "—"}</span>
                  </td>
                  <td className={DATA_TABLE_TD}>
                    <BillingStatusBadge billing={s.billing} />
                  </td>
                  <td className={`${DATA_TABLE_TD} hidden text-muted-foreground lg:table-cell`}>
                    {s.timezone ?? "—"}
                  </td>
                  <td className={`${DATA_TABLE_TD} text-right`}>
                    <div className="flex items-center justify-end gap-2">
                      {isAgencyOwner && (
                        <Button type="button" size="sm" variant="outline" onClick={() => setManagingId(s.id)}>
                          Manage
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" render={<Link href={`/sa/${s.id}/dashboard`} />}>
                        Open
                        <ArrowRight />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </DataTableShell>
      </div>

      {isAgencyOwner && (
        <SnapshotsSection
          subs={subs.map((s) => ({
            id: s.id,
            name: s.name,
            accountNumber: s.accountNumber,
          }))}
        />
      )}

      <SubAccountManageDialog
        subAccount={managing}
        open={!!managingId}
        onOpenChange={(open) => {
          if (!open) setManagingId(null);
        }}
      />
    </PageShell>
  );
}
