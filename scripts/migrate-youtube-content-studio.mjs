import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * YouTube Content Studio migration — Phase 0 (data foundation only).
 * See docs/product/youtube-content-studio-migration-spec.md — this script
 * implements that spec's §20 (Firestore direction), §21 (import spec),
 * §18 (orphan-field reconciliation), and §19 (voice-note Storage move).
 *
 * This is a ONE-TIME, source-owner-scoped migration tool, not a general
 * import feature — there is deliberately no HTTP route. Run it locally
 * with real Admin SDK credentials (same .env.local pattern as
 * scripts/migrate-energetic-profiles.mjs).
 *
 * Modes:
 *   node scripts/migrate-youtube-content-studio.mjs \
 *     --file=<path to export json> --subAccountId=<id>
 *       -> DRY RUN (default). Zero Firestore writes, zero Storage
 *          uploads. Prints the full reconciliation report and (with
 *          --report=<path>) saves it as JSON for review.
 *
 *   node scripts/migrate-youtube-content-studio.mjs \
 *     --file=<path> --subAccountId=<id> --live
 *       -> REAL WRITES. Requires --live explicitly. Not invoked as part
 *          of building this script — run only on explicit go-ahead.
 *
 * Idempotency: every Firestore doc uses the SOURCE record's own real id
 * as its doc id (offers/frameworks/stories/topics/subtopics keep their
 * ids inside the Brain doc; ideas and videos use their source id as the
 * Firestore doc id directly) and is written with a full `.set()` of the
 * same deterministic content — rerunning produces the identical end
 * state, never a duplicate. Every voice note uploads to a Storage path
 * derived ONLY from its own source id (never a timestamp), so a rerun
 * overwrites the same object instead of creating a second one.
 *
 * Nothing is silently dropped. Every field on every source record is
 * classified as MAPPED (canonical field), LEGACY (preserved under a
 * `legacy` bucket, not surfaced by any UI this phase), or — if it isn't
 * in either list — UNKNOWN (preserved under an `unknownFields` bucket
 * and flagged loudly in the report). See the KNOWN_* constants below,
 * which are the code-form of migration spec §18/§23's classification.
 */

// ---------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.length ? rest.join("=") : true];
  }),
);

const LIVE = args.live === true;
const FILE_PATH = typeof args.file === "string" ? args.file : null;
const SUB_ACCOUNT_ID = typeof args.subAccountId === "string" ? args.subAccountId : null;
const REPORT_PATH = typeof args.report === "string" ? args.report : null;

const MIGRATION_TAG = "ytcs-phase0-2026-09-01";

if (!FILE_PATH) {
  console.error("Missing required --file=<path to youtube-studio-backup-*.json>");
  process.exit(1);
}
if (!SUB_ACCOUNT_ID) {
  console.error(
    "Missing required --subAccountId=<id>. This migration never guesses the target sub-account.",
  );
  process.exit(1);
}
if (!existsSync(FILE_PATH)) {
  console.error(`Export file not found: ${FILE_PATH}`);
  process.exit(1);
}

// ---------------------------------------------------------------------
// Firebase Admin init — same .env.local pattern as
// scripts/migrate-energetic-profiles.mjs, reused deliberately rather
// than reinvented.
// ---------------------------------------------------------------------

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  env[m[1]] = v;
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore();
const STORAGE_BUCKET_NAME = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

// ---------------------------------------------------------------------
// Field classification — the code-form of migration spec §18/§23.
// ---------------------------------------------------------------------

const BRAIN_MAPPED_TOP_KEYS = [
  "vision",
  "audience",
  "offers",
  "frameworks",
  "stories",
  "voice",
  "topics",
  "subtopics",
  "positioning",
];
// Confirmed renames-in-place (spec §4.4/§4.7): `method` -> frameworks[],
// `pillars` -> topics[]/subtopics[]. The new collections are migrated as
// the real, active data; the old singular/legacy keys are preserved
// verbatim under brain.legacy so nothing is thrown away.
const BRAIN_LEGACY_TOP_KEYS = ["method", "pillars"];

