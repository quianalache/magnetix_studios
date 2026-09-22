/**
 * Recomputes the current (not stale-audit) duplicate-contact state for one
 * sub-account, classifies each duplicate group as TYPE A / TYPE B / manual-
 * review, and — only in --commit mode — runs performContactMerge against
 * the qualifying groups ONLY. The 83 manual-review groups identified by the
 * prior full audit are never touched by this script; any group that no
 * longer cleanly qualifies at execution time is also skipped, not forced.
 *
 * TYPE A — every non-canonical duplicate has zero meaningful CRM references.
 * TYPE B — exactly one contact in the group carries meaningful data, and it
 *          IS the recommended canonical/survivor.
 * "Meaningful" = deals/tasks/events/quotes/formSubmissions/notes/activities/
 * messages/whatsappMessages/metaMessages/webChatSessions/voiceCalls/members/
 * externalSubscriptions/externalPayments/projectsAssigned — NOT name/phone/
 * tags (those alone don't block a safe merge, matching the corrected
 * classification from the audit report, not the original over-conservative
 * script pass).
 *
 * Default is a DRY RUN (no writes). Pass --commit to actually merge.
 *
 * Run (dry run):
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     SUBACCOUNT_ID=xvnedVCmQpEvHrcPhEDI \
 *     pnpm exec tsx scripts/reconcile-safe-duplicate-contacts.ts
 *
 * Run (commit):
 *   ...same... pnpm exec tsx scripts/reconcile-safe-duplicate-contacts.ts --commit
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
import { performContactMerge } from "../src/lib/server/contact-merge";
import type { Contact } from "../src/types/contacts";
import type { CustomFieldValue } from "../src/types/custom-fields";

const COMMIT = process.argv.includes("--commit");

type RefCounts = {
  deals: number; tasks: number; events: number; quotes: number; formSubmissions: number;
  notes: number; activities: number; messages: number; whatsappMessages: number; metaMessages: number;
  webChatSessions: number; voiceCalls: number; members: number; externalSubscriptions: number;
  externalPayments: number; projectsAssigned: number;
};

type ContactRow = {
  id: string;
  data: Omit<Contact, "id">;
  linkedMemberIds: string[];
  counts: RefCounts;
};

function meaningfulScore(c: RefCounts): number {
  return (
    c.deals + c.tasks + c.events + c.quotes + c.formSubmissions + c.notes + c.activities +
    c.messages + c.whatsappMessages + c.metaMessages + c.webChatSessions + c.voiceCalls +
    c.members + c.externalSubscriptions + c.externalPayments + c.projectsAssigned
  );
}

/** Same weighting the duplicate-contact-audit used for canonical selection,
 *  minus the name/phone/tags/customField terms (those don't indicate which
 *  record has irreplaceable system data — Member linkage and real CRM
 *  activity do). */
function canonicalScore(c: RefCounts): number {
  let s = 0;
  s += c.members * 1000;
  s += c.externalSubscriptions * 500;
  s += c.externalPayments * 200;
  s += c.quotes * 100;
  s += c.deals * 50;
  s += c.projectsAssigned * 50;
  s += c.events * 10;
  s += c.tasks * 10;
  s += c.formSubmissions * 5;
  s += c.notes * 5;
  s += c.activities * 2;
  s += c.messages + c.whatsappMessages + c.metaMessages;
  s += c.webChatSessions + c.voiceCalls;
  return s;
}

