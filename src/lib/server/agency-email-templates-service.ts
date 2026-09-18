import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emailDocumentFromBroadcastContent, broadcastContentFromEmailDocument } from "@/lib/email/adapters";
import type { AgencyEmailTemplateDoc } from "@/types/agency-communications";
import type { BroadcastContent } from "@/types/broadcast-content";
import type { EmailTemplateSummary } from "@/lib/email/template-library";

/**
 * Agency Email Templates — `agencies/{agencyId}/emailTemplates/{id}`, a
 * standalone collection (not the tenant `broadcastTemplates` collection
 * with a different scope field) so an Agency template can never appear in
 * any tenant template query, structurally, not just by convention. Field
 * shape mirrors `BroadcastTemplateDoc`/the "visual" half of tenant's
 * unified Email Templates (no legacy `message_templates` equivalent needed
 * — Agency Communications is new, nothing to migrate).
 */

function templatesCol(agencyId: string) {
  return getAdminDb().collection(`agencies/${agencyId}/emailTemplates`);
}

function toMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function summarize(t: AgencyEmailTemplateDoc): EmailTemplateSummary {
  return {
    id: t.id,
    source: "visual",
    name: t.name || "Untitled email template",
    subject: t.subject ?? "",
    preheader: t.preheader ?? null,
    blockCount: t.content?.blocks.length ?? 0,
    updatedAtMs: toMillis(t.updatedAt) || toMillis(t.createdAt),
  };
}

export async function listAgencyEmailTemplates(agencyId: string): Promise<EmailTemplateSummary[]> {
  const snap = await templatesCol(agencyId).get();
  return snap.docs
    .map((d) => summarize({ id: d.id, ...(d.data() as Omit<AgencyEmailTemplateDoc, "id">) }))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export interface LoadedAgencyTemplate {
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
}

export async function loadAgencyEmailTemplate(agencyId: string, id: string): Promise<LoadedAgencyTemplate | null> {
  const snap = await templatesCol(agencyId).doc(id).get();
  if (!snap.exists) return null;
  const t = snap.data() as Omit<AgencyEmailTemplateDoc, "id">;
  const content = t.content ?? (t.emailDocument ? broadcastContentFromEmailDocument(t.emailDocument) : { version: 1 as const, blocks: [] });
  return { name: t.name ?? "", subject: t.subject ?? "", preheader: t.preheader ?? null, content };
}

export async function createAgencyEmailTemplateServerSide(input: {
  agencyId: string;
  createdByUid: string;
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
}): Promise<string> {
  const emailDocument = emailDocumentFromBroadcastContent(input.content, input.subject, input.preheader);
  const ref = await templatesCol(input.agencyId).add({
    agencyId: input.agencyId,
    name: input.name.trim() || "Untitled email template",
    subject: input.subject.trim(),
    preheader: input.preheader?.trim() || null,
    content: input.content,
    emailDocument,
    createdByUid: input.createdByUid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function saveAgencyEmailTemplateServerSide(input: {
  agencyId: string;
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
}): Promise<void> {
  const emailDocument = emailDocumentFromBroadcastContent(input.content, input.subject, input.preheader);
  await templatesCol(input.agencyId).doc(input.id).update({
    name: input.name.trim() || "Untitled email template",
    subject: input.subject.trim(),
    preheader: input.preheader?.trim() || null,
    content: input.content,
    emailDocument,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function deleteAgencyEmailTemplateServerSide(agencyId: string, id: string): Promise<void> {
  await templatesCol(agencyId).doc(id).delete();
}
