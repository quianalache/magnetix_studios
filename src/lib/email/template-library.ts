"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import {
  emailDocumentFromBroadcastContent,
  emailDocumentFromMessageTemplate,
  broadcastContentFromEmailDocument,
  workflowEmailFromDocument,
} from "@/lib/email/adapters";
import type { BroadcastContent } from "@/types/broadcast-content";
import type { BroadcastTemplateDoc } from "@/types/broadcast-content";
import type { MessageTemplateDoc } from "@/types/automations";

/**
 * Unified Email Templates (2026-09-10). Two Firestore collections back one
 * product-level "Email Template":
 *
 * - `broadcastTemplates` — already EmailDocument-capable (Broadcast's own
 *   "Save as template"). This is the canonical store: every NEW Email
 *   Template, and every legacy template once someone actually edits it,
 *   lives here going forward. The collection keeps its existing name and
 *   rules — renaming it would mean a data migration this phase doesn't
 *   need, and it was never shown to users anyway.
 * - `message_templates` where `type === "email"` — the legacy plain
 *   subject/body store, shared with SMS templates (untouched by any of
 *   this). A legacy record is adapted to an EmailDocument on read (never
 *   migrated in the background) and only gains real `content`/
 *   `emailDocument` fields — in place, same id, same collection — the
 *   moment someone opens and saves it through the shared visual editor.
 *
 * Every consumer (the Email Template Library, the Broadcast/Workflow
 * pickers, Save-as-Template) goes through this module rather than querying
 * either collection directly, so "Email Template" stays one product concept
 * no matter which collection a given record happens to live in.
 */

export type EmailTemplateSource = "visual" | "legacy";

/** Normalized shape the Library list and pickers actually render. */
export interface EmailTemplateSummary {
  id: string;
  source: EmailTemplateSource;
  name: string;
  subject: string;
  preheader: string | null;
  blockCount: number;
  updatedAtMs: number;
}

