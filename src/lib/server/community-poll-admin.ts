import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { CommunityPost } from "@/types/community";

/**
 * Admin-side (staff/owner) read path for Community Polls — the "durable
 * home/query path" Part 5 of the Polls spec asked to live conceptually
 * under Forms & Quizzes, WITHOUT forcing poll data into `LeadForm`/
 * `FormSubmission` (investigated and rejected — see the Polls report:
 * those types are lead-capture/Contact/Deal-coupled, nothing a poll is).
 * This is deliberately a SEPARATE, parallel, clearly-labeled read path —
 * "distinguish Community Poll responses from Form/Quiz submissions" is
 * satisfied by construction (different module, different page, never
 * touches `forms/{id}`), not by a shared-but-tagged model.
 *
 * Poll/vote docs live under the Community's own tree
 * (`subAccounts/{id}/communityGroups/{groupId}/posts/{postId}` +
 * `.../pollVotes/{memberId}`), so a cross-poll admin list needs a
 * collection-group query. `hasPoll`/`subAccountId` are denormalized onto
 * every post specifically so this query needs only a SINGLE equality
 * filter (`subAccountId`) — no composite index to provision — then
 * filters `hasPoll` in memory. Fine for v1 admin tooling (not a hot
 * path); revisit with a composite index if a tenant's post volume ever
 * makes the in-memory filter a real cost.
 */
export interface AdminPollSummary {
  postId: string;
  groupId: string;
  groupName: string;
  postTitle: string;
  question: string;
  optionCount: number;
  voterCount: number;
  closed: boolean;
  endsAtMs: number | null;
  createdAtMs: number | null;
}

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  return null;
}

export async function listPollsForSubAccount(subAccountId: string): Promise<AdminPollSummary[]> {
  const db = getAdminDb();
  const snap = await db
    .collectionGroup("posts")
    .where("subAccountId", "==", subAccountId)
    .get();

  const withPolls = snap.docs.filter((d) => d.data().hasPoll === true);
  if (withPolls.length === 0) return [];

  // Group names aren't on the post doc — batch-read the small number of
  // distinct groups referenced, same "batch, don't N+1" discipline as
  // `hydrateAuthors` in community-feed-service.ts.
  const groupIds = Array.from(new Set(withPolls.map((d) => (d.data() as CommunityPost).groupId)));
  const groupRefs = groupIds.map((id) => db.doc(`subAccounts/${subAccountId}/communityGroups/${id}`));
  const groupSnaps = groupIds.length ? await db.getAll(...groupRefs) : [];
  const groupNames = new Map(groupIds.map((id, i) => [id, (groupSnaps[i]?.data()?.name as string | undefined) ?? "Community"]));

  return withPolls
    .map((d) => {
      const post = d.data() as CommunityPost;
      const poll = post.poll!;
      const endsAtMs = toMillis(poll.endsAt);
      return {
        postId: d.id,
        groupId: post.groupId,
        groupName: groupNames.get(post.groupId) ?? "Community",
        postTitle: post.title,
        question: post.title || "(untitled poll)",
        optionCount: poll.options.length,
        voterCount: poll.voterCount,
        closed: endsAtMs !== null && endsAtMs <= Date.now(),
        endsAtMs,
        createdAtMs: toMillis(post.createdAt),
      };
    })
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}

export interface AdminPollVote {
  memberId: string;
  memberDisplayName: string;
  optionIds: string[];
  votedAtMs: number | null;
}

export interface AdminPollDetail {
  postTitle: string;
  groupName: string;
  options: { id: string; text: string }[];
  allowMultiple: boolean;
  showResults: boolean;
  closed: boolean;
  endsAtMs: number | null;
  votes: AdminPollVote[];
}

export async function getPollDetailForAdmin(opts: {
  subAccountId: string;
  groupId: string;
  postId: string;
}): Promise<AdminPollDetail | null> {
  const db = getAdminDb();
  const postRef = db.doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/posts/${opts.postId}`,
  );
  const [postSnap, groupSnap, votesSnap] = await Promise.all([
    postRef.get(),
    db.doc(`subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`).get(),
    postRef.collection("pollVotes").orderBy("votedAt", "desc").get(),
  ]);
  if (!postSnap.exists) return null;
  const post = postSnap.data() as CommunityPost;
  const poll = post.poll;
  if (!poll) return null;

  const endsAtMs = toMillis(poll.endsAt);
  return {
    postTitle: post.title || "(untitled poll)",
    groupName: (groupSnap.data()?.name as string | undefined) ?? "Community",
    options: poll.options,
    allowMultiple: poll.allowMultiple,
    showResults: poll.showResults,
    closed: endsAtMs !== null && endsAtMs <= Date.now(),
    endsAtMs,
    votes: votesSnap.docs.map((d) => {
      const v = d.data();
      return {
        memberId: v.memberId as string,
        memberDisplayName: (v.memberDisplayName as string | undefined) ?? "Member",
        optionIds: (v.optionIds as string[] | undefined) ?? [],
        votedAtMs: toMillis(v.votedAt),
      };
    }),
  };
}
