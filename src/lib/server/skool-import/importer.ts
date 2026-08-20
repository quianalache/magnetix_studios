import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { ensureMember, findMemberByEmail } from "@/lib/community/member-account";
import {
  createChannelServerSide,
  ensureChannelsForGroup,
} from "@/lib/server/community-channels-service";
import { getGroupBySlug, createGroupServerSide } from "@/lib/server/community-service";
import { getExistingMappingsBulk, writeMapping } from "./import-mappings";
import { ensureHistoricalAuthorMember, findHistoricalAuthorMember } from "./historical-author";
import {
  mapSkoolAttachments,
  mapSkoolPost,
  flattenSkoolCommentsToTwoLevels,
  splitCategoryLabel,
} from "./mapping";
import type { EnrichedSkoolMember, SkoolComment, SkoolPost } from "./types";
import type { CommunityChannel } from "@/types/community";

/**
 * Orchestrates one run over already-EXTRACTED Skool data (see skool-extract
 * .ts — this module has zero knowledge of HTTP/Skool session details) —
 * either as a `commit: false` dry-run PLAN (guaranteed zero Firestore/
 * storage mutations) or a `commit: true` EXECUTE pass. Both share the exact
 * same walk/branch logic below, differing only in whether the "would
 * create" branch actually writes — this is deliberate: a dry run that used
 * a separately-written code path could silently drift from what a real run
 * actually does. The one thing dry-run mode does differently in its own
 * right is member reconciliation: it can't call the real `ensureMember`
 * (that function unconditionally WRITES a Member+Contact+Person the first
 * time it sees an email), so a read-only mirror of its lookup logic runs
 * instead — see `planMemberReconciliation` below.
 */

export interface ImportCounts {
  received: number;
  matchedExisting: number;
  wouldCreate: number;
  created: number;
  skipped: number;
  failed: number;
}

function emptyCounts(received = 0): ImportCounts {
  return { received, matchedExisting: 0, wouldCreate: 0, created: 0, skipped: 0, failed: 0 };
}

export interface ImportError {
  entity: string;
  externalId: string;
  message: string;
}

export interface ImportReport {
  commit: boolean;
  targetGroupExisted: boolean;
  targetGroupId: string | null;
  channels: ImportCounts;
  members: ImportCounts;
  memberships: ImportCounts;
  posts: ImportCounts;
  comments: ImportCounts;
  errors: ImportError[];
  /** Kept for interface stability / as an honest safety net — expected
   *  ALWAYS EMPTY now that Gap 2 gives every author either a real,
   *  email-based Member or a historical-author Member (see
   *  `historicalAuthors` below); there is no remaining code path that
   *  discards a member for lack of email. */
  unresolvedMembers: { skoolUserId: string; name: string }[];
  /** Gap 2 — members with no resolvable email, represented via
   *  `ensureHistoricalAuthorMember` instead of being skipped. Every post/
   *  comment they authored can now import with real (historical)
   *  authorship. */
  historicalAuthors: { skoolUserId: string; name: string }[];
  /** Gap 1 — posts with at least one Skool-hosted video attachment
   *  deliberately deferred this pass (expiring signed HLS URLs — see
   *  mapping.ts's mapSkoolAttachments). A separate download/rehost track
   *  is needed for these later. */
  deferredVideoPosts: { skoolPostId: string; title: string; videoCount: number }[];
  /** Safety net for a video attachment found somewhere other than a post
   *  (e.g. a comment) — expected empty; every real video attachment this
   *  run was post-level. */
  deferredVideoOther: { context: string; count: number }[];
  /** Attachments genuinely skipped (not silently dropped) because Magnetix
   *  has no safe representation for them — expected empty in practice this
   *  run (see mapSkoolAttachments' module comment). */
  skippedAttachments: { url: string; contentType?: string; reason: string; context: string }[];
  /** Gap 1 — exact per-kind attachment tallies across the whole run (posts +
   *  comments combined), for a precise before/Phase-3 fidelity report. */
  attachmentSummary: {
    postImages: number;
    commentImages: number;
    commentVoice: number;
    commentFiles: number;
    deferredVideos: number;
    skippedOther: number;
  };
  /** Per-category totals, useful for a human sanity-check before commit. */
  categoryCounts: Record<string, number>;
}