function toMillis(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function summarizeVisual(t: BroadcastTemplateDoc): EmailTemplateSummary {
  const content =
    t.content ??
    (t.emailDocument
      ? broadcastContentFromEmailDocument(t.emailDocument)
      : { version: 1 as const, blocks: [] });
  return {
    id: t.id,
    source: "visual",
    name: t.name || "Untitled email template",
    subject: t.subject ?? "",
    preheader: t.preheader ?? null,
    blockCount: content.blocks.length,
    updatedAtMs: toMillis(t.updatedAt) || toMillis(t.createdAt),
  };
}

function summarizeLegacy(t: MessageTemplateDoc): EmailTemplateSummary {
  return {
    id: t.id,
    source: "legacy",
    name: t.name || "Untitled email template",
    subject: t.subject ?? "",
    preheader: null,
    blockCount: t.content?.blocks?.length ?? 1,
    updatedAtMs: toMillis(t.updatedAt) || toMillis(t.createdAt),
  };
}

/**
 * Live-subscribes to the merged Email Template list for a sub-account.
 * Two listeners, one combined callback — matches the merge-on-read
 * philosophy above (nothing written, nothing migrated just by viewing).
 */
export function subscribeToEmailTemplates(
  subAccountId: string,
  onChange: (templates: EmailTemplateSummary[]) => void
): () => void {
  let visual: EmailTemplateSummary[] = [];
  let legacy: EmailTemplateSummary[] = [];
  const emit = () => {
    onChange(
      [...visual, ...legacy].sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    );
  };

  const unsubVisual =
    safeSubscribe(
      () =>
        onSnapshot(
          query(
            collection(getFirebaseDb(), "broadcastTemplates"),
            where("subAccountId", "==", subAccountId)
          ),
          (snap) => {
            visual = snap.docs.map((d) =>
              summarizeVisual({ id: d.id, ...d.data() } as BroadcastTemplateDoc)
            );
            emit();
          },
          () => emit()
        ),
      () => emit()
    ) ?? (() => {});
  const unsubLegacy =
    safeSubscribe(
      () =>
        onSnapshot(
          query(
            collection(getFirebaseDb(), "message_templates"),
            where("subAccountId", "==", subAccountId),
            where("type", "==", "email")
          ),
          (snap) => {
            legacy = snap.docs.map((d) =>
              summarizeLegacy({ id: d.id, ...d.data() } as MessageTemplateDoc)
            );
            emit();
          },
          () => emit()
        ),
      () => emit()
    ) ?? (() => {});

  return () => {
    unsubVisual();
    unsubLegacy();
  };
}

export interface LoadedTemplate {
  source: EmailTemplateSource;
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
}

/** Loads one template's full authoring content, regardless of source. */
export async function loadEmailTemplate(
  id: string,
  source?: EmailTemplateSource,
): Promise<LoadedTemplate | null> {
  const db = getFirebaseDb();
  const visualSnap =
    source !== "legacy" ? await getDoc(doc(db, "broadcastTemplates", id)) : null;
  if (visualSnap?.exists()) {
    const t = visualSnap.data() as BroadcastTemplateDoc;
    const content =
      t.content ??
      (t.emailDocument
        ? broadcastContentFromEmailDocument(t.emailDocument)
        : { version: 1 as const, blocks: [] });
    return {
      source: "visual",
      name: t.name ?? "",
      subject: t.subject ?? "",
      preheader: t.preheader ?? null,
      content,
    };
  }
  const legacySnap =
    source !== "visual" ? await getDoc(doc(db, "message_templates", id)) : null;
  if (legacySnap?.exists()) {
    const t = { id: legacySnap.id, ...legacySnap.data() } as MessageTemplateDoc;
    if (t.type !== "email") return null;
    // Already upgraded in place — use the real content directly.
    if (t.content) {
      return {
        source: "legacy",
        name: t.name ?? "",
        subject: t.subject ?? "",
        preheader: t.emailDocument?.preheader ?? null,
        content: t.content,
      };
    }
    // Still pure legacy — adapt on read, write nothing.
    const document = emailDocumentFromMessageTemplate(t);
    return {
      source: "legacy",
      name: t.name ?? "",
      subject: t.subject ?? "",
      preheader: null,
      content: broadcastContentFromEmailDocument(document),
    };
  }
  return null;
}

/** Creates a brand-new Email Template — always in the canonical store. */
export async function createEmailTemplate(input: {
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
}): Promise<string> {
  const emailDocument = emailDocumentFromBroadcastContent(
    input.content,
    input.subject,
    input.preheader
  );
  const ref = await addDoc(collection(getFirebaseDb(), "broadcastTemplates"), {
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    name: input.name.trim() || "Untitled email template",
    subject: input.subject.trim(),
    preheader: input.preheader?.trim() || null,
    content: input.content,
    emailDocument,
    createdByUid: input.createdByUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Saves edits to an existing Email Template, whichever collection it
 * actually lives in. A legacy record gains real content/emailDocument
 * fields here — its id, type, and collection never change.
 */
export async function saveEmailTemplate(input: {
  id: string;
  source: EmailTemplateSource;
  name: string;
  subject: string;
  preheader: string | null;
  content: BroadcastContent;
}): Promise<void> {
  const emailDocument = emailDocumentFromBroadcastContent(
    input.content,
    input.subject,
    input.preheader
  );
  if (input.source === "visual") {
    await updateDoc(doc(getFirebaseDb(), "broadcastTemplates", input.id), {
      name: input.name.trim() || "Untitled email template",
      subject: input.subject.trim(),
      preheader: input.preheader?.trim() || null,
      content: input.content,
      emailDocument,
      updatedAt: serverTimestamp(),
    });
    return;
  }
  // Legacy: upgrade in place. `body` is kept in sync for any older code
  // path that still reads it directly — nothing in the new experience
  // does once content/emailDocument are present.
  const { body } = workflowEmailFromDocument(emailDocument);
  await updateDoc(doc(getFirebaseDb(), "message_templates", input.id), {
    name: input.name.trim() || "Untitled email template",
    subject: input.subject.trim(),
    body,
    content: input.content,
    emailDocument,
    updatedAt: serverTimestamp(),
  });
}

/** Always duplicates into the canonical store — a copy is a new, independent object either way. */
export async function duplicateEmailTemplate(input: {
  agencyId: string;
  subAccountId: string;
  createdByUid: string;
  template: LoadedTemplate;
}): Promise<string> {
  return createEmailTemplate({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    createdByUid: input.createdByUid,
    name: `${input.template.name} (copy)`.trim(),
    subject: input.template.subject,
    preheader: input.template.preheader,
    content: input.template.content,
  });
}

export async function renameEmailTemplate(
  id: string,
  source: EmailTemplateSource,
  name: string
): Promise<void> {
  const collectionName = source === "visual" ? "broadcastTemplates" : "message_templates";
  await updateDoc(doc(getFirebaseDb(), collectionName, id), {
    name: name.trim() || "Untitled email template",
    updatedAt: serverTimestamp(),
  });
}

export async function deleteEmailTemplate(
  id: string,
  source: EmailTemplateSource
): Promise<void> {
  const collectionName = source === "visual" ? "broadcastTemplates" : "message_templates";
  await deleteDoc(doc(getFirebaseDb(), collectionName, id));
}
