import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin, requireSubAccountMember } from "@/lib/auth/require-tenancy";
import {
  ChartDesignSetError,
  deleteChartDesignSet,
  getChartDesignSet,
  readChartDesignSetPatch,
  setDefaultChartDesignSet,
  updateChartDesignSet,
} from "@/lib/server/chart-design-set-service";

type Ctx = { params: Promise<{ id: string; setId: string }> };

function errorResponse(err: unknown) {
  if (err instanceof ChartDesignSetError) return NextResponse.json({ error: err.message }, { status: err.status });
  throw err;
}

export async function GET(request: Request, ctx: Ctx) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const set = await getChartDesignSet(subAccountId, setId);
  if (!set) return NextResponse.json({ error: "Chart design not found" }, { status: 404 });
  return NextResponse.json({ ok: true, set });
}

/**
 * One save for the whole unified design:
 *   { name?, humanDesign?: {…fields}, mandala?: {…}, astrology?: {…} }
 * Calculation settings (the Astrology house system) are NOT part of a
 * Chart Design — they're saved through Reading Configuration.
 * or `{ isDefault: true }` on its own to make it the default.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.isDefault !== undefined) {
      if (body.isDefault !== true || Object.keys(body).length !== 1) {
        return NextResponse.json({ error: "Send { isDefault: true } on its own to make a design the default." }, { status: 400 });
      }
      const set = await setDefaultChartDesignSet(subAccountId, setId);
      return NextResponse.json({ ok: true, set });
    }

    const unknown = Object.keys(body).filter((k) => !["name", "humanDesign", "mandala", "astrology"].includes(k));
    const { name, systems, errors } = readChartDesignSetPatch(body);
    if (unknown.length > 0) errors.push(...unknown.map((k) => `"${k}" can't be changed here`));
    if (errors.length > 0) return NextResponse.json({ error: errors.join(" "), errors }, { status: 400 });

    const set = await updateChartDesignSet(subAccountId, setId, { name, systems });
    return NextResponse.json({ ok: true, set });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id: subAccountId, setId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteChartDesignSet(subAccountId, setId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
