import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadPagesLibrary } from "@/lib/server/pages-funnels/library-service";
import { queueStaleThumbnails } from "@/lib/server/pages-funnels/page-thumbnail-service";

export const dynamic = "force-dynamic";

/**
 * Pages & Funnels home (2026-11). Static path (no new dynamic route entries —
 * see CLAUDE.md "Consolidated API routes"); the workspace is a parameter and
 * every call is tenancy-checked.
 *
 *   GET  ?sa=<subAccountId>    any member — funnels + which steps use each page
 *   POST {subAccountId}        admins — queue missing / out-of-date page
 *                              thumbnails (throttled per page, ≤6 per call)
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(req: Request) {
  const sa = new URL(req.url).searchParams.get("sa") ?? "";
  if (!ID.test(sa)) return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
  const access = await requireSubAccountMember(req, sa);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json(await loadPagesLibrary(sa));
  } catch (err) {
    console.error("[pages-library] load failed", err);
    return NextResponse.json({ error: "Couldn't load funnels. Try again." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { subAccountId?: unknown } | null;
  const sa = typeof body?.subAccountId === "string" ? body.subAccountId : "";
  if (!ID.test(sa)) return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
  const access = await requireSubAccountAdmin(req, sa);
  if (access instanceof NextResponse) return access;
  try {
    return NextResponse.json({ queued: await queueStaleThumbnails(sa) });
  } catch (err) {
    console.error("[pages-library] thumbnail queue failed", err);
    return NextResponse.json({ queued: 0 });
  }
}
