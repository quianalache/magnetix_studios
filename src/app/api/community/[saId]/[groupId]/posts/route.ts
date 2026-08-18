import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createPostServerSide } from "@/lib/server/community-feed-service";
import { aboutPlainTextLength } from "@/lib/community/about-html";
import { normalizePostAttachments } from "@/lib/community/normalize-post-attachments";

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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
  // cap; the two are validated independently.
  if (visibleLength === 0 && attachments.length === 0) {
    return NextResponse.json(
      { error: "Write something, or attach a photo or voice note" },
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
  });

  return NextResponse.json({ ok: true, post });
}
