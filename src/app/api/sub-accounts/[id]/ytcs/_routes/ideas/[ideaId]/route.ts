import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { deleteIdea, getIdea, updateIdea } from "@/lib/server/ytcs-service";
import type { YtcsIdea } from "@/types/ytcs";

/**
 * GET/PATCH/DELETE /api/sub-accounts/[id]/ytcs/ideas/[ideaId]
 *
 * PATCH is allowlisted to the real confirmed Saved Idea schema only
 * (migration spec §14) — `title`/`type`/`notes`/`priority`/`status`/
 * `ideaVoiceNotes`. `migratedFromExport`/`migratedAt` are never in the
 * allowlist, same defense-in-depth as every other YTCS PATCH route.
 */
const EDITABLE_KEYS = ["title", "type", "notes", "priority", "status", "ideaVoiceNotes"] as const;

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; ideaId: string }> },
) {
  const { id: subAccountId, ideaId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const idea = await getIdea(subAccountId, ideaId);
  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, idea });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string; ideaId: string }> },
) {
  const { id: subAccountId, ideaId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const existing = await getIdea(subAccountId, ideaId);
  if (!existing) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Partial<YtcsIdea> = {};
  for (const key of EDITABLE_KEYS) {
    if (key in body) {
      (updates as Record<string, unknown>)[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in the request body." }, { status: 400 });
  }

  const idea = await updateIdea(subAccountId, ideaId, updates);
  return NextResponse.json({ ok: true, idea });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string; ideaId: string }> },
) {
  const { id: subAccountId, ideaId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const existing = await getIdea(subAccountId, ideaId);
  if (!existing) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  // Firestore-doc-only delete — never touches Storage, matching
  // `deleteVideoProject`'s existing non-destructive behavior. Any
  // voice-note recordings remain in Storage even after this idea doc is
  // gone (harmless — Magnetix's storage costs don't scale with content
  // volume, see project_course_costs_dont_scale), and this also means a
  // video project created from this idea via Turn Into Video keeps its
  // copied voice-note references working after the source idea is
  // deleted.
  await deleteIdea(subAccountId, ideaId);
  return NextResponse.json({ ok: true });
}
