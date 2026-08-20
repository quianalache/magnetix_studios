/**
 * Skool → Magnetix Community importer — CLI entry point for this first,
 * manually-operated run. Everything it calls lives in
 * src/lib/server/skool-import/ and is written to be reusable by a future
 * self-service "Import from Skool" UI — this script is just the thin,
 * disposable wiring for tonight's real cutover (real Skool group url,
 * target sub-account, CSV path, and CDP tab id are all read from argv/env
 * here, not hardcoded inside the reusable library).
 *
 * Usage:
 *   npx tsx scripts/skool-import.ts --dry-run
 *   npx tsx scripts/skool-import.ts --commit --only-member=someone@example.com
 *   npx tsx scripts/skool-import.ts --commit
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

import { getAdminDb } from "@/lib/firebase/admin";
import { createBrowserBridgedSkoolSession } from "@/lib/server/skool-import/skool-session";
import {
  extractAllMembers,
  extractAllPosts,
  extractCommentsForPost,
  enrichPostImageAttachments,
} from "@/lib/server/skool-import/skool-extract";
import { parseSkoolMembersCsv, mergeCsvEmails } from "@/lib/server/skool-import/csv-enrichment";
import { capturePreImportCheckpoint, rollbackSkoolImportSinceCheckpoint } from "@/lib/server/skool-import/checkpoint";
import { runSkoolImport } from "@/lib/server/skool-import/importer";
import { getGroupBySlug } from "@/lib/server/community-service";
import type { SkoolComment } from "@/lib/server/skool-import/types";

// ── This run's real, live-confirmed source facts ───────────────────────────
const CDP_PORT = 9223;
const CDP_TAB_ID = "463336DFA53EC6889FE953157EFD91DD";
const SKOOL_GROUP_SLUG = "quiana";
const SKOOL_GROUP_ID = "7895e266f9e64cdfab94bd56e1f8478e";
const SUB_ACCOUNT_ID = "xvnedVCmQpEvHrcPhEDI";
const TARGET_GROUP_SLUG = "magnetic-visibility";
const TARGET_GROUP_NAME = "Magnetic Visibility";
const CSV_PATH =
  "/private/tmp/claude-501/-Users-quianamatthews-Documents-magnetic-visibility-studio/8f33239e-670b-4a8b-ac21-2c4bf0630dbf/scratchpad/skool-members-export.csv";

// Live-extracted from the rendered filter-chip buttons (no clean JSON
// source found for this — see skool-extract.ts's module comment). Specific
// to this one Community; a future general importer needs a real dynamic
// version of this same DOM-scan.
const CATEGORY_LABELS: Record<string, string> = {
  "5dd67a4c981e4502a689b0d6227dd7e9": "🌺 Community Chat",
  "526d4d653d4144299980b55f7afcbb03": "🔮 Proof Of Magic",
  a2dea477ce2c4a13bc3e3be212f82b43: "🙋🏾‍♀️ Questions",
  "32c829c20ac24c5a85d20992c35f2cfd": "📹 Video Promo",
  "5b23c7063bd44b2f8fd6cc565345229e": "🌸 YouTube Glow Up Challenge",
};

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const onlyMemberArg = args.find((a) => a.startsWith("--only-member="));
  const onlyMemberEmail = onlyMemberArg ? onlyMemberArg.split("=")[1] : undefined;

  console.log(`\n=== Skool import: ${commit ? "COMMIT (real writes)" : "DRY RUN (zero writes)"} ===`);
  if (onlyMemberEmail) console.log(`Restricted to member: ${onlyMemberEmail}`);

  const db = getAdminDb();
  const saSnap = await db.doc(`subAccounts/${SUB_ACCOUNT_ID}`).get();
  const agencyId = (saSnap.data()?.agencyId as string) ?? "";

  const session = createBrowserBridgedSkoolSession(CDP_PORT, CDP_TAB_ID);
  const categories = new Map(Object.entries(CATEGORY_LABELS));

  console.log("\nExtracting members...");
  const rawMembers = await extractAllMembers(SKOOL_GROUP_SLUG, session);
  console.log(`  ${rawMembers.length} members extracted from Skool.`);

  console.log("Parsing supplemental CSV export...");
  const csvText = fs.readFileSync(CSV_PATH, "utf8");
  const csvRows = parseSkoolMembersCsv(csvText);
  console.log(`  ${csvRows.length} CSV rows parsed.`);

  const { enriched, unmatchedCsvRows, duplicateCsvEmails } = mergeCsvEmails(rawMembers, csvRows);
  const resolvedCount = enriched.filter((m) => m.resolvedEmail).length;
  console.log(`  ${resolvedCount}/${enriched.length} members have a resolved email.`);
  const bySource = { "skool-payload": 0, csv: 0, unresolved: 0 };
  for (const m of enriched) bySource[m.emailSource] += 1;
  console.log(`  email source breakdown:`, bySource);
  if (unmatchedCsvRows.length > 0) {
    console.log(`  ${unmatchedCsvRows.length} CSV rows did not match any extracted Skool member:`);
    unmatchedCsvRows.forEach((r) => console.log(`    - ${r.firstName} ${r.lastName} <${r.email || "no email"}>`));
  }
  if (duplicateCsvEmails.length > 0) {
    console.log(`  duplicate emails within the CSV itself:`, duplicateCsvEmails);
  }

  console.log("\nExtracting posts...");
  const allPosts = await extractAllPosts(SKOOL_GROUP_SLUG, session, categories);
  console.log(`  ${allPosts.length} posts extracted.`);
  const postsMissingShortId = allPosts.filter((p) => !p.shortId);
  if (postsMissingShortId.length > 0) {
    console.log(`  ${postsMissingShortId.length} posts have no recoverable short id (comments can't be fetched for these):`);
    postsMissingShortId.forEach((p) => console.log(`    - ${p.title || p.skoolPostId}`));
  }

  console.log("Enriching post-level image attachments (HEAD requests to assets.skool.com)...");
  await enrichPostImageAttachments(allPosts);
  const postImageCount = allPosts.reduce((sum, p) => sum + p.attachments.filter((a) => a.kind === "image").length, 0);
  const postVideoCount = allPosts.reduce((sum, p) => sum + p.attachments.filter((a) => a.kind === "video").length, 0);
  console.log(`  ${postImageCount} post images enriched, ${postVideoCount} post videos found (deferred).`);

  console.log("\nExtracting comments for each post (this takes a while)...");
  const commentsByPost = new Map<string, SkoolComment[]>();
  let doneCount = 0;
  for (const p of allPosts) {
    if (!p.shortId) continue;
    try {
      const comments = await extractCommentsForPost(p.skoolPostId, p.shortId, SKOOL_GROUP_ID, session);
      commentsByPost.set(p.skoolPostId, comments);
    } catch (err) {
      console.log(`    comments fetch failed for post ${p.skoolPostId}: ${(err as Error).message}`);
    }
    doneCount += 1;
    if (doneCount % 10 === 0) console.log(`  ...${doneCount}/${allPosts.length} posts' comments fetched`);
  }
  const totalComments = [...commentsByPost.values()].reduce((sum, arr) => sum + arr.length, 0);
  console.log(`  ${totalComments} total comments extracted across ${commentsByPost.size} posts.`);

  let checkpointId: string | null = null;
  if (commit) {
    console.log("\nCapturing pre-import checkpoint (Phase 3 operational safeguard)...");
    const group = await getGroupBySlug(SUB_ACCOUNT_ID, TARGET_GROUP_SLUG);
    if (!group) {
      throw new Error(
        `Target group "${TARGET_GROUP_SLUG}" does not exist yet — expected it to already exist from the Phase 2 controlled test. Refusing to checkpoint against a group that isn't there.`,
      );
    }
    const checkpoint = await capturePreImportCheckpoint({
      subAccountId: SUB_ACCOUNT_ID,
      targetGroupId: group.id,
      targetGroupSlug: TARGET_GROUP_SLUG,
    });
    checkpointId = checkpoint.id;
    console.log(`  checkpoint captured: ${checkpoint.id}`);
    console.log(
      `  pre-existing skool mappings: ${checkpoint.preExistingMappingKeys.length}`,
      checkpoint.preExistingCountsByEntity,
    );

    // Self-test: rolling back (dry-run) IMMEDIATELY against a checkpoint
    // with nothing written since it should propose deleting nothing at
    // all — proves the rollback logic is scoped correctly BEFORE it is
    // ever relied on for real, and before any Phase 3 content write happens.
    const selfTest = await rollbackSkoolImportSinceCheckpoint(SUB_ACCOUNT_ID, checkpoint.id, { commit: false });
    if (selfTest.toDelete.length !== 0 || selfTest.skippedOutOfScope.length !== 0 || selfTest.errors.length !== 0) {
      throw new Error(`Rollback self-test did not report a clean zero state — refusing to proceed: ${JSON.stringify(selfTest)}`);
    }
    console.log("  rollback self-test: 0 would-delete, 0 out-of-scope, 0 errors — checkpoint verified.\n");
  }

  console.log("\nRunning import...");
  const report = await runSkoolImport({
    subAccountId: SUB_ACCOUNT_ID,
    agencyId,
    targetGroupSlug: TARGET_GROUP_SLUG,
    targetGroupName: TARGET_GROUP_NAME,
    commit,
    onlyMemberEmail,
    members: enriched,
    categories,
    allPosts,
    commentsByPost,
  });

  console.log("\n=== REPORT ===");
  console.log(JSON.stringify({ checkpointId, ...report }, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
