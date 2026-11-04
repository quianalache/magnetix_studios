import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { pageSubAccountId } from "@/lib/server/page-form-resolver";
import {
  renamePuckPage,
  revertPuckDraftToPublished,
  unpublishPuckPage,
} from "@/lib/server/pages-funnels-puck-service";
import { pageNameProblem } from "@/lib/pages-funnels/page-settings";

/**
 * Page Settings management actions (Wave 3): rename (immediate), unpublish,
 * and revert draft to published. A static route (no dynamic segment) so it
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
    case "unpublish":
      result = await unpublishPuckPage(subAccountId, pageId);
      break;
    case "revert":
      result = await revertPuckDraftToPublished(subAccountId, pageId);
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
