import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deletePageTemplate, renamePageTemplate } from "@/lib/server/report-page-template-service";
import { PageTemplateError } from "@/lib/energetics/report-page-templates";

type Ctx = { params: Promise<{ id: string; templateId: string }> };

/** Rename one of the caller's own saved templates: { name }. Inserted pages never change. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, templateId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const template = await renamePageTemplate(subAccountId, access.uid, templateId, body.name);
    return NextResponse.json({ ok: true, template });
  } catch (err) {
    if (err instanceof PageTemplateError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Delete one of the caller's own saved templates (library only — reports are untouched). */
export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, templateId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;
  try {
    await deletePageTemplate(subAccountId, access.uid, templateId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PageTemplateError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