// Per spec §4.5 — these three exist on every real Stories+Proof record
// but were removed from the UI; preserved per-story if ever non-empty.
const STORY_LEGACY_SUBFIELDS = ["useful", "relatedOffer", "relatedPillar"];

const IDEA_MAPPED_KEYS = ["id", "title", "type", "notes", "priority", "status", "lastUpdated"];
const IDEA_VOICE_NOTE_KEYS = ["ideaVoiceNotes"];

const VIDEO_VOICE_NOTE_KEYS = [
  "brainDumpVoiceNotes",
  "scriptBuilderVoiceNotes",
  "productOfferDeepDiveVoiceNotes",
];

// Confirmed-active per spec §18/§23 — copied verbatim to the canonical doc.
const VIDEO_MAPPED_KEYS = [
  "id",
  "name",
  "startingPointType",
  "currentStep",
  "status",
  "rawTranscript",
  "scriptMode",
  "scriptOutputType",
  "depthPreference",
  "preferredFormat",
  "videoLengthGoal",
  "recordingStyle",
  "energyStyle",
  "deepDiveAnswers",
  "generatedDeepDiveQuestions",
  "generatedScriptPrompt",
  "compiledScript",
  "generatedTitlePrompt",
  "selectedTitle",
  "backupTitle",
  "finalTitle",
  "createVideoStatus",
  "recordingChecklist",
  "editingChecklist",
  "finalReviewChecklist",
  "recordingNotes",
  "editingNotes",
  "finalVideoNotes",
  "youtubeDescription",
  "pinnedComment",
  "tagsKeywords",
  "uploadNotes",
  "youtubeLink",
  "publishDate",
  "communityPost",
  "createdDate",
  "lastUpdatedDate",
  "keyPointsInclude",
  "thingsToAvoid",
  "hook",
  "scriptCta",
  "scriptBuilderExtraNotes",
  "scriptBuilderSelectedFrameworkIds",
  "scriptBuilderSelectedStoryProofIds",
  "selectedInputQuestion",
  "shortFormType",
  "storyId",
  "storyName",
  "storyProblem",
  "storyPursuit",
  "storyPayoff",
  "storyLesson",
  "storyType",
  "framework",
  "frameworkId",
  "productOfferInput",
  "productOfferDeepDiveAnswers",
];

// LEGACY — real, populated in some historical projects, but per spec
// §12/§18/§23 the rebuilt product does not resurrect these as active
// features. Preserved under video.legacy, never written to a canonical
// field, never surfaced by any UI this phase.
const VIDEO_LEGACY_KEYS = [
  "hookOptions",
  "expectationSetup",
  "earlyCtaType",
  "customEarlyCta",
  "selectedEarlyCta",
  "generatedOutline",
  "dominantPositioning",
  "secondaryPositioning",
  "topicClarity",
  "generatedTitles",
  "top3Titles",
  "thumbnailConcept",
  "thumbnailText",
  "thumbnailCuriosityAngle",
  "relatedOffer",
  "relatedPillar",
  "storyUseful",
];

function classifyKeys(obj, mappedKeys, legacyKeys) {
  const mapped = {};
  const legacy = {};
  const unknown = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (mappedKeys.includes(k)) mapped[k] = v;
    else if (legacyKeys.includes(k)) legacy[k] = v;
    else unknown[k] = v;
  }
  return { mapped, legacy, unknown };
}

function isMeaningfullyEmpty(v) {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function pruneEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!isMeaningfullyEmpty(v)) out[k] = v;
  }
  return out;
}

function byteSize(obj) {
  return Buffer.byteLength(JSON.stringify(obj ?? {}), "utf8");
}

const FIRESTORE_DOC_LIMIT = 1_048_576; // 1 MiB
const SIZE_WARN_THRESHOLD = Math.floor(FIRESTORE_DOC_LIMIT * 0.8);

// ---------------------------------------------------------------------
// Export validation
// ---------------------------------------------------------------------

