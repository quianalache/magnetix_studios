import { NextResponse } from "next/server";
import { requireGroupApiAccess } from "@/lib/community/member-context";
import { createPostServerSide } from "@/lib/server/community-feed-service";
import { aboutPlainTextLength } from "@/lib/community/about-html";

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

  let body: { title?: string; body?: string; category?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // `body.body` is now real HTML from the Community rich-text composer
  // (Phase B), not plain text — the 10,000-char cap must be measured
  // against the VISIBLE text a member actually typed, not the raw HTML
  // string (which would otherwise silently shrink/inflate the real limit
  // depending on how much formatting markup happens to be in the post).
  // `aboutPlainTextLength` is a plain regex tag-stripper (no HTML
  // parsing/rendering assumptions), already proven for exactly this job
  // by the About/Guidelines character counters — reused as-is here, not
  // duplicated.
  const html = body.body?.trim() ?? "";
  const visibleLength = aboutPlainTextLength(html);
  if (visibleLength === 0) {
    return NextResponse.json({ error: "Write something first" }, { status: 400 });
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
    category,
  });

  return NextResponse.json({ ok: true, post });
}
