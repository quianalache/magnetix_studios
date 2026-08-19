"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Input } from "@/components/ui/input";

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sub-accounts/${subAccountId}/community-polls/${groupId}/${postId}`)
      .then((r) => r.json())
      .then((d: { poll?: AdminPollDetail }) => {
        if (!cancelled) setDetail(d.poll ?? null);
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
    <div className="momentum-scope mx-auto w-full max-w-3xl space-y-6 rounded-2xl">
      <Link
        href={saPath("/forms/community-polls")}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Community Polls
      </Link>

      {loading ? (
        <div className="h-40 animate-pulse rounded-2xl border bg-muted/30" />
      ) : !detail ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Poll not found.
        </div>
      ) : (
        <>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{detail.groupName}</p>
            <h1 className="text-xl font-bold tracking-tight">{detail.postTitle}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.votes.length} {detail.votes.length === 1 ? "response" : "responses"} ·{" "}
              {detail.allowMultiple ? "Multiple answers allowed" : "Single answer"} ·{" "}
              {detail.showResults ? "Results visible to members" : "Results hidden from members"} ·{" "}
              {detail.closed ? "Closed" : "Open"}
            </p>
          </div>

          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by member name…"
              className="pl-8"
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Member</th>
                  <th className="px-4 py-2.5 font-medium">Selected</th>
                  <th className="px-4 py-2.5 font-medium">Voted</th>
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
                    <tr key={v.memberId} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium">{v.memberDisplayName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {v.optionIds.map((id) => optionText.get(id) ?? id).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {v.votedAtMs ? new Date(v.votedAtMs).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