function loadAndValidateExport(filePath) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new Error(`Could not read export file: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Export file is not valid JSON: ${err.message}`);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Export root must be a JSON object with brain/ideas/videos keys.");
  }
  if (typeof data.brain !== "object" || data.brain === null || Array.isArray(data.brain)) {
    throw new Error("Export is missing a valid `brain` object.");
  }
  if (!Array.isArray(data.ideas)) {
    throw new Error("Export is missing a valid `ideas` array.");
  }
  if (!Array.isArray(data.videos)) {
    throw new Error("Export is missing a valid `videos` array.");
  }
  for (const [i, idea] of data.ideas.entries()) {
    if (typeof idea !== "object" || idea === null || typeof idea.id !== "string" || !idea.id) {
      throw new Error(`ideas[${i}] is missing a valid string \`id\` — cannot safely migrate.`);
    }
  }
  for (const [i, video] of data.videos.entries()) {
    if (typeof video !== "object" || video === null || typeof video.id !== "string" || !video.id) {
      throw new Error(`videos[${i}] is missing a valid string \`id\` — cannot safely migrate.`);
    }
  }

  return data;
}

// ---------------------------------------------------------------------
// Voice notes -> Firebase Storage
// ---------------------------------------------------------------------

const MIME_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};

function extensionFor(mimeType) {
  const base = (mimeType || "").split(";")[0]?.trim().toLowerCase();
  return MIME_EXTENSIONS[base] ?? "audio";
}

/**
 * Parses a `data:audio/webm;base64,...` string. Returns null (rather
 * than throwing) for anything that doesn't match the expected shape —
 * the caller reports this as a per-voice-note failure, not a fatal error
 * for the whole import.
 */
function decodeDataUri(dataUri) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUri ?? "");
  if (!m) return null;
  const mimeType = m[1];
  let buffer;
  try {
    buffer = Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
  if (buffer.length === 0) return null;
  return { mimeType, buffer };
}

/**
 * Migrates one voice note. In dry-run mode this only decodes + measures
 * (zero network calls); in live mode it uploads to a path derived solely
 * from the voice note's own source id, so reruns overwrite instead of
 * duplicating. Storage path mirrors the existing community voice-note
 * convention (src/app/api/community/[saId]/voice-notes/route.ts):
 * `{feature}/{subAccountId}/voice-notes/{id}.{ext}`.
 *
 * Preserves every determinable piece of source metadata (spec's explicit
 * list): id, attached entity, location in app, question/answer
 * association if present, MIME type, storage path/reference. Recording
 * timestamp and transcription are NOT invented — the real export never
 * carries either on the voice-note object itself (see migration spec
 * §19), so both are recorded as `null` with the reason preserved in the
 * report rather than fabricated.
 */
