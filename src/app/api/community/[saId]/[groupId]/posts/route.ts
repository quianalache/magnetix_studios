import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import {
  createPostServerSide,
  buildFeedPoll,
} from "@/lib/server/community-feed-service";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { normalizePostAttachments } from "@/lib/community/normalize-post-attachments";
import { normalizePollDraft } from "@/lib/community/normalize-poll";
import {
  getChannelByName,
  getInaccessibleChannelNames,
} from "@/lib/server/community-channels-service";

export const dynamic = "force-dynamic";

/** Member: create a feed post. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> }
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }

  let body: {
    title?: string;
    body?: string;
    category?: string | null;
    attachments?: unknown;
    commentsDisabled?: boolean;
    poll?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Polls (2026-08-20) — moderator/admin-only, enforced HERE (server-side)
  // regardless of whether the composer's Poll icon was correctly hidden
  // for this member; hiding the icon is UX, not the security boundary.
  if (body.poll != null && access.membership.role !== "moderator") {
    return NextResponse.json(
      { error: "Only moderators can create a poll" },
      { status: 403 }
    );
  }
  let poll;
  try {
    poll = normalizePollDraft(body.poll);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid poll" },
      { status: 400 }
    );
  }

  // Title is REQUIRED (composer correction pass) — checked here
  // independently of the composer's own client-side check, which is UX
  // only. A post has never been valid without SOME title in the product's
  // intent; the composer previously labeling it "(optional)" was a client
  // bug, not a deliberate relaxation of this rule, and this route never
  // actually enforced it either — both are fixed together here.
  const title = body.title?.trim() ?? "";
  if (!title) {
    return NextResponse.json(
      { error: "A post needs a title" },
      { status: 400 }
    );
  }

  // `body.body` is real HTML from the Community rich-text composer
  // (Phase B), not plain text — the 10,000-char cap must be measured
  // against the VISIBLE text a member actually typed, not the raw HTML
  // string. `aboutPlainTextLength` is a plain regex tag-stripper (no HTML
  // parsing/rendering assumptions), already proven for exactly this job
  // by the About/Guidelines character counters — reused as-is, not
  // duplicated.
  const html = body.body?.trim() ?? "";
  const visibleLength = aboutPlainTextLength(html);
  const attachments = normalizePostAttachments(
    body.attachments,
    access.member.id,
    saId
  );

  // Phase C: a post is valid with visible text OR at least one real
  // attachment — image/voice-only posts are real content, not empty
  // posts. Attachments never count toward (or bypass) the text-length
  // cap; the two are validated independently. Polls (2026-08-20): a poll
  // IS the content — the reference Create Poll sheet never asks for a
  // separate question, so a poll-only post (no body typed) is valid too,
  // same reasoning as an image/voice-only post. Title is required
  // regardless (checked above) — this check is about BODY/attachments/
  // poll, on top of that.
  if (visibleLength === 0 && attachments.length === 0 && !poll) {
    return NextResponse.json(
      { error: "Write something, attach a photo or voice note, or add a poll" },
      { status: 400 }
    );
  }
  if (visibleLength > 10000) {
    return NextResponse.json({ error: "Post is too long" }, { status: 400 });
  }

  // Category must be one the group defines (or none).
  const category =
    body.category && access.group.categories.includes(body.category)
      ? body.category
      : null;

  // Channel enforcement (Read Only / Private) — server-side regardless of
  // whether the composer's own channel selector correctly hid/disabled
  // this option; UI gating is never the actual security boundary. A
  // category with no matching Channel doc (shouldn't normally happen once
  // ensureChannelsForGroup has run, but defensively) is treated as
  // ordinary/unrestricted, same as before this feature existed.
  const isModerator = access.membership.role === "moderator";
  if (category && !isModerator) {
    const inaccessible = await getInaccessibleChannelNames({
      subAccountId: saId,
      groupId,
      isModerator,
    });
    if (inaccessible.has(category)) {
      return NextResponse.json(
        { error: "You don't have access to this channel" },
        { status: 403 }
      );
    }
    const channel = await getChannelByName(saId, groupId, category);
    if (channel?.readOnly) {
      return NextResponse.json(
        { error: "Only moderators can post in this channel" },
        { status: 403 }
      );
    }
  }

  const post = await createPostServerSide({
    subAccountId: saId,
    agencyId: access.gate.agencyId,
    groupId,
    authorMemberId: access.member.id,
    title,
    body: html,
    attachments,
    category,
    // Found during the composer correction pass' own required regression
    // check (item 52: "comments-disabled behavior remains enforced") —
    // this route accepted `CreatePostInput.commentsDisabled` but never
    // actually read it off the request body, so the composer's "Allow
    // comments/replies" checkbox has never had any effect on a NEWLY
    // created post (only on an edit — the PATCH route already did this
    // correctly). Pre-existing gap, unrelated to anything else in this
    // pass; fixed here since leaving a checkbox that silently does
    // nothing in production is worse than the small, isolated fix.
    commentsDisabled: body.commentsDisabled === true,
    poll,
  });

  // The stored `post.poll` is the raw server shape — `createPostServerSide`
  // never computes a viewer-safe view. The moderator who just created this
  // poll can't have a vote on it yet (it didn't exist a moment ago), so
  // `viewerSelection` is always `[]` here, no lookup needed; they're a
  // moderator by construction (checked above), so `resultsVisible`/
  // `canManage` are always true for their own optimistic render.
  return NextResponse.json({
    ok: true,
    post: {
      ...post,
      poll: post.poll ? buildFeedPoll(post.poll, [], true) : undefined,
    },
  });
}
