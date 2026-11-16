import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { pageSubAccountId } from "@/lib/server/page-form-resolver";
import {
  PageTemplateError,
  createPageFromTemplate,
  deletePageTemplate,
  listPageTemplates,
  requeueStaleTemplatePreviews,
  savePageAsTemplate,
  updatePageTemplate,
} from "@/lib/server/pages-funnels/page-template-service";

export const dynamic = "force-dynamic";

/**
 * Saved Page Templates (2026-11-16). A static route (no dynamic segment — see
 * CLAUDE.md "Consolidated API routes"); the workspace is a parameter and every
 * call is tenancy-checked. Templates are shared by the workspace: any member
 * can list them (and preview them at /page-template-preview); creating,
 * renaming, deleting and making pages from them follow the same rule as
 * creating and editing pages — the workspace's admins.
 *
 *   GET  ?sa=<subAccountId>                              list
 *   POST {action: "save", pageId, name, description?, requestId, current?}
 *   POST {action: "rename", subAccountId, templateId, name, description?}
 *   POST {action: "delete", subAccountId, templateId}
 *   POST {action: "create", subAccountId, templateId, name, goal}
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function errorResponse(err: unknown, fallback: string) {
  if (err instanceof PageTemplateError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(`[page-templates] ${fallback}`, err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(req: Request) {
  const sa = new URL(req.url).searchParams.get("sa") ?? "";
  if (!ID.test(sa)) return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
  const access = await requireSubAccountMember(req, sa);
  if (access instanceof NextResponse) return access;
  try {
    const templates = await listPageTemplates(sa);
    // Previews that never arrived are retried (throttled) — admins' visits only.
    if (access.subAccountRole === "agencyOwner" || access.subAccountRole === "admin") await requeueStaleTemplatePreviews(sa);
    return NextResponse.json({ templates });
  } catch (err) {
    return errorResponse(err, "Couldn't load templates. Try again.");
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "save") {
    // The workspace is the PAGE's own, read server-side.
    const pageId = typeof body.pageId === "string" && ID.test(body.pageId) ? body.pageId : "";
    const sa = pageId ? await pageSubAccountId(pageId) : null;
    if (!sa) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    const access = await requireSubAccountAdmin(req, sa);
    if (access instanceof NextResponse) return access;
    const current = body.current && typeof body.current === "object" ? (body.current as { data?: unknown; popups?: unknown }) : null;
    try {
      const template = await savePageAsTemplate({
        subAccountId: sa,
        uid: access.uid,
        email: (access as { email?: string }).email,
        pageId,
        name: body.name,
        description: body.description,
        requestId: body.requestId,
        current: current ? { data: current.data, popups: current.popups ?? {} } : null,
      });
      return NextResponse.json({ ok: true, template });
    } catch (err) {
      return errorResponse(err, "Couldn't save the template. Try again.");
    }
  }

  const sa = typeof body.subAccountId === "string" && ID.test(body.subAccountId) ? body.subAccountId : "";
  if (!sa) return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
  const access = await requireSubAccountAdmin(req, sa);
  if (access instanceof NextResponse) return access;
  const templateId = typeof body.templateId === "string" ? body.templateId : "";

  try {
    switch (body.action) {
      case "rename":
        return NextResponse.json({ ok: true, template: await updatePageTemplate(sa, templateId, { name: body.name, ...(body.description !== undefined ? { description: body.description } : {}) }) });
      case "delete":
        await deletePageTemplate(sa, templateId);
        return NextResponse.json({ ok: true });
      case "create":
        return NextResponse.json({ ok: true, ...(await createPageFromTemplate({ subAccountId: sa, uid: access.uid, templateId, name: body.name, goal: body.goal })) });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return errorResponse(err, "Something went wrong with that template. Try again.");
  }
}
