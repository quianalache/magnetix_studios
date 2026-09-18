import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emailDocumentFromBroadcast } from "@/lib/email/adapters";
import type {
  AgencyAudienceSource,
  AgencyCommunicationDoc,
} from "@/types/agency-communications";
import type { BroadcastContent } from "@/types/broadcast-content";

/**
 * CRUD for `agencies/{agencyId}/communications/{id}` — the agency-scope
 * sibling of course-offer/broadcast style services throughout this
 * codebase. Draft autosave mirrors tenant Broadcasts' own Persistent
 * Broadcast Drafts V1 pattern exactly (same doc reused draft -> queued in
 * place, same stale-write guard via sessionId/seq).
 */

function communicationsCol(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/communications`);
}
function communicationDoc(agencyId: string, id: string) {
  return communicationsCol(agencyId).doc(id);
}

export async function getAgencyCommunication(agencyId: string, id: string): Promise<AgencyCommunicationDoc | null> {
  const snap = await communicationDoc(agencyId, id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<AgencyCommunicationDoc, "id">) };
}

export async function listAgencyCommunications(agencyId: string): Promise<AgencyCommunicationDoc[]> {
  const snap = await communicationsCol(agencyId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AgencyCommunicationDoc, "id">) }));
}

export interface SaveAgencyCommunicationDraftInput {
  agencyId: string;
  communicationId: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
  audienceSources: AgencyAudienceSource[];
  sourceTemplateId: string | null;
  createdByUid: string;
  createdBy: { displayName: string; email: string };
  sessionId: string;
  clientSeq: number;
}

/** Autosave — creates the doc on first meaningful edit, then updates the
 *  SAME doc from then on. Rejects (ignored: "stale") an out-of-order
 *  autosave from the same browser tab, and rejects (ignored: "launched")
 *  any further autosave once the doc has moved past "draft". */
export async function saveAgencyCommunicationDraftServerSide(
  input: SaveAgencyCommunicationDraftInput,
): Promise<{ ok: true; ignored?: "stale" | "launched"; created?: boolean }> {
  const ref = communicationDoc(input.agencyId, input.communicationId);
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      const doc: Omit<AgencyCommunicationDoc, "id"> = {
        agencyId: input.agencyId,
        subjectPreview: input.subject.slice(0, 200),
        content: input.content,
        emailDocument: emailDocumentFromBroadcast(input.content, input.subject, input.preheader),
        subject: input.subject,
        preheader: input.preheader,
        sourceTemplateId: input.sourceTemplateId,
        audienceSources: input.audienceSources,
        status: "draft",
        totals: { audienceSize: 0, queued: 0, sent: 0, skipped: 0, failed: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 },
        createdByUid: input.createdByUid,
        createdBy: input.createdBy,
        createdAt: FieldValue.serverTimestamp() as unknown as null,
        updatedAt: FieldValue.serverTimestamp() as unknown as null,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        lastSaveSessionId: input.sessionId,
        lastSaveSeq: input.clientSeq,
      };
      tx.set(ref, { id: ref.id, ...doc });
      return { ok: true, created: true };
    }
    const existing = snap.data() as AgencyCommunicationDoc;
    if (existing.status !== "draft") return { ok: true, ignored: "launched" };
    const sameSession = existing.lastSaveSessionId === input.sessionId;
    if (sameSession && (existing.lastSaveSeq ?? 0) >= input.clientSeq) {
      return { ok: true, ignored: "stale" };
    }
    tx.update(ref, {
      subjectPreview: input.subject.slice(0, 200),
      content: input.content,
      emailDocument: emailDocumentFromBroadcast(input.content, input.subject, input.preheader),
      subject: input.subject,
      preheader: input.preheader,
      sourceTemplateId: input.sourceTemplateId,
      audienceSources: input.audienceSources,
      updatedAt: FieldValue.serverTimestamp(),
      lastSaveSessionId: input.sessionId,
      lastSaveSeq: input.clientSeq,
    });
    return { ok: true };
  });
}

export async function deleteAgencyCommunicationDraft(agencyId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const ref = communicationDoc(agencyId, id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  const data = snap.data() as AgencyCommunicationDoc;
  if (data.status !== "draft") {
    return { ok: false, error: "Only a draft can be deleted." };
  }
  await getAdminDb().recursiveDelete(ref);
  return { ok: true };
}

export async function cancelAgencyCommunication(agencyId: string, id: string, cancelledBy: { displayName: string; email: string }): Promise<{ ok: boolean; error?: string }> {
  const ref = communicationDoc(agencyId, id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Not found" };
  const data = snap.data() as AgencyCommunicationDoc;
  // Idempotent — an already-terminal communication (double-click, retried
  // request) is a no-op success, not an error.
  if (data.status === "cancelled" || data.status === "completed" || data.status === "failed") {
    return { ok: true };
  }
  if (data.status !== "queued" && data.status !== "sending") {
    return { ok: false, error: "This communication isn't in a cancellable state." };
  }
  await ref.update({
    status: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    cancelledBy,
    completedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true };
}
