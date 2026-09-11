import { NextResponse } from "next/server";
import { requireMemberApi } from "@/lib/community/member-context";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";
import { getAdminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 4000;
const MAX_SHORT_FIELD_LENGTH = 200;
const MENU_ACTIONS = new Set(["avatar-click", "menu-open", "menu-item-click"]);

function text(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_FIELD_LENGTH
    ? value
    : null;
}
function shortText(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_SHORT_FIELD_LENGTH
    ? value
    : null;
}

/**
 * Temporary, authenticated-only browser exception intake — 2026-09-11
 * investigation (Community avatar-menu crash). Extended from the original
 * console-only version (2026-08-xx): a crash reported once and then gone
 * from Vercel's live-tail-only logs by the time anyone looks is useless for
 * a deterministic, every-click bug, so this now ALSO persists a bounded
 * copy to Firestore long enough to actually inspect it (query by saId,
 * newest first). Delete communityClientErrorLogs once this investigation
 * closes — it was never meant to be a permanent error-tracking store.
 *
 * Same trust boundary as before: authenticated member session required
 * (requireMemberApi), rate-limited per member, and the payload is bounded
 * client metadata only — no tokens/cookies/secrets, enforced by never
 * reading anything off the request beyond this fixed field list.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ saId: string }> }
) {
  const { saId } = await params;
  const access = await requireMemberApi(saId);
  if (access.kind !== "ok")
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  if (
    !checkMemberAuthRateLimit({
      key: `community-client-error:${saId}:${access.member.id}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
    })
  )
    return NextResponse.json({ ok: true });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 12288)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const name = text(body.name);
  const message = text(body.message);
  const pathname = text(body.pathname);
  const userAgent = text(body.userAgent);
  const timestamp = text(body.timestamp);
  const stack = body.stack === undefined ? null : text(body.stack);
  const groupId = body.groupId === undefined ? null : shortText(body.groupId);
  const href = body.href === undefined ? null : text(body.href);
  const action =
    typeof body.action === "string" && MENU_ACTIONS.has(body.action)
      ? body.action
      : null;
  if (
    !name ||
    !message ||
    !pathname ||
    !userAgent ||
    !timestamp ||
    (body.stack !== undefined && !stack) ||
    (body.groupId !== undefined && !groupId) ||
    (body.href !== undefined && !href)
  )
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const record = {
    saId,
    groupId,
    memberId: access.member.id,
    action,
    href,
    name,
    message,
    stack,
    pathname,
    userAgent,
    clientTimestamp: timestamp,
    createdAt: FieldValue.serverTimestamp(),
  };
  console.error("[community-client-error]", JSON.stringify(record));
  try {
    await getAdminDb().collection("communityClientErrorLogs").add(record);
  } catch (err) {
    // Persistence is a best-effort diagnostic, not the point of this
    // route — never fail the client's report over it (console.error above
    // already ran either way).
    console.error("[community-client-error] Firestore write failed", err);
  }
  return NextResponse.json({ ok: true });
}
