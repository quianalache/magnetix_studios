import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getReportDesign, updateReportDesign, deleteReportDesign } from "@/lib/server/report-design-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; designId: string }> },
) {
  const { id: subAccountId, designId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const design = await getReportDesign(subAccountId, designId);
  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, design });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; designId: string }> },
) {
  const { id: subAccountId, designId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fields: Record<string, unknown> = {};
  if (typeof body.title === "string") fields.title = body.title;
  if (Array.isArray(body.pages)) fields.pages = body.pages;
  if (typeof body.contentSetId === "string" || body.contentSetId === null) fields.contentSetId = body.contentSetId;
  if (body.status === "draft" || body.status === "active") fields.status = body.status;
  if (body.layoutVersion === 1 || body.layoutVersion === 2) fields.layoutVersion = body.layoutVersion;
  if (body.pageSize === "letter" || body.pageSize === "a4" || body.pageSize === "custom") fields.pageSize = body.pageSize;
  if (body.customPageSize && typeof body.customPageSize === "object") fields.customPageSize = body.customPageSize;
  if (body.brand && typeof body.brand === "object") fields.brand = body.brand;

  try {
    const design = await updateReportDesign(subAccountId, designId, fields);
    return NextResponse.json({ ok: true, design });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; designId: string }> },
) {
  const { id: subAccountId, designId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteReportDesign(subAccountId, designId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
