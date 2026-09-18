import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { saveAgencyCommunicationDraftServerSide } from "@/lib/server/agency-communications-service";
import type { AgencyAudienceSource } from "@/types/agency-communications";
import type { BroadcastContent } from "@/types/broadcast-content";

export const dynamic = "force-dynamic";

interface DraftSaveBody {
  communicationId?: string;
  subject?: string;
  preheader?: string | null;
  content?: BroadcastContent;
  audienceSources?: AgencyAudienceSource[];
  sourceTemplateId?: string | null;
  sessionId?: string;
  clientSeq?: number;
}

/** Agency Communications draft autosave — the agency-scope sibling of
 *  /api/broadcasts/draft/save. Same create-or-update-in-place, stale-write-
 *  guarded contract; see agency-communications-service.ts for the shared
 *  transaction logic. */
export async function POST(request: Request) {
  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let payload: DraftSaveBody;
  try {
    payload = (await request.json()) as DraftSaveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const communicationId = payload.communicationId?.trim();
  const subject = payload.subject ?? "";
  const preheader = payload.preheader?.trim() || null;
  const content = payload.content;
  const audienceSources = Array.isArray(payload.audienceSources) ? payload.audienceSources : [];
  const sourceTemplateId = payload.sourceTemplateId?.trim() || null;
  const sessionId = payload.sessionId?.trim();
  const clientSeq = payload.clientSeq;

  if (!communicationId || !content || !sessionId || typeof clientSeq !== "number") {
    return NextResponse.json({ error: "communicationId, content, sessionId, and clientSeq are required" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9_-]+$/.test(communicationId)) {
    return NextResponse.json({ error: "Invalid communicationId" }, { status: 400 });
  }
  if (!Array.isArray(content.blocks)) {
    return NextResponse.json({ error: "content.blocks must be an array" }, { status: 400 });
  }

  const result = await saveAgencyCommunicationDraftServerSide({
    agencyId: caller.agencyId!,
    communicationId,
    subject,
    preheader,
    content,
    audienceSources,
    sourceTemplateId,
    createdByUid: caller.uid,
    createdBy: { displayName: caller.email, email: caller.email },
    sessionId,
    clientSeq,
  });

  return NextResponse.json(result);
}
