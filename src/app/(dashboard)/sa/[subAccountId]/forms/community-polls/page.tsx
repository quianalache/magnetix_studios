"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill, Tag } from "@/components/system/status-pill";
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
  // Found live during QA: the old version parsed the response body
  // unconditionally and did `d.polls ?? []` — a genuine server error (a
  // missing Firestore index threw a 500 here at one point) rendered
  // exactly like a real "no polls yet" empty state, with no visible sign
  // anything had gone wrong. `error` is now tracked separately so a real
  // failure gets its own distinct UI instead of masquerading as empty.
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/sub-accounts/${subAccountId}/community-polls`)
      .then(async (r) => {
        const d = (await r.json().catch(() => ({}))) as { polls?: AdminPollSummary[]; error?: string };
        if (cancelled) return;
        if (!r.ok) {
          setError(d.error ?? "Couldn't load Community polls");
          return;
        }
        setPolls(d.polls ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load Community polls");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  return (
    <PageShell width="data">
      <PageHeader
        title="Community Polls"
        description="Responses to polls created inside your Community — separate from Forms & Quizzes submissions."
        breadcrumbs={
          <Link href={saPath("/forms")} className="hover:text-foreground">
            Forms
          </Link>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : error ? (
        <Alert tone="danger" title="Couldn't load Community polls">
          {error}
        </Alert>
      ) : polls.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No Community polls yet"
          description="A moderator can create one from a post in your Community."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {polls.map((p) => (
            <Link
              key={`${p.groupId}-${p.postId}`}
              href={saPath(`/forms/community-polls/${p.groupId}/${p.postId}`)}
              className="flex flex-col rounded-card border border-border bg-card p-4 shadow-card outline-none transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex items-start justify-between gap-2">
                <Tag>{p.groupName}</Tag>
                <StatusPill tone={p.closed ? "neutral" : "success"}>{p.closed ? "Closed" : "Open"}</StatusPill>
              </div>
              <h3 className="mt-2 truncate text-section font-semibold text-foreground">{p.question}</h3>
              <p className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
                <Users className="size-3" aria-hidden="true" /> {p.voterCount} {p.voterCount === 1 ? "voter" : "voters"} · {p.optionCount} options
              </p>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
