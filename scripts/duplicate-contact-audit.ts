/**
 * READ-ONLY. Duplicate Contact reconciliation audit for one sub-account.
 *
 * Groups contacts by normalized email, and for every group with >1 contact,
 * pulls every reference type performContactMerge (src/lib/server/contact-merge.ts)
 * either already repoints, or currently does NOT repoint (a real gap this
 * audit exists to surface). No writes. No merges. No deletes.
 *
 * Run:
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     SUBACCOUNT_ID=xvnedVCmQpEvHrcPhEDI \
 *     pnpm exec tsx scripts/duplicate-contact-audit.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function loadEnvLocal() {
  const envPath = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

import { getAdminDb } from "../src/lib/firebase/admin";

function tsToIso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === "function") return t.toDate().toISOString();
  return null;
}

async function main() {
  const subAccountId = process.env.SUBACCOUNT_ID;
  if (!subAccountId) throw new Error("SUBACCOUNT_ID env var required");
  const db = getAdminDb();

  const contactsSnap = await db
    .collection("contacts")
    .where("subAccountId", "==", subAccountId)
    .get();

  console.log(`Total contacts in sub-account: ${contactsSnap.size}`);

  const byEmail = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  let noEmailCount = 0;
  for (const doc of contactsSnap.docs) {
    const email = ((doc.data().email as string) ?? "").trim().toLowerCase();
    if (!email) {
      noEmailCount++;
      continue;
    }
    const list = byEmail.get(email) ?? [];
    list.push(doc);
    byEmail.set(email, list);
  }

  const dupGroups = Array.from(byEmail.entries()).filter(([, docs]) => docs.length > 1);
  console.log(`Contacts with no email (excluded from email-based dedup): ${noEmailCount}`);
  console.log(`Unique emails: ${byEmail.size}`);
  console.log(`Duplicate groups (same email, >1 contact): ${dupGroups.length}`);
  console.log(`Total duplicate contact records (across all groups): ${dupGroups.reduce((n, [, d]) => n + d.length, 0)}`);

  type ContactRefCounts = {
    id: string;
    name: string;
    email: string;
    phone: string;
    source: string;
    tags: string[];
    customFieldCount: number;
    createdAt: string | null;
    updatedAt: string | null;
    hasNotesOrActivity: boolean;
    counts: {
      deals: number;
      tasks: number;
      events: number;
      quotes: number;
      formSubmissions: number;
      webChatSessions: number;
      voiceCalls: number;
      notes: number;
      activities: number;
      messages: number;
      whatsappMessages: number;
      metaMessages: number;
      members: number; // subAccounts/{sa}/members where contactId == this contact
      externalSubscriptions: number;
      externalPayments: number;
      projectsAssigned: number; // projects.assignedContactId == this contact
    };
    linkedMemberIds: string[];
  };

  async function loadContactRefCounts(
    doc: FirebaseFirestore.QueryDocumentSnapshot,
  ): Promise<ContactRefCounts> {
    const data = doc.data();
    const id = doc.id;

    const [
      deals,
      tasks,
      events,
      quotes,
      submissions,
      webChatSessions,
      voiceCalls,
      notes,
      activities,
      messages,
      whatsappMessages,
      metaMessages,
      members,
      externalSubscriptions,
      externalPayments,
      projectsAssigned,
    ] = await Promise.all([
      db.collection("deals").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
      db.collection("tasks").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
      db.collection("events").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
      db.collection("quotes").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
      db.collectionGroup("submissions").where("contactId", "==", id).count().get(),
      db.collection("subAccounts").doc(subAccountId!).collection("webChatSessions").where("contactId", "==", id).count().get(),
      db.collection("subAccounts").doc(subAccountId!).collection("voiceCalls").where("contactId", "==", id).count().get(),
      doc.ref.collection("notes").count().get(),
      doc.ref.collection("activities").count().get(),
      doc.ref.collection("messages").count().get(),
      doc.ref.collection("whatsappMessages").count().get(),
      doc.ref.collection("metaMessages").count().get(),
      db.collection(`subAccounts/${subAccountId}/members`).where("contactId", "==", id).get(),
      db.collection("externalSubscriptions").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
      db.collection("externalPayments").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
      db.collection("projects").where("subAccountId", "==", subAccountId).where("assignedContactId", "==", id).count().get(),
    ]);

    return {
      id,
      name: (data.name as string) ?? "",
      email: (data.email as string) ?? "",
      phone: (data.phone as string) ?? "",
      source: (data.source as string) ?? "",
      tags: (data.tags as string[]) ?? [],
      customFieldCount: Object.keys((data.customFields as Record<string, unknown>) ?? {}).length,
      createdAt: tsToIso(data.createdAt),
      updatedAt: tsToIso(data.updatedAt),
      hasNotesOrActivity: false,
      counts: {
        deals: deals.data().count,
        tasks: tasks.data().count,
        events: events.data().count,
        quotes: quotes.data().count,
        formSubmissions: submissions.data().count,
        webChatSessions: webChatSessions.data().count,
        voiceCalls: voiceCalls.data().count,
        notes: notes.data().count,
        activities: activities.data().count,
        messages: messages.data().count,
        whatsappMessages: whatsappMessages.data().count,
        metaMessages: metaMessages.data().count,
        members: members.size,
        externalSubscriptions: externalSubscriptions.data().count,
        externalPayments: externalPayments.data().count,
        projectsAssigned: projectsAssigned.data().count,
      },
      linkedMemberIds: members.docs.map((m) => m.id),
    };
  }

  function score(c: ContactRefCounts): number {
    // Strongest active system relationships win, per the task's canonical-
    // selection rule (never just oldest/newest/lowest-id).
    let s = 0;
    s += c.linkedMemberIds.length * 1000; // linked Member/community identity is the strongest signal
    s += c.counts.externalSubscriptions * 500;
    s += c.counts.externalPayments * 200;
    s += c.counts.quotes * 100;
    s += c.counts.deals * 50;
    s += c.counts.projectsAssigned * 50;
    s += c.counts.events * 10;
    s += c.counts.tasks * 10;
    s += c.counts.formSubmissions * 5;
    s += c.counts.notes * 5;
    s += c.counts.activities * 2;
    s += c.counts.messages + c.counts.whatsappMessages + c.counts.metaMessages;
    s += c.counts.webChatSessions + c.counts.voiceCalls;
    if (c.name.trim()) s += 3;
    if (c.phone.trim()) s += 2;
    s += c.tags.length;
    s += c.customFieldCount;
    return s;
  }

  const report: {
    subAccountId: string;
    totalContacts: number;
    contactsWithNoEmail: number;
    duplicateGroups: number;
    duplicateRecordsTotal: number;
    groups: {
      email: string;
      recommendedCanonicalId: string;
      recommendedReason: string;
      safeToAutoReconcile: boolean;
      manualReviewReasons: string[];
      contacts: ContactRefCounts[];
      valueConflicts: Record<string, { values: Record<string, string>; note: string }>;
    }[];
  } = {
    subAccountId,
    totalContacts: contactsSnap.size,
    contactsWithNoEmail: noEmailCount,
    duplicateGroups: dupGroups.length,
    duplicateRecordsTotal: dupGroups.reduce((n, [, d]) => n + d.length, 0),
    groups: [],
  };

  let processed = 0;
  for (const [email, docs] of dupGroups) {
    const contacts = await Promise.all(docs.map(loadContactRefCounts));
    contacts.sort((a, b) => score(b) - score(a));

    const canonical = contacts[0];
    const runnersUp = contacts.slice(1);

    const manualReviewReasons: string[] = [];

    // Multiple contacts each carrying a linked Member -> can't be safely
    // auto-merged; a human must decide which Member relationship survives.
    const memberCarriers = contacts.filter((c) => c.linkedMemberIds.length > 0);
    if (memberCarriers.length > 1) {
      manualReviewReasons.push(
        `${memberCarriers.length} of ${contacts.length} contacts each have a linked community Member record — merge would need to repoint Member.contactId, review before auto-reconciling.`,
      );
    }
    // References split across more than just the canonical + one loser with
    // zero references (i.e. references are spread across multiple losers).
    const nonCanonicalWithRefs = runnersUp.filter((c) => score(c) > 0);
    if (nonCanonicalWithRefs.length > 1) {
      manualReviewReasons.push(
        `More than one non-canonical contact carries real references (${nonCanonicalWithRefs.map((c) => c.id).join(", ")}) — confirm nothing is lost across a single merge.`,
      );
    }
    const anySubscriptionOrPayment = contacts.some(
      (c) => c.counts.externalSubscriptions > 0 || c.counts.externalPayments > 0,
    );
    if (anySubscriptionOrPayment) {
      manualReviewReasons.push(
        "At least one duplicate carries ExternalSubscription/ExternalPayment records — contact-merge.ts does NOT currently repoint these collections (verified gap); do not merge until the merge engine is patched.",
      );
    }
    if (contacts.some((c) => c.counts.projectsAssigned > 0)) {
      manualReviewReasons.push(
        "At least one duplicate is assigned to a Project — contact-merge.ts does NOT currently repoint projects.assignedContactId (verified gap); do not merge until the merge engine is patched.",
      );
    }
    if (memberCarriers.length >= 1) {
      manualReviewReasons.push(
        "contact-merge.ts does NOT currently repoint subAccounts/{sa}/members.contactId (verified gap) — merging a contact with a linked Member would leave that Member's CRM link dangling until the merge engine is patched.",
      );
    }

    // Value conflicts on fields where the two non-blank values differ.
    const valueConflicts: Record<string, { values: Record<string, string>; note: string }> = {};
    const fieldsToCompare: (keyof ContactRefCounts)[] = ["name", "phone"];
    for (const field of fieldsToCompare) {
      const distinctValues = new Map<string, string>();
      for (const c of contacts) {
        const v = String(c[field] ?? "").trim();
        if (v) distinctValues.set(c.id, v);
      }
      const uniqueVals = new Set(distinctValues.values());
      if (uniqueVals.size > 1) {
        valueConflicts[field] = {
          values: Object.fromEntries(distinctValues),
          note: `Conflicting non-blank ${field} values across duplicates — canonical's value wins per merge rule, others reported here (not guessed).`,
        };
      }
    }

    report.groups.push({
      email,
      recommendedCanonicalId: canonical.id,
      recommendedReason:
        canonical.linkedMemberIds.length > 0
          ? "Has the linked community Member record (strongest identity signal)."
          : score(canonical) > 0
            ? "Carries the most/strongest active system relationships among the duplicates."
            : "No duplicate in this group carries any system relationships — arbitrary tie among empty records.",
      safeToAutoReconcile: manualReviewReasons.length === 0,
      manualReviewReasons,
      contacts,
      valueConflicts,
    });

    processed++;
    if (processed % 10 === 0) console.log(`  ...processed ${processed}/${dupGroups.length} groups`);
  }

  const safeGroups = report.groups.filter((g) => g.safeToAutoReconcile).length;
  const manualGroups = report.groups.length - safeGroups;
  console.log(`\nGroups safe to auto-reconcile (no manual-review flags): ${safeGroups}`);
  console.log(`Groups requiring manual review: ${manualGroups}`);

  const outFile = process.env.OUT_FILE ?? "/tmp/duplicate-contact-audit.json";
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
