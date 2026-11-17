import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { pageSubAccountId } from "@/lib/server/page-form-resolver";
import {
  createPuckPage,
  deletePuckPage,
  duplicatePuckPage,
  updateReadingResultPageSettings,
  renamePuckPage,
  revertPuckDraftToPublished,
  unpublishPuckPage,
} from "@/lib/server/pages-funnels-puck-service";
import { pageNameProblem } from "@/lib/pages-funnels/page-settings";
import { versionActor } from "@/lib/server/pages-funnels/page-version-core";
import { getPageVersion, listPageVersions, restorePageVersion } from "@/lib/server/pages-funnels/page-version-service";

/**
 * Page management actions: rename (immediate), unpublish, revert draft to
 * published (Wave 3), duplicate (pre-Funnel safety), Version History (list /
 * read one / restore) and delete (2026-11-17), and — since the
 * 2026-11-16 security hardening, when the browser lost direct write access to
 * `pages` — create (Start Blank / page type) and Reading Result settings. A static route (no dynamic segment) so it
 * costs nothing against Vercel's route limit; the page's own workspace is
 * looked up from the page id and the caller must be that workspace's admin —
 * the same requirement as Save Draft / Publish. Publishable settings (SEO,
 * social image, noindex, tracking) are NOT saved here: they live in the
 * page's draft content and are saved by Save Draft / autosave and made live
 * by Publish.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Create Page (2026-11-16 security hardening — was a direct browser write):
  // the workspace is named in the request and the caller must be its admin.
  if (body.action === "create") {
    const sa = typeof body.subAccountId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.subAccountId) ? body.subAccountId : "";
    if (!sa) return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
    const access = await requireSubAccountAdmin(request, sa);
    if (access instanceof NextResponse) return access;
    const created = await createPuckPage({ subAccountId: sa, uid: access.uid, name: body.name, pageType: body.pageType, goal: body.goal });
    if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });
    return NextResponse.json({ ok: true, pageId: created.pageId });
  }
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  const subAccountId = pageId ? await pageSubAccountId(pageId) : null;
  if (!subAccountId) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let result;
  switch (body.action) {
    case "rename": {
      const problem = pageNameProblem(body.name);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      result = await renamePuckPage(subAccountId, pageId, (body.name as string).trim());
      break;
    }
    case "readingResult":
      // Reading Result Page settings (was a direct browser write).
      result = await updateReadingResultPageSettings(subAccountId, pageId, body.settings);
      break;
    case "unpublish":
      result = await unpublishPuckPage(subAccountId, pageId);
      break;
    case "revert":
      result = await revertPuckDraftToPublished(subAccountId, pageId, { actor: await versionActor(access.uid) });
      break;
    // Page Version History (2026-11-17) — workspace admins and the agency
    // owner only (the check above); the version must belong to this page.
    case "versions": {
      const list = await listPageVersions(subAccountId, pageId);
      if (!list.ok) return NextResponse.json({ error: list.error }, { status: list.status });
      return NextResponse.json(list);
    }
    case "version": {
      const v = await getPageVersion(subAccountId, pageId, body.versionId);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
      return NextResponse.json(v);
    }
    case "restore": {
      const rev = body.baseRevision;
      const baseRevision = typeof rev === "number" && Number.isInteger(rev) && rev >= 0 ? rev : null;
      result = await restorePageVersion(subAccountId, pageId, body.versionId, { baseRevision, actor: await versionActor(access.uid) });
      if (!result.ok) return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status });
      return NextResponse.json({ ok: true, revision: result.revision });
    }
    // Delete (2026-11-17 — was a direct browser delete): also removes the
    // page's own Version History and analytics rollups.
    case "delete":
      result = await deletePuckPage(subAccountId, pageId);
      break;
    case "duplicate": {
      // Pre-Funnel safety: duplication is server-side and same-workspace only.
      const dup = await duplicatePuckPage(subAccountId, pageId, access.uid);
      if (!dup.ok) return NextResponse.json({ error: dup.error }, { status: dup.status });
      return NextResponse.json({ ok: true, pageId: dup.pageId });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
