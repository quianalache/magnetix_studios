"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { SearchField } from "@/components/system/search-field";
import { DataTableShell, DATA_TABLE_HEAD_ROW, DATA_TABLE_ROW, DATA_TABLE_TD, DATA_TABLE_TH } from "@/components/system/data-table";
import { ArrowLeft } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";

interface AdminPollVote {
  memberId: string;
  memberDisplayName: string;
  optionIds: string[];
  votedAtMs: number | null;
}
interface AdminPollDetail {
  postTitle: string;
  groupName: string;
  options: { id: string; text: string }[];
  allowMultiple: boolean;
  showResults: boolean;
  closed: boolean;
  endsAtMs: number | null;
  votes: AdminPollVote[];
}

/** Part 5's "search/filter responses by Community member, see which
 *  choice(s) a member selected, see when they voted" — the per-poll
 *  Responses view. Data comes straight from `pollVotes`, the SAME
 *  subcollection production voting reads/writes — this page reads
 *  nothing that isn't also exactly what governs live poll behavior. */
export default function PollResponsesPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string; postId: string }>;
}) {
  const { groupId, postId } = use(params);
  const { subAccountId, saPath } = useSubAccount();
  const [detail, setDetail] = useState<AdminPollDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // Same fix as the list page (found live during QA there) — a real
  // server error must never render identically to a genuine 404.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/sub-accounts/${subAccountId}/community-polls/${groupId}/${postId}`)
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { poll?: AdminPollDetail; error?: string };
        if (cancelled) return;
        if (!r.ok) {
          if (r.status !== 404) setError(d.error ?? "Couldn't load this poll");
          setDetail(null);
          return;
        }
        setDetail(d.poll ?? null);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this poll");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId, groupId, postId]);

  const optionText = useMemo(() => {
    const map = new Map<string, string>();
    detail?.options.forEach((o) => map.set(o.id, o.text));
    return map;
  }, [detail]);

  const filteredVotes = useMemo(() => {
    const votes = detail?.votes ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return votes;
    return votes.filter((v) => v.memberDisplayName.toLowerCase().includes(q));
  }, [detail, query]);

  return (
    <PageShell width="data">
      {loading ? (
        <PageShellLoadingBlock />
      ) : error ? (
        <>
          <BackLink href={saPath("/forms/community-polls")} />
          <Alert tone="danger" title="Couldn't load this poll">
            {error}
          </Alert>
        </>
      ) : !detail ? (
        <>
          <BackLink href={saPath("/forms/community-polls")} />
          <EmptyState compact title="Poll not found" />
        </>
      ) : (
        <>
          <PageHeader
            breadcrumbs={
              <Link href={saPath("/forms/community-polls")} className="inline-flex items-center gap-1 hover:text-foreground">
                <ArrowLeft className="size-3.5" aria-hidden="true" /> Community Polls
              </Link>
            }
            eyebrow={detail.groupName}
            title={detail.postTitle}
            description={
              <>
                {detail.votes.length} {detail.votes.length === 1 ? "response" : "responses"} ·{" "}
                {detail.allowMultiple ? "Multiple answers allowed" : "Single answer"} ·{" "}
                {detail.showResults ? "Results visible to members" : "Results hidden from members"} ·{" "}
                {detail.closed ? "Closed" : "Open"}
              </>
            }
          />

          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search by member name…"
            aria-label="Search by member name"
            className="sm:max-w-xs"
          />

          <DataTableShell minWidth="36rem">
            <thead>
              <tr className={DATA_TABLE_HEAD_ROW}>
                <th className={DATA_TABLE_TH}>Member</th>
                <th className={DATA_TABLE_TH}>Selected</th>
                <th className={DATA_TABLE_TH}>Voted</th>
              </tr>
            </thead>
            <tbody>
              {filteredVotes.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    {query ? "No members match that search." : "No votes yet."}
                  </td>
                </tr>
              ) : (
                filteredVotes.map((v) => (
                  <tr key={v.memberId} className={DATA_TABLE_ROW}>
                    <td className={`${DATA_TABLE_TD} font-medium text-foreground`}>{v.memberDisplayName}</td>
                    <td className={`${DATA_TABLE_TD} text-muted-foreground`}>
                      {v.optionIds.map((id) => optionText.get(id) ?? id).join(", ") || "—"}
                    </td>
                    <td className={`${DATA_TABLE_TD} text-muted-foreground`}>
                      {v.votedAtMs ? new Date(v.votedAtMs).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTableShell>
        </>
      )}
    </PageShell>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-body-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> Community Polls
    </Link>
  );
}

function PageShellLoadingBlock() {
  return <Skeleton className="h-40 rounded-card" />;
}