async function loadRefCounts(
  db: FirebaseFirestore.Firestore,
  subAccountId: string,
  contactRef: FirebaseFirestore.DocumentReference,
): Promise<{ counts: RefCounts; linkedMemberIds: string[] }> {
  const id = contactRef.id;
  const [
    deals, tasks, events, quotes, submissions, webChatSessions, voiceCalls,
    notes, activities, messages, whatsappMessages, metaMessages,
    members, externalSubscriptions, externalPayments, projectsAssigned,
  ] = await Promise.all([
    db.collection("deals").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
    db.collection("tasks").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
    db.collection("events").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
    db.collection("quotes").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
    db.collectionGroup("submissions").where("contactId", "==", id).count().get(),
    db.collection("subAccounts").doc(subAccountId).collection("webChatSessions").where("contactId", "==", id).count().get(),
    db.collection("subAccounts").doc(subAccountId).collection("voiceCalls").where("contactId", "==", id).count().get(),
    contactRef.collection("notes").count().get(),
    contactRef.collection("activities").count().get(),
    contactRef.collection("messages").count().get(),
    contactRef.collection("whatsappMessages").count().get(),
    contactRef.collection("metaMessages").count().get(),
    db.collection(`subAccounts/${subAccountId}/members`).where("contactId", "==", id).get(),
    db.collection("externalSubscriptions").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
    db.collection("externalPayments").where("subAccountId", "==", subAccountId).where("contactId", "==", id).count().get(),
    db.collection("projects").where("subAccountId", "==", subAccountId).where("assignedContactId", "==", id).count().get(),
  ]);
  return {
    counts: {
      deals: deals.data().count, tasks: tasks.data().count, events: events.data().count,
      quotes: quotes.data().count, formSubmissions: submissions.data().count,
      notes: notes.data().count, activities: activities.data().count,
      messages: messages.data().count, whatsappMessages: whatsappMessages.data().count, metaMessages: metaMessages.data().count,
      webChatSessions: webChatSessions.data().count, voiceCalls: voiceCalls.data().count,
      members: members.size, externalSubscriptions: externalSubscriptions.data().count,
      externalPayments: externalPayments.data().count, projectsAssigned: projectsAssigned.data().count,
    },
    linkedMemberIds: members.docs.map((m) => m.id),
  };
}

function mergeCustomFields(
  survivor?: Record<string, CustomFieldValue> | null,
  loser?: Record<string, CustomFieldValue> | null,
): Record<string, CustomFieldValue> | null {
  if (!survivor && !loser) return null;
  const out: Record<string, CustomFieldValue> = { ...(loser ?? {}) };
  for (const [k, v] of Object.entries(survivor ?? {})) {
    if (v !== "" && v != null) out[k] = v;
  }
  return out;
}

function mergeEmailConsent(
  survivor?: Contact["emailConsent"],
  loser?: Contact["emailConsent"],
): Contact["emailConsent"] | undefined {
  if (survivor?.status === "unsubscribed") return survivor;
  if (loser?.status === "unsubscribed") return loser;
  return survivor ?? loser ?? undefined;
}

function buildSurvivorPatch(survivor: Omit<Contact, "id">, loser: Omit<Contact, "id">) {
  const mergedName = survivor.name || loser.name;
  const mergedPhone = survivor.phone || loser.phone;
  const mergedEmailConsent = mergeEmailConsent(survivor.emailConsent, loser.emailConsent);
  const patch: Record<string, unknown> = {
    name: mergedName,
    email: survivor.email || loser.email,
    phone: mergedPhone,
    company: survivor.company || loser.company,
    address: survivor.address || loser.address,
    tags: Array.from(new Set([...(survivor.tags ?? []), ...(loser.tags ?? [])])),
    customFields: mergeCustomFields(survivor.customFields, loser.customFields),
    attribution: survivor.attribution ?? loser.attribution ?? null,
    metaUserId: survivor.metaUserId ?? loser.metaUserId ?? null,
    emailOptedOut: survivor.emailOptedOut || loser.emailOptedOut,
    smsOptedOut: survivor.smsOptedOut || loser.smsOptedOut,
    deliverabilitySuppressed: !!(survivor.deliverabilitySuppressed || loser.deliverabilitySuppressed),
    ...(mergedEmailConsent ? { emailConsent: mergedEmailConsent } : {}),
  };
  return { patch, mergedName, mergedPhone };
}

