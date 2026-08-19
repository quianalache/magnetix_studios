import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createPostServerSide, buildFeedPoll } from "@/lib/server/community-feed-service";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { normalizePostAttachments } from "@/lib/community/normalize-post-attachments";
import { normalizePollDraft } from "@/lib/community/normalize-poll";

export const dynamic = "force-dynamic";

/** Member: create a feed post. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string; groupId: string }> },
) {
  const { saId, groupId } = await params;
  const access = await requireGroupApiAccess(saId, groupId);
  if (access.kind === "error") {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  let body: {
    title?: string;
    body?: string;
    category?: string | null;
    attachments?: unknown;
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
    return NextResponse.json({ error: "Only moderators can create a poll" }, { status: 403 });
  }
  let poll;
  try {
    poll = normalizePollDraft(body.poll);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid poll" },
      { status: 400 },
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
  const attachments = normalizePostAttachments(body.attachments, access.member.id);

  // Phase C: a post is valid with visible text OR at least one real
  // attachment — image/voice-only posts are real content, not empty
  // posts. Attachments never count toward (or bypass) the text-length
  // cap; the two are validated independently. Polls (2026-08-20): a poll
  // IS the content — the reference Create Poll sheet never asks for a
  // separate question, so a poll-only post (no title/body typed) is valid
  // too, same reasoning as an image/voice-only post.
  if (visibleLength === 0 && attachments.length === 0 && !poll) {
    return NextResponse.json(
      { error: "Write something, attach a photo or voice note, or add a poll" },
      { status: 400 },
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

  const post = await createPostServerSide({
    subAccountId: saId,
    agencyId: access.gate.agencyId,
    groupId,
    authorMemberId: access.member.id,
    title: body.title?.trim() ?? "",
    body: html,
    attachments,
    category,
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
    post: { ...post, poll: post.poll ? buildFeedPoll(post.poll, [], true) : undefined },
  });
}
