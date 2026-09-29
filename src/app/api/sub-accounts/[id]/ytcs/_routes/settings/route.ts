import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getYtcsSettings, updateYtcsSettings } from "@/lib/server/ytcs-service";
import type { YtcsSettings } from "@/types/ytcs";

/**
 * GET/PATCH /api/sub-accounts/[id]/ytcs/settings
 *
 * Sub-account-wide (migration spec §20/§16 — a sibling singleton to
 * `ytcs/brain`), not per-user — no per-user preference model exists
 * anywhere else in Magnetix to adapt to instead. Allowlisted to exactly
 * the two real, final Default Script Settings fields (§16); the old
 * standalone tool's Data Management (Export/Clear All Data) and PDF-
 * Enhanced Prompt features are deliberately not rebuilt here — Magnetix
 * uses authenticated Firestore/Storage, not local browser data, so
 * there's no ongoing product need for redundant backup/import/export,
 * and the PDF prompt's exact content was never captured (see spec §16).
 */
const EDITABLE_KEYS = ["defaultScriptOutputType", "defaultDepthPreference"] as const;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const settings = await getYtcsSettings(subAccountId);
  return NextResponse.json({ ok: true, settings: settings ?? {} });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Partial<YtcsSettings> = {};
  for (const key of EDITABLE_KEYS) {
    if (key in body) {
      (updates as Record<string, unknown>)[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in the request body." }, { status: 400 });
  }

  const settings = await updateYtcsSettings(subAccountId, updates);
  return NextResponse.json({ ok: true, settings });
}
