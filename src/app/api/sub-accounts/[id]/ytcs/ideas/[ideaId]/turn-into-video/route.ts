import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { createVideoProject, getIdea } from "@/lib/server/ytcs-service";

/**
 * POST /api/sub-accounts/[id]/ytcs/ideas/[ideaId]/turn-into-video
 *
 * Creates a new Video Project from a Saved Idea. Exact behavior was not
 * independently live-verified (dossier-listed action only, migration
 * spec §14) — implemented as the most faithful real mapping available:
 * `startingPointType: "brain_dump"` (Brain Dump's own description —
 * "a messy idea, random thought, lesson, hot take, or question" —
 * matches the real Saved Idea `type` value, "Random Thought", almost
 * verbatim; it's also Input's own default when unset, so this is the
 * least invented starting point choice), `rawTranscript` seeded from
 * the idea's `notes` (Brain Dump's real source-material field), the
 * idea's voice notes carried over as `brainDumpVoiceNotes` (same
 * Storage references, not re-uploaded), and `sourceIdeaId` set for
 * traceability. The source idea is never mutated or deleted — the
 * instruction is explicit that Turn Into Video must not touch it
 * unless the spec says to, and it doesn't.
 */
export async function POST(
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

  const project = await createVideoProject(
    subAccountId,
    { name: idea.title || "New Idea" },
    {
      startingPointType: "brain_dump",
      rawTranscript: idea.notes || "",
      sourceIdeaId: idea.id,
      ...(idea.ideaVoiceNotes?.length ? { brainDumpVoiceNotes: idea.ideaVoiceNotes } : {}),
    },
  );

  return NextResponse.json({ ok: true, project });
}