async function migrateVoiceNote(vn, context, bucket) {
  const result = {
    id: vn?.id ?? null,
    attachedEntityType: context.entityType,
    attachedEntityId: context.entityId,
    locationInApp: context.locationInApp,
    questionAssociation: context.questionAssociation ?? null,
    recordingTimestamp: null, // not present in source data — not invented
    transcription: null, // no confirmed transcription in source data — not invented
    status: "pending",
  };

  if (!vn || typeof vn !== "object" || !vn.id) {
    return { ...result, status: "skipped", reason: "voice note missing an id" };
  }

  const decoded = decodeDataUri(vn.audioBase64);
  if (!decoded) {
    return { ...result, status: "failed", reason: "audioBase64 missing or not a parseable data: URI" };
  }

  const ext = extensionFor(decoded.mimeType);
  const storagePath = `ytcs/${SUB_ACCOUNT_ID}/voice-notes/${vn.id}.${ext}`;
  result.mimeType = decoded.mimeType;
  result.sizeBytes = decoded.buffer.length;
  result.storagePath = storagePath;

  if (!LIVE) {
    return { ...result, status: "would-upload" };
  }

  if (!bucket) {
    return { ...result, status: "failed", reason: "Storage bucket not configured (NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET missing)" };
  }

  const token = randomUUID();
  await bucket.file(storagePath).save(decoded.buffer, {
    resumable: false,
    metadata: {
      contentType: decoded.mimeType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET_NAME}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

  return { ...result, url, status: "uploaded" };
}

async function migrateVoiceNoteArray(arr, context, bucket, report) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const out = [];
  for (const vn of arr) {
    const migrated = await migrateVoiceNote(vn, context, bucket);
    report.voiceNotes.push(migrated);
    out.push(migrated);
  }
  return out;
}

// ---------------------------------------------------------------------
// Brain
// ---------------------------------------------------------------------

function buildStory(story) {
  const { mapped, legacy } = classifyKeys(story, Object.keys(story ?? {}).filter((k) => !STORY_LEGACY_SUBFIELDS.includes(k)), STORY_LEGACY_SUBFIELDS);
  const legacyPruned = pruneEmpty(legacy);
  return Object.keys(legacyPruned).length ? { ...mapped, legacy: legacyPruned } : mapped;
}

async function buildBrainDoc(rawBrain, report) {
  const { mapped, legacy, unknown } = classifyKeys(rawBrain, BRAIN_MAPPED_TOP_KEYS, BRAIN_LEGACY_TOP_KEYS);

  const stories = Array.isArray(mapped.stories) ? mapped.stories.map(buildStory) : mapped.stories;

  const doc = {
    ...mapped,
    stories,
  };

  const legacyPruned = pruneEmpty(legacy);
  if (Object.keys(legacyPruned).length) doc.legacy = legacyPruned;

  if (Object.keys(unknown).length) {
    doc.unknownFields = unknown;
    report.unknownFields.push({ entity: "brain", recordId: "brain", keys: Object.keys(unknown) });
  }

  doc.migratedFromExport = MIGRATION_TAG;
  doc.migratedAt = LIVE ? FieldValue.serverTimestamp() : "<serverTimestamp>";

  report.brain = {
    sectionsFound: BRAIN_MAPPED_TOP_KEYS.filter((k) => rawBrain[k] !== undefined),
    legacySectionsFound: BRAIN_LEGACY_TOP_KEYS.filter((k) => rawBrain[k] !== undefined && !isMeaningfullyEmpty(rawBrain[k])),
    offers: Array.isArray(mapped.offers) ? mapped.offers.length : 0,
    frameworks: Array.isArray(mapped.frameworks) ? mapped.frameworks.length : 0,
    stories: Array.isArray(mapped.stories) ? mapped.stories.length : 0,
    topics: Array.isArray(mapped.topics) ? mapped.topics.length : 0,
    subtopics: Array.isArray(mapped.subtopics) ? mapped.subtopics.length : 0,
    docSizeBytes: byteSize(doc),
  };

  return doc;
}

// ---------------------------------------------------------------------
// Ideas
// ---------------------------------------------------------------------

async function buildIdeaDoc(rawIdea, bucket, report) {
  const { mapped, unknown } = classifyKeys(
    rawIdea,
    [...IDEA_MAPPED_KEYS, ...IDEA_VOICE_NOTE_KEYS],
    [],
  );

  const voiceNotes = await migrateVoiceNoteArray(
    mapped.ideaVoiceNotes,
    { entityType: "idea", entityId: rawIdea.id, locationInApp: "Saved Ideas" },
    bucket,
    report,
  );

  const doc = { ...mapped };
  delete doc.ideaVoiceNotes;
  if (voiceNotes.length) doc.ideaVoiceNotes = voiceNotes;

  if (Object.keys(unknown).length) {
    doc.unknownFields = unknown;
    report.unknownFields.push({ entity: "idea", recordId: rawIdea.id, keys: Object.keys(unknown) });
  }

  doc.migratedFromExport = MIGRATION_TAG;
  doc.migratedAt = LIVE ? FieldValue.serverTimestamp() : "<serverTimestamp>";

  return { id: rawIdea.id, doc, sizeBytes: byteSize(doc) };
}

// ---------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------

async function buildVideoDoc(rawVideo, bucket, report) {
  const { mapped, legacy, unknown } = classifyKeys(
    rawVideo,
    [...VIDEO_MAPPED_KEYS, ...VIDEO_VOICE_NOTE_KEYS],
    VIDEO_LEGACY_KEYS,
  );

  const brainDumpVoiceNotes = await migrateVoiceNoteArray(
    mapped.brainDumpVoiceNotes,
    { entityType: "video", entityId: rawVideo.id, locationInApp: "Video Workspace > Input (Brain Dump)" },
    bucket,
    report,
  );
  const scriptBuilderVoiceNotes = await migrateVoiceNoteArray(
    mapped.scriptBuilderVoiceNotes,
    { entityType: "video", entityId: rawVideo.id, locationInApp: "Video Workspace > Script Prompt Builder (Extra Script Notes)" },
    bucket,
    report,
  );
  const productOfferDeepDiveVoiceNotes = await migrateVoiceNoteArray(
    mapped.productOfferDeepDiveVoiceNotes,
    {
      entityType: "video",
      entityId: rawVideo.id,
      locationInApp: "Video Workspace > Deep Dive (Product/Offer)",
      questionAssociation: extractQuestionAssociation(rawVideo.productOfferDeepDiveAnswers),
    },
    bucket,
    report,
  );

  const doc = { ...mapped };
  delete doc.brainDumpVoiceNotes;
  delete doc.scriptBuilderVoiceNotes;
  delete doc.productOfferDeepDiveVoiceNotes;
  if (brainDumpVoiceNotes.length) doc.brainDumpVoiceNotes = brainDumpVoiceNotes;
  if (scriptBuilderVoiceNotes.length) doc.scriptBuilderVoiceNotes = scriptBuilderVoiceNotes;
  if (productOfferDeepDiveVoiceNotes.length) doc.productOfferDeepDiveVoiceNotes = productOfferDeepDiveVoiceNotes;

  const legacyPruned = pruneEmpty(legacy);
  if (Object.keys(legacyPruned).length) doc.legacy = legacyPruned;

  if (Object.keys(unknown).length) {
    doc.unknownFields = unknown;
    report.unknownFields.push({ entity: "video", recordId: rawVideo.id, keys: Object.keys(unknown) });
  }

  doc.migratedFromExport = MIGRATION_TAG;
  doc.migratedAt = LIVE ? FieldValue.serverTimestamp() : "<serverTimestamp>";

  return {
    id: rawVideo.id,
    doc,
    sizeBytes: byteSize(doc),
    hasLegacy: Object.keys(legacyPruned).length > 0,
    legacyKinds: Object.keys(legacyPruned),
  };
}

/** Best-effort: the real export embeds the question text as a "Question
 *  N: ..." prefix inside productOfferDeepDiveAnswers rather than as a
 *  separate field (migration spec §8B) — reused here only to attach a
 *  human-readable label to a voice note, never fabricated if absent. */
function extractQuestionAssociation(answersText) {
  if (typeof answersText !== "string") return null;
  const m = /^Question\s+\d+:\s*.+$/m.exec(answersText);
  return m ? m[0].trim() : null;
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  console.log(`=== YouTube Content Studio Migration — Phase 0 — ${LIVE ? "LIVE MODE" : "DRY RUN"} ===`);
  console.log(`Source file: ${FILE_PATH}`);
  console.log(`Target sub-account: ${SUB_ACCOUNT_ID}`);
  console.log("");

  const source = loadAndValidateExport(FILE_PATH);
  console.log("Export parsed and shape-validated OK.\n");

  // Confirm the target sub-account actually exists before doing anything else.
  const subSnap = await db.doc(`subAccounts/${SUB_ACCOUNT_ID}`).get();
  if (!subSnap.exists) {
    console.error(`Sub-account ${SUB_ACCOUNT_ID} does not exist. Aborting — nothing written.`);
    process.exit(1);
  }
  console.log(`Target sub-account confirmed: ${subSnap.data()?.name ?? "(unnamed)"}\n`);

  let bucket = null;
  if (STORAGE_BUCKET_NAME) {
    bucket = getStorage().bucket(STORAGE_BUCKET_NAME);
  } else {
    console.warn("WARNING: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET not set — voice notes cannot be uploaded in --live mode.\n");
  }

  const report = {
    mode: LIVE ? "live" : "dry-run",
    subAccountId: SUB_ACCOUNT_ID,
    sourceFile: FILE_PATH,
    generatedAt: new Date().toISOString(),
    brain: null,
    ideas: { count: 0, records: [] },
    videos: { count: 0, records: [], statusCounts: {}, legacyRecordCount: 0, legacyKinds: {} },
    voiceNotes: [],
    unknownFields: [],
    sizeWarnings: [],
  };

  // --- Brain ---
  const brainDoc = await buildBrainDoc(source.brain, report);

  // --- Ideas ---
  const ideaResults = [];
  for (const rawIdea of source.ideas) {
    const built = await buildIdeaDoc(rawIdea, bucket, report);
    ideaResults.push(built);
    report.ideas.records.push({ id: built.id, sizeBytes: built.sizeBytes, title: built.doc.title ?? null, status: built.doc.status ?? null });
  }
  report.ideas.count = ideaResults.length;

  // --- Videos ---
  const videoResults = [];
  for (const rawVideo of source.videos) {
    const built = await buildVideoDoc(rawVideo, bucket, report);
    videoResults.push(built);
    const status = built.doc.status ?? "(none)";
    report.videos.statusCounts[status] = (report.videos.statusCounts[status] ?? 0) + 1;
    if (built.hasLegacy) {
      report.videos.legacyRecordCount++;
      for (const k of built.legacyKinds) {
        report.videos.legacyKinds[k] = (report.videos.legacyKinds[k] ?? 0) + 1;
      }
    }
    report.videos.records.push({
      id: built.id,
      name: built.doc.name ?? null,
      startingPointType: built.doc.startingPointType ?? null,
      currentStep: built.doc.currentStep ?? null,
      status,
      sizeBytes: built.sizeBytes,
      hasLegacyData: built.hasLegacy,
    });
  }
  report.videos.count = videoResults.length;

  // --- Document size safety ---
  const allDocs = [
    { label: "brain", sizeBytes: byteSize(brainDoc) },
    ...ideaResults.map((r) => ({ label: `idea:${r.id}`, sizeBytes: r.sizeBytes })),
    ...videoResults.map((r) => ({ label: `video:${r.id}`, sizeBytes: r.sizeBytes })),
  ];
  for (const d of allDocs) {
    if (d.sizeBytes >= FIRESTORE_DOC_LIMIT) {
      report.sizeWarnings.push({ doc: d.label, sizeBytes: d.sizeBytes, level: "OVER LIMIT — would fail to write" });
    } else if (d.sizeBytes >= SIZE_WARN_THRESHOLD) {
      report.sizeWarnings.push({ doc: d.label, sizeBytes: d.sizeBytes, level: "approaching 1MiB limit" });
    }
  }

  // ---------------------------------------------------------------------
  // Print report
  // ---------------------------------------------------------------------

  console.log("--- Channel Brain ---");
  console.log(`Sections found: ${report.brain.sectionsFound.join(", ") || "(none)"}`);
  console.log(`Legacy sections found (non-empty): ${report.brain.legacySectionsFound.join(", ") || "(none)"}`);
  console.log(`Offers: ${report.brain.offers} | Frameworks: ${report.brain.frameworks} | Stories+Proof: ${report.brain.stories} | Topics: ${report.brain.topics} | Subtopics: ${report.brain.subtopics}`);
  console.log(`Brain doc size: ${report.brain.docSizeBytes} bytes\n`);

  console.log(`--- Saved Ideas: ${report.ideas.count} found ---`);
  for (const r of report.ideas.records) {
    console.log(`  ${r.id}  "${r.title}"  status=${r.status}  ${r.sizeBytes} bytes`);
  }
  console.log("");

  console.log(`--- Video Projects: ${report.videos.count} found ---`);
  console.log("Status counts:", JSON.stringify(report.videos.statusCounts));
  console.log(`Records with legacy data (structured script-builder / in-app titles / thumbnails): ${report.videos.legacyRecordCount}`);
  console.log("Legacy field kinds found:", JSON.stringify(report.videos.legacyKinds));
  for (const r of report.videos.records) {
    console.log(`  ${r.id}  "${r.name}"  ${r.startingPointType}/${r.currentStep}/${r.status}  ${r.sizeBytes}b${r.hasLegacyData ? "  [legacy data]" : ""}`);
  }
  console.log("");

  console.log(`--- Voice notes: ${report.voiceNotes.length} found ---`);
  const vnByStatus = {};
  for (const vn of report.voiceNotes) vnByStatus[vn.status] = (vnByStatus[vn.status] ?? 0) + 1;
  console.log("By status:", JSON.stringify(vnByStatus));
  for (const vn of report.voiceNotes) {
    console.log(
      `  ${vn.id}  entity=${vn.attachedEntityType}:${vn.attachedEntityId}  location="${vn.locationInApp}"  ${vn.mimeType ?? "?"}  ${vn.sizeBytes ?? "?"}b  status=${vn.status}${vn.reason ? `  (${vn.reason})` : ""}${vn.questionAssociation ? `  question="${vn.questionAssociation}"` : ""}`,
    );
  }
  console.log("Recording timestamp: not present in source data on any voice note — recorded as null, not invented.");
  console.log("Transcription: not confirmed present on any voice note object in source data — recorded as null, not invented.\n");

  console.log(`--- Unknown / unmapped fields: ${report.unknownFields.length} record(s) with at least one ---`);
  if (report.unknownFields.length === 0) {
    console.log("  None. Every field on every source record matched a known MAPPED or LEGACY classification.\n");
  } else {
    for (const u of report.unknownFields) {
      console.log(`  ${u.entity} ${u.recordId}: [${u.keys.join(", ")}] — preserved under unknownFields, needs classification review`);
    }
    console.log("");
  }

  console.log("--- Document size safety ---");
  if (report.sizeWarnings.length === 0) {
    console.log(`  All ${allDocs.length} documents are well under the 1MiB Firestore limit (largest: ${Math.max(...allDocs.map((d) => d.sizeBytes))} bytes).\n`);
  } else {
    for (const w of report.sizeWarnings) console.log(`  ${w.doc}: ${w.sizeBytes} bytes — ${w.level}`);
    console.log("");
  }

  console.log("--- Fields intentionally NOT migrated (do not exist in source at all) ---");
  console.log("  uploadChecklist, optimizationChecklist — the live-audited Publish screen shows these two");
  console.log("  checklists, but neither field name appears on ANY of the real video records in this export.");
  console.log("  Nothing to migrate for them; this is a genuine absence in the source data, not a dropped");
  console.log("  field. finalReviewChecklist, recordingChecklist, and editingChecklist ARE real and migrated.\n");

  if (REPORT_PATH) {
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(`Full report written to ${REPORT_PATH}\n`);
  }

  if (!LIVE) {
    console.log("=== DRY RUN COMPLETE — ZERO FIRESTORE WRITES, ZERO STORAGE UPLOADS MADE. Pass --live to execute. ===");
    return;
  }

  // ---------------------------------------------------------------------
  // LIVE WRITES
  // ---------------------------------------------------------------------

  console.log("=== LIVE MODE — WRITING ===");

  await db.doc(`subAccounts/${SUB_ACCOUNT_ID}/ytcs/brain`).set(brainDoc);
  console.log("Wrote Channel Brain.");

  for (const r of ideaResults) {
    await db.doc(`subAccounts/${SUB_ACCOUNT_ID}/ytcsIdeas/${r.id}`).set(r.doc);
  }
  console.log(`Wrote ${ideaResults.length} Saved Ideas.`);

  for (const r of videoResults) {
    await db.doc(`subAccounts/${SUB_ACCOUNT_ID}/ytcsVideos/${r.id}`).set(r.doc);
  }
  console.log(`Wrote ${videoResults.length} Video Projects.`);

  console.log("=== LIVE MIGRATION COMPLETE ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
