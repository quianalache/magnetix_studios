import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { getBusinessBrain } from "@/lib/server/business-brain-service";
import { businessBrainDocPath } from "@/types/business-brain";
import type {
  BusinessBrainAudience,
  BusinessBrainFramework,
  BusinessBrainOffer,
  BusinessBrainPositioning,
  BusinessBrainStory,
  BusinessBrainSubtopic,
  BusinessBrainTopic,
  BusinessBrainVision,
  BusinessBrainVoice,
} from "@/types/business-brain";

/**
 * GET/PATCH /api/sub-accounts/[id]/business-brain
 *
 * The one write path for the shared Business Brain UI (Settings ->
 * Business Brain). GET reuses the same canonical reader every other
 * consumer will use (getBusinessBrain) — no UI-specific duplicate
 * representation. PATCH accepts any subset of the 9 canonical top-level
 * sections and merge-writes only those keys, so saving one section (e.g.
 * Creator Vision) can never touch, wipe, or race another section, and
 * NEVER touches `legacy`/`unknownFields`/the Phase-0 provenance fields —
 * those simply aren't in the allowed key list below, so a merge write can
 *'t reach them.
 *
 * Auth: sub-account admin or agency owner (requireSubAccountAdmin) — same
 * guard every other sub-account settings write route uses.
 */

const EDITABLE_SECTION_KEYS = [
  "vision",
  "audience",
  "offers",
  "frameworks",
  "stories",
  "voice",
  "topics",
  "subtopics",
  "positioning",
] as const;
type EditableSectionKey = (typeof EDITABLE_SECTION_KEYS)[number];

interface PatchBody {
  vision?: BusinessBrainVision;
  audience?: BusinessBrainAudience;
  offers?: BusinessBrainOffer[];
  frameworks?: BusinessBrainFramework[];
  stories?: BusinessBrainStory[];
  voice?: BusinessBrainVoice;
  topics?: BusinessBrainTopic[];
  subtopics?: BusinessBrainSubtopic[];
  positioning?: BusinessBrainPositioning;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const brain = await getBusinessBrain(subAccountId);
  return NextResponse.json({ ok: true, brain });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountAdmin(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Partial<Record<EditableSectionKey, unknown>> = {};
  for (const key of EDITABLE_SECTION_KEYS) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid Business Brain sections in the request body." },
      { status: 400 },
    );
  }

  await getAdminDb()
    .doc(businessBrainDocPath(subAccountId))
    .set(
      {
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  const brain = await getBusinessBrain(subAccountId);
  return NextResponse.json({ ok: true, brain });
}
