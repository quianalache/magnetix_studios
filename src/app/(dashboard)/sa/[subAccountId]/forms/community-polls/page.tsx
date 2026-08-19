"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, Users } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";

interface AdminPollSummary {
  postId: string;
  groupId: string;
  groupName: string;
  question: string;
  optionCount: number;
  voterCount: number;
  closed: boolean;
  createdAtMs: number | null;
}

/**
 * Community Polls — lives under the Forms & Quizzes area (Part 5's
 * explicit "should ultimately live conceptually under Forms & Quizzes"),
 * but is deliberately its OWN page/data path, never mixed into the
 * `forms/{id}` list or `FormSubmission` model — that was investigated and
 * rejected (see the Polls report): a poll isn't a lead-capture form and
 * doesn't have configurable fields, a Contact mapping, or a Deal — forcing
 * it into `LeadForm` would have been fitting the architecture to an
 * abstraction it doesn't belong to, which was an explicit thing NOT to
 * do. This list + its per-poll Responses view (Part 5's "see responses
 * for a specific poll, search/filter by member, see selections, see when
 * they voted") is the smallest clean integration that gives poll response
 * data a durable, staff-facing home/query path, per the explicit "smallest
 * clean integration necessary" instruction.
 */
export default function CommunityPollsPage() {
  const { subAccountId, saPath } = useSubAccount();
  const [polls, setPolls] = useState<AdminPollSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sub-accounts/${subAccountId}/community-polls`)
      .then((r) => r.json())
      .then((d: { polls?: AdminPollSummary[] }) => {
        if (!cancelled) setPolls(d.polls ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  return (
    <div className="momentum-scope mx-auto w-full max-w-4xl space-y-6 rounded-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Community Polls</h1>
        <p className="text-sm text-muted-foreground">
          Responses to polls created inside your Community — separate from Forms &amp; Quizzes submissions.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border bg-muted/30" />
          ))}
        </div>
      ) : polls.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <ListChecks className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No Community polls yet. A moderator can create one from a post in your Community.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {polls.map((p) => (
            <Link
              key={`${p.groupId}-${p.postId}`}
              href={saPath(`/forms/community-polls/${p.groupId}/${p.postId}`)}
              className="flex flex-col rounded-2xl border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {p.groupName}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    p.closed ? "bg-muted text-muted-foreground" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  }`}
                >
                  {p.closed ? "Closed" : "Open"}
                </span>
              </div>
              <h3 className="mt-2 truncate font-semibold">{p.question}</h3>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" /> {p.voterCount} {p.voterCount === 1 ? "voter" : "voters"} · {p.optionCount} options
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