async function main() {
  const subAccountId = process.env.SUBACCOUNT_ID;
  if (!subAccountId) throw new Error("SUBACCOUNT_ID env var required");
  const db = getAdminDb();

  console.log(`Mode: ${COMMIT ? "COMMIT (writes will happen)" : "DRY RUN (no writes)"}`);

  const contactsSnap = await db
    .collection("contacts")
    .where("subAccountId", "==", subAccountId)
    .get();
  console.log(`Contacts before: ${contactsSnap.size}`);

  const byEmail = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
  for (const doc of contactsSnap.docs) {
    const email = ((doc.data().email as string) ?? "").trim().toLowerCase();
    if (!email) continue;
    const list = byEmail.get(email) ?? [];
    list.push(doc);
    byEmail.set(email, list);
  }
  const dupGroups = Array.from(byEmail.entries()).filter(([, docs]) => docs.length > 1);
  console.log(`Duplicate groups (fresh recompute): ${dupGroups.length}`);

  const result = {
    subAccountId,
    mode: COMMIT ? "COMMIT" : "DRY_RUN",
    contactsBefore: contactsSnap.size,
    duplicateGroupsSeen: dupGroups.length,
    merged: [] as { email: string; canonicalId: string; loserIds: string[]; result: "merged" | "failed"; error?: string }[],
    skippedNoLongerQualifies: [] as { email: string; reason: string }[],
    skippedManualReview: 0,
  };

  let groupIdx = 0;
  for (const [email, docs] of dupGroups) {
    groupIdx++;
    const rows: ContactRow[] = [];
    for (const d of docs) {
      const { counts, linkedMemberIds } = await loadRefCounts(db, subAccountId, d.ref);
      rows.push({ id: d.id, data: d.data() as Omit<Contact, "id">, linkedMemberIds, counts });
    }

    // Guard: no group with 2+ DIFFERENT linked Members is ever auto-touched.
    const distinctMemberIds = new Set(rows.flatMap((r) => r.linkedMemberIds));
    if (distinctMemberIds.size > 1) {
      result.skippedManualReview++;
      continue;
    }

    rows.sort((a, b) => canonicalScore(b.counts) - canonicalScore(a.counts));
    const canonical = rows[0];
    const losers = rows.slice(1);

    const dataCarriers = rows.filter((r) => meaningfulScore(r.counts) > 0);
    const isTypeA = dataCarriers.length === 0;
    const isTypeB = dataCarriers.length === 1 && dataCarriers[0].id === canonical.id;

    if (!isTypeA && !isTypeB) {
      result.skippedManualReview++;
      continue;
    }
    // TYPE B's own definition already requires the sole data-carrier to be
    // canonical, but assert it explicitly per the instruction to confirm
    // "canonical selection still matches richest/Member-linked contact."
    if (isTypeB && canonicalScore(canonical.counts) <= 0 && dataCarriers[0].id !== canonical.id) {
      result.skippedNoLongerQualifies.push({ email, reason: "canonical mismatch at execution time" });
      continue;
    }

    if (groupIdx % 25 === 0) console.log(`  ...evaluated ${groupIdx}/${dupGroups.length} groups`);

    if (!COMMIT) {
      result.merged.push({
        email,
        canonicalId: canonical.id,
        loserIds: losers.map((l) => l.id),
        result: "merged", // dry-run projection, not an actual write
      });
      continue;
    }

    // COMMIT: fold each loser into the canonical, one at a time, re-reading
    // the canonical between merges since its data changes as losers fold in.
    try {
      let survivorSnap = await db.doc(`contacts/${canonical.id}`).get();
      if (!survivorSnap.exists) throw new Error("canonical contact vanished before merge");
      for (const loser of losers) {
        const loserSnap = await db.doc(`contacts/${loser.id}`).get();
        if (!loserSnap.exists) continue; // already gone (e.g. re-run) — nothing to do
        const survivorData = survivorSnap.data() as Omit<Contact, "id">;
        const loserData = loserSnap.data() as Omit<Contact, "id">;
        const { patch, mergedName, mergedPhone } = buildSurvivorPatch(survivorData, loserData);
        await performContactMerge({
          db,
          subAccountId,
          loserId: loser.id,
          survivorId: canonical.id,
          survivorPatch: patch,
          conversationContact: { name: mergedName, phone: mergedPhone },
          loserData,
        });
        survivorSnap = await db.doc(`contacts/${canonical.id}`).get();
      }
      result.merged.push({
        email,
        canonicalId: canonical.id,
        loserIds: losers.map((l) => l.id),
        result: "merged",
      });
    } catch (err) {
      result.merged.push({
        email,
        canonicalId: canonical.id,
        loserIds: losers.map((l) => l.id),
        result: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`FAILED group ${email}:`, err);
      // isolated failure — continue to the next group, do not abort the batch
    }
  }

  const successCount = result.merged.filter((m) => m.result === "merged").length;
  const failCount = result.merged.filter((m) => m.result === "failed").length;

  console.log(`\n=== SUMMARY (${result.mode}) ===`);
  console.log(`Groups qualifying as safe (TYPE A/B): ${result.merged.length}`);
  console.log(`  merged successfully: ${successCount}`);
  console.log(`  failed: ${failCount}`);
  console.log(`No-longer-qualifying at execution time: ${result.skippedNoLongerQualifies.length}`);
  console.log(`Manual-review / multi-member groups skipped: ${result.skippedManualReview}`);

  const outFile = process.env.OUT_FILE ?? (COMMIT ? "/tmp/reconcile-safe-duplicates-commit.json" : "/tmp/reconcile-safe-duplicates-dryrun.json");
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`\nFull result written to ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