export interface RunImportOptions {
  subAccountId: string;
  agencyId: string;
  targetGroupSlug: string;
  targetGroupName: string;
  commit: boolean;
  /** Restrict the whole run to exactly one member's email — the Phase 2
   *  controlled single-member test. Posts/comments authored by anyone else
   *  are skipped, not failed. */
  onlyMemberEmail?: string;
  members: EnrichedSkoolMember[];
  categories: Map<string, string>; // skoolCategoryId -> label
  allPosts: SkoolPost[];
  commentsByPost: Map<string, SkoolComment[]>; // skoolPostId -> comments
}

export async function runSkoolImport(opts: RunImportOptions): Promise<ImportReport> {
  const db = getAdminDb();
  const report: ImportReport = {
    commit: opts.commit,
    targetGroupExisted: false,
    targetGroupId: null,
    channels: emptyCounts(),
    members: emptyCounts(),
    memberships: emptyCounts(),
    posts: emptyCounts(),
    comments: emptyCounts(),
    errors: [],
    unresolvedMembers: [],
    historicalAuthors: [],
    deferredVideoPosts: [],
    deferredVideoOther: [],
    skippedAttachments: [],
    attachmentSummary: {
      postImages: 0,
      commentImages: 0,
      commentVoice: 0,
      commentFiles: 0,
      deferredVideos: 0,
      skippedOther: 0,
    },
    categoryCounts: {},
  };

  const restrictToEmail = opts.onlyMemberEmail?.trim().toLowerCase() || null;

  // ── 1. Target group ────────────────────────────────────────────────────
  let group = await getGroupBySlug(opts.subAccountId, opts.targetGroupSlug);
  report.targetGroupExisted = !!group;
  if (!group) {
    if (opts.commit) {
      group = await createGroupServerSide({
        subAccountId: opts.subAccountId,
        agencyId: opts.agencyId,
        createdByUid: `import:skool`,
        name: opts.targetGroupName,
        status: "published",
      });
    } else {
      report.targetGroupId = null; // plan-only: no group exists to attach counts to yet
    }
  }
  if (group) report.targetGroupId = group.id;
  const groupId = group?.id ?? null;

  // ── 2. Channels (one per Skool category actually used) ─────────────────
  // Deliberately NOT gated on `if (groupId)` — a dry run against a
  // not-yet-created target group must still project "these N channels
  // would be created," not silently report zero for everything downstream
  // of the group (a real gap found and fixed live during this build).
  const channelIdByCategoryLabel = new Map<string, string>();
  {
    const existingChannels = groupId
      ? opts.commit
        ? await ensureChannelsForGroup(opts.subAccountId, groupId)
        : ((await db.collection(`subAccounts/${opts.subAccountId}/communityGroups/${groupId}/channels`).get()).docs.map(
            (d) => ({ id: d.id, ...(d.data() as Omit<CommunityChannel, "id">) }),
          ) as CommunityChannel[])
      : [];
    const existingByName = new Map(existingChannels.map((c) => [c.name, c.id]));

    // Iterate the id->label map's ENTRIES, not a Set of deduped label
    // values — a real category id is needed as the mapping ledger's
    // externalId (see the writeMapping call below), which a plain
    // Set<string> of labels can't provide. If two distinct Skool category
    // ids ever produced the same label (not the case for this Community —
    // 5 ids, 5 distinct labels), the second would just match the
    // already-created channel by name below and record as matchedExisting,
    // same as today — never a duplicate channel.
    for (const [categoryId, label] of opts.categories.entries()) {
      const { icon, name } = splitCategoryLabel(label);
      report.channels.received += 1;
      const existingId = existingByName.get(name);
      if (existingId) {
        channelIdByCategoryLabel.set(label, existingId);
        report.channels.matchedExisting += 1;
        continue;
      }
      if (!opts.commit || !groupId) {
        report.channels.wouldCreate += 1;
        continue;
      }
      try {
        const created = await createChannelServerSide({
          subAccountId: opts.subAccountId,
          groupId,
          name,
          icon,
        });
        channelIdByCategoryLabel.set(label, created.id);
        existingByName.set(name, created.id);
        // Channels never wrote to the importMappings ledger before this —
        // added so the Phase 3 checkpoint/rollback manifest has complete,
        // consistent provenance across every entity type this importer
        // touches, not just members/posts/comments.
        await writeMapping({
          subAccountId: opts.subAccountId,
          entity: "community_channels",
          externalId: categoryId,
          leadstackId: created.id,
          parentId: groupId,
        });
        report.channels.created += 1;
      } catch (err) {
        report.channels.failed += 1;
        report.errors.push({ entity: "community_channels", externalId: name, message: String(err) });
      }
    }
  }

  // ── 3. Members (reuses real ensureMember on commit; read-only mirror on
  //      dry-run — see module comment for why these can't share one path) ─
  const memberLeadstackIdBySkoolUserId = new Map<string, string>();
  const membersToProcess = restrictToEmail
    ? opts.members.filter((m) => m.resolvedEmail === restrictToEmail)
    : opts.members;

  const skoolUserIds = membersToProcess.map((m) => m.skoolUserId);
  const existingMemberMappings = groupId
    ? await getExistingMappingsBulk(opts.subAccountId, "community_members", skoolUserIds)
    : new Map();

  for (const m of membersToProcess) {
    report.members.received += 1;
    const existingMapping = existingMemberMappings.get(m.skoolUserId);
    if (existingMapping) {
      memberLeadstackIdBySkoolUserId.set(m.skoolUserId, existingMapping.leadstackId);
      report.members.matchedExisting += 1;
      continue;
    }

    if (!m.resolvedEmail) {
      // Gap 2 — no resolvable email (former/churned member with no CSV row
      // and no Skool-payload email). Instead of discarding their authored
      // content, give them a minimal, non-login "historical author"
      // identity — see historical-author.ts for the full rationale. This
      // reuses the SAME dry-run-safe read-only-lookup-then-placeholder
      // pattern as ordinary members just below, so a plan pass still
      // performs zero writes.
      report.historicalAuthors.push({ skoolUserId: m.skoolUserId, name: m.name });
      if (!opts.commit) {
        const already = await findHistoricalAuthorMember(opts.subAccountId, m.skoolUserId);
        if (already) {
          memberLeadstackIdBySkoolUserId.set(m.skoolUserId, already.id);
          report.members.matchedExisting += 1;
        } else {
          memberLeadstackIdBySkoolUserId.set(m.skoolUserId, "__would_create__");
          report.members.wouldCreate += 1;
        }
        continue;
      }
      try {
        const created = await ensureHistoricalAuthorMember({
          subAccountId: opts.subAccountId,
          agencyId: opts.agencyId,
          skoolUserId: m.skoolUserId,
          name: m.name,
          avatarUrl: m.avatarUrl,
        });
        memberLeadstackIdBySkoolUserId.set(m.skoolUserId, created.id);
        await writeMapping({
          subAccountId: opts.subAccountId,
          entity: "community_members",
          externalId: m.skoolUserId,
          leadstackId: created.id,
        });
        report.members.created += 1;
      } catch (err) {
        report.members.failed += 1;
        report.errors.push({ entity: "community_members", externalId: m.skoolUserId, message: String(err) });
      }
      continue;
    }

    if (!opts.commit) {
      const already = await findMemberByEmail(opts.subAccountId, m.resolvedEmail);
      if (already) {
        memberLeadstackIdBySkoolUserId.set(m.skoolUserId, already.id);
        report.members.matchedExisting += 1;
      } else {
        // Placeholder id so downstream counting (memberships/posts/
        // comments) can still project "this WOULD be created" without a
        // real Firestore write — never used as an actual document path
        // (only the commit branch above ever reads this map for real IDs).
        memberLeadstackIdBySkoolUserId.set(m.skoolUserId, "__would_create__");
        report.members.wouldCreate += 1;
      }
      continue;
    }

    try {
      const created = await ensureMember({
        subAccountId: opts.subAccountId,
        email: m.resolvedEmail,
        displayName: m.name || null,
        source: "community",
      });
      memberLeadstackIdBySkoolUserId.set(m.skoolUserId, created.id);
      await writeMapping({
        subAccountId: opts.subAccountId,
        entity: "community_members",
        externalId: m.skoolUserId,
        leadstackId: created.id,
      });
      report.members.created += 1;
    } catch (err) {
      report.members.failed += 1;
      report.errors.push({ entity: "community_members", externalId: m.skoolUserId, message: String(err) });
    }
  }

  // ── 4. GroupMemberships (direct write — joinGroupServerSide isn't bulk-
  //      safe: paid/approval gating + a webhook per call don't fit a
  //      historical import; mirrors its doc shape minus those two things) ─
  // Same "don't gate projection on the group already existing" fix as
  // channels above.
  {
    let membersAdded = 0;
    for (const m of membersToProcess) {
      // Churned/cancelled/banned Skool members get real Member+Contact+
      // Person identity (below) so their historical posts/comments keep
      // real authorship, but deliberately NOT an active GroupMembership —
      // they left; a live "active" Community membership for them would
      // misrepresent their real relationship to the Community. The
      // `!m.resolvedEmail` half is a Gap 2 defense-in-depth guard: a
      // historical-author Member (§3) must NEVER get a GroupMembership,
      // full stop — this doesn't rely solely on membershipTab happening to
      // agree with email-resolvability (true for every real member this
      // run, but not something the type system enforces).
      if (m.membershipTab !== "active" || !m.resolvedEmail) continue;
      const leadstackId = memberLeadstackIdBySkoolUserId.get(m.skoolUserId);
      if (!leadstackId) continue; // unresolved email
      report.memberships.received += 1;
      if (!groupId || leadstackId === "__would_create__") {
        report.memberships.wouldCreate += 1;
        continue;
      }
      const membershipRef = db.doc(
        `subAccounts/${opts.subAccountId}/communityGroups/${groupId}/memberships/${leadstackId}`,
      );
      if (!opts.commit) {
        const existing = await membershipRef.get();
        if (existing.exists) report.memberships.matchedExisting += 1;
        else report.memberships.wouldCreate += 1;
        continue;
      }
      const existing = await membershipRef.get();
      if (existing.exists) {
        report.memberships.matchedExisting += 1;
        continue;
      }
      try {
        await membershipRef.set({
          subAccountId: opts.subAccountId,
          agencyId: opts.agencyId,
          groupId,
          memberId: leadstackId,
          role: "member",
          status: "active",
          points: m.points ?? 0,
          level: m.level ?? 1,
          tierId: null,
          joinedAt: m.joinedAtIso ? Timestamp.fromDate(new Date(m.joinedAtIso)) : FieldValue.serverTimestamp(),
        });
        // Memberships never wrote to the importMappings ledger before this
        // (idempotency was already covered by the deterministic doc-id-by-
        // memberId path above) — added purely for Phase 3 checkpoint/
        // rollback provenance completeness, same reasoning as channels above.
        await writeMapping({
          subAccountId: opts.subAccountId,
          entity: "community_memberships",
          externalId: m.skoolUserId,
          leadstackId,
          parentId: groupId,
        });
        membersAdded += 1;
        report.memberships.created += 1;
      } catch (err) {
        report.memberships.failed += 1;
        report.errors.push({ entity: "community_memberships", externalId: m.skoolUserId, message: String(err) });
      }
    }
    if (opts.commit && membersAdded > 0) {
      await db
        .doc(`subAccounts/${opts.subAccountId}/communityGroups/${groupId}`)
        .update({ memberCount: FieldValue.increment(membersAdded) });
    }
  }

  // ── 5. Posts (direct write — createPostServerSide has no historical-
  //      timestamp override, and always attributes to the live session's
  //      own member id, neither of which fits an import) ───────────────────
  const postLeadstackIdBySkoolId = new Map<string, string>();
  const postsToImport = restrictToEmail
    ? opts.allPosts.filter((p) => {
        const author = opts.members.find((m) => m.skoolUserId === p.authorSkoolUserId);
        return author?.resolvedEmail === restrictToEmail;
      })
    : opts.allPosts;

  {
    const existingPostMappings = groupId
      ? await getExistingMappingsBulk(opts.subAccountId, "community_posts", postsToImport.map((p) => p.skoolPostId))
      : new Map();
    const postsCol = groupId
      ? db.collection(`subAccounts/${opts.subAccountId}/communityGroups/${groupId}/posts`)
      : null;

    for (const p of postsToImport) {
      report.posts.received += 1;
      const existingMapping = existingPostMappings.get(p.skoolPostId);
      if (existingMapping) {
        postLeadstackIdBySkoolId.set(p.skoolPostId, existingMapping.leadstackId);
        report.posts.matchedExisting += 1;
        continue;
      }
      const authorLeadstackId = memberLeadstackIdBySkoolUserId.get(p.authorSkoolUserId);
      // `p.category` is ALREADY the resolved label string (skool-extract.ts's
      // toSkoolPost resolves `raw.labelId` -> label at extraction time) — NOT
      // a category id. A real bug, found live during this final dry run
      // (categoryCounts came back entirely empty): this line previously
      // re-looked-up `p.category` inside `opts.categories`, a map keyed by
      // category ID -> label, so it always missed and silently resolved
      // every post's channel/category to null. Never reached a real write —
      // Phase 2 only ever wrote a Member+Membership, no posts — so no
      // production data was ever affected, but this would have silently
      // dropped every post's channel assignment had Phase 3 run as-is.
      const label = p.category;
      const channelName = label ? splitCategoryLabel(label).name : null;
      if (label) report.categoryCounts[label] = (report.categoryCounts[label] ?? 0) + 1;

      if (!authorLeadstackId) {
        report.posts.skipped += 1;
        report.errors.push({
          entity: "community_posts",
          externalId: p.skoolPostId,
          message: `Author (Skool user ${p.authorSkoolUserId}) has no resolved Magnetix member — post skipped, not guessed`,
        });
        continue;
      }

      const mapped = mapSkoolPost(p);
      // Computed regardless of commit/dry-run so a zero-write dry run still
      // reports exactly which posts carry deferred video / skipped
      // attachments — Gap 1 must be visible in the report BEFORE any real
      // writes happen, not only discovered once Phase 3 actually runs.
      const {
        attachments,
        deferredVideoUrls,
        skipped: skippedAttachments,
      } = mapSkoolAttachments(p.attachments, authorLeadstackId, mapped.createdAtDate.getTime());
      report.attachmentSummary.postImages += attachments.filter((a) => a.kind === "image").length;
      report.attachmentSummary.deferredVideos += deferredVideoUrls.length;
      report.attachmentSummary.skippedOther += skippedAttachments.length;
      if (deferredVideoUrls.length > 0) {
        report.deferredVideoPosts.push({
          skoolPostId: p.skoolPostId,
          title: mapped.title,
          videoCount: deferredVideoUrls.length,
        });
      }
      if (skippedAttachments.length > 0) {
        report.skippedAttachments.push(
          ...skippedAttachments.map((s) => ({ ...s, context: `post ${p.skoolPostId}` })),
        );
      }

      if (!opts.commit || !postsCol || authorLeadstackId === "__would_create__") {
        // Same placeholder-id pattern as members (§3) — lets the comments
        // pass below still project "N comments would be created" for a
        // post that itself doesn't exist yet, instead of silently
        // reporting zero for everything downstream of a not-yet-created
        // post (a real gap found and fixed live during this build).
        postLeadstackIdBySkoolId.set(p.skoolPostId, "__would_create__");
        report.posts.wouldCreate += 1;
        continue;
      }
      try {
        const ref = postsCol.doc();
        await ref.set({
          subAccountId: opts.subAccountId,
          agencyId: opts.agencyId,
          groupId,
          authorMemberId: authorLeadstackId,
          title: mapped.title,
          body: mapped.bodyHtml,
          attachments,
          category: channelName,
          pinned: mapped.pinned,
          likeCount: p.upvotes,
          commentCount: 0, // corrected below as comments are actually written
          createdAt: Timestamp.fromDate(mapped.createdAtDate),
          updatedAt: mapped.updatedAtDate ? Timestamp.fromDate(mapped.updatedAtDate) : Timestamp.fromDate(mapped.createdAtDate),
        });
        postLeadstackIdBySkoolId.set(p.skoolPostId, ref.id);
        await writeMapping({
          subAccountId: opts.subAccountId,
          entity: "community_posts",
          externalId: p.skoolPostId,
          leadstackId: ref.id,
        });
        report.posts.created += 1;
      } catch (err) {
        report.posts.failed += 1;
        report.errors.push({ entity: "community_posts", externalId: p.skoolPostId, message: String(err) });
      }
    }
  }

  // ── 6. Comments (flattened to 2 levels per post, direct write) ─────────
  {
    const postsCol = groupId
      ? db.collection(`subAccounts/${opts.subAccountId}/communityGroups/${groupId}/posts`)
      : null;
    for (const p of postsToImport) {
      const postLeadstackId = postLeadstackIdBySkoolId.get(p.skoolPostId);
      const rawComments = opts.commentsByPost.get(p.skoolPostId) ?? [];
      if (rawComments.length === 0) continue;
      const mapped = flattenSkoolCommentsToTwoLevels(p.skoolPostId, rawComments);

      const existingCommentMappings = groupId
        ? await getExistingMappingsBulk(opts.subAccountId, "community_comments", mapped.map((c) => c.skoolCommentId))
        : new Map();

      // Top-level first, so replies can resolve their parent's REAL leadstack id.
      const ordered = [...mapped].sort((a, b) =>
        a.effectiveParentSkoolId === null ? -1 : b.effectiveParentSkoolId === null ? 1 : 0,
      );
      const commentLeadstackIdBySkoolId = new Map<string, string>();
      let createdForThisPost = 0;

      for (const c of ordered) {
        report.comments.received += 1;
        const existingMapping = existingCommentMappings.get(c.skoolCommentId);
        if (existingMapping) {
          commentLeadstackIdBySkoolId.set(c.skoolCommentId, existingMapping.leadstackId);
          report.comments.matchedExisting += 1;
          continue;
        }
        const original = rawComments.find((r) => r.skoolCommentId === c.skoolCommentId)!;
        const authorLeadstackId = memberLeadstackIdBySkoolUserId.get(original.authorSkoolUserId);
        if (!authorLeadstackId) {
          report.comments.skipped += 1;
          continue;
        }
        if (!postLeadstackId) {
          report.comments.skipped += 1; // parent post's author was unresolved — no post to attach to
          continue;
        }

        // Same "compute regardless of commit" rule as posts (§5) above.
        const {
          attachments,
          deferredVideoUrls,
          skipped: skippedAttachments,
        } = mapSkoolAttachments(original.attachments, authorLeadstackId, c.createdAtDate.getTime());
        report.attachmentSummary.commentImages += attachments.filter((a) => a.kind === "image").length;
        report.attachmentSummary.commentVoice += attachments.filter((a) => a.kind === "voice").length;
        report.attachmentSummary.commentFiles += attachments.filter((a) => a.kind === "file").length;
        report.attachmentSummary.deferredVideos += deferredVideoUrls.length;
        report.attachmentSummary.skippedOther += skippedAttachments.length;
        if (deferredVideoUrls.length > 0) {
          report.deferredVideoOther.push({
            context: `comment ${c.skoolCommentId} (post ${p.skoolPostId})`,
            count: deferredVideoUrls.length,
          });
        }
        if (skippedAttachments.length > 0) {
          report.skippedAttachments.push(
            ...skippedAttachments.map((s) => ({ ...s, context: `comment ${c.skoolCommentId} (post ${p.skoolPostId})` })),
          );
        }

        if (!opts.commit || !postsCol || postLeadstackId === "__would_create__") {
          report.comments.wouldCreate += 1;
          continue;
        }
        try {
          const parentLeadstackId = c.effectiveParentSkoolId
            ? (commentLeadstackIdBySkoolId.get(c.effectiveParentSkoolId) ?? null)
            : null;
          const ref = postsCol.doc(postLeadstackId).collection("comments").doc();
          await ref.set({
            groupId,
            postId: postLeadstackId,
            authorMemberId: authorLeadstackId,
            body: c.bodyHtml,
            attachments,
            likeCount: 0,
            parentId: parentLeadstackId,
            createdAt: Timestamp.fromDate(c.createdAtDate),
          });
          commentLeadstackIdBySkoolId.set(c.skoolCommentId, ref.id);
          await writeMapping({
            subAccountId: opts.subAccountId,
            entity: "community_comments",
            externalId: c.skoolCommentId,
            leadstackId: ref.id,
            parentId: postLeadstackId,
          });
          report.comments.created += 1;
          createdForThisPost += 1;
        } catch (err) {
          report.comments.failed += 1;
          report.errors.push({ entity: "community_comments", externalId: c.skoolCommentId, message: String(err) });
        }
      }
      if (opts.commit && postsCol && createdForThisPost > 0 && postLeadstackId) {
        await postsCol.doc(postLeadstackId).update({ commentCount: FieldValue.increment(createdForThisPost) });
      }
    }
  }

  return report;
}
