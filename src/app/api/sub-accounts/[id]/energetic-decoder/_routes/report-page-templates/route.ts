import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listPageTemplates, savePageTemplate } from "@/lib/server/report-page-template-service";
import { PageTemplateError } from "@/lib/energetics/report-page-templates";

/** Saved page templates — the caller's own, in this workspace (report-page-template-service.ts). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  const templates = await listPageTemplates(subAccountId, access.uid);
  return NextResponse.json({ ok: true, templates });
}

/** Save one page as a template: { name, system, pageType, page }. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const result = await savePageTemplate({ subAccountId, agencyId: access.agencyId ?? "", uid: access.uid, name: body.name, system: body.system, pageType: body.pageType, page: body.page });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof PageTemplateError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
