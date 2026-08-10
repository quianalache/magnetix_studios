import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  getChartDesign,
  updateChartDesign,
  setDefaultChartDesign,
  deleteChartDesign,
} from "@/lib/server/chart-design-service";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; designId: string }> },
) {
  const { id: subAccountId, designId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const design = await getChartDesign(subAccountId, designId);
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

  try {
    // Setting default is its own operation (unsets siblings + write-through
    // syncs the legacy theme field) — kept as a dedicated code path rather
    // than a plain field update.
    if (body.isDefault === true) {
      const design = await setDefaultChartDesign(subAccountId, designId);
      return NextResponse.json({ ok: true, design });
    }

    const fields: Record<string, unknown> = {};
    if (typeof body.name === "string") fields.name = body.name;
    if (typeof body.chartDefinedColor === "string") fields.chartDefinedColor = body.chartDefinedColor;
    if (typeof body.channelsColor === "string") fields.channelsColor = body.channelsColor;
    if (typeof body.gatesColor === "string") fields.gatesColor = body.gatesColor;
    if (typeof body.personalityActivationColor === "string") fields.personalityActivationColor = body.personalityActivationColor;
    if (typeof body.designActivationColor === "string") fields.designActivationColor = body.designActivationColor;
    if (typeof body.arrowColor === "string") fields.arrowColor = body.arrowColor;
    if (body.arrowStyle === "solid" || body.arrowStyle === "outline") fields.arrowStyle = body.arrowStyle;
    if (typeof body.planetBoxColor === "string") fields.planetBoxColor = body.planetBoxColor;
    if (typeof body.backgroundColor === "string") fields.backgroundColor = body.backgroundColor;
    if (typeof body.wheelAccentColor === "string") fields.wheelAccentColor = body.wheelAccentColor;
    if (body.houseSystem === "placidus" || body.houseSystem === "whole" || body.houseSystem === "equal") fields.houseSystem = body.houseSystem;

    const design = await updateChartDesign(subAccountId, designId, fields);
    return NextResponse.json({ ok: true, design });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not found" }, { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; designId: string }> },
) {
  const { id: subAccountId, designId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteChartDesign(subAccountId, designId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Not found" }, { status: 400 });
  }
}
