/**
 * Unified Chart Designs (Batch 1: foundation + report snapshots) —
 * end-to-end checks. EMULATOR ONLY (Firestore + Auth, `demo-*` project, no
 * production credentials). Runs the REAL services, the real route handlers
 * through the consolidated Energetic Decoder dispatcher, the migration and
 * report-freeze runners, and the pure resolver/planner:
 *
 *   default-set creation (fresh workspace, concurrent first loads, legacy
 *   list endpoint), migration grouping (defaults, name groups, overflow,
 *   missing-system copies, profile mixes), dry run = zero writes, --expect
 *   gating, idempotency, blocked plans, rollback + deterministic re-run,
 *   appearance preserved for every Profile, resolver order (all 5 steps,
 *   tenant + ownership checks), set API permissions (admin-only writes,
 *   member reads, outsiders refused), independent editing (copies,
 *   duplicates), validation, default switching with mirrored flags, safe
 *   delete, Profile picker validation, legacy routes in migrated vs
 *   unmigrated workspaces, frozen report styling at generation, and
 *   historical-report compatibility + the freeze runner.
 *
 * Run:
 *   mkdir -p /tmp/emu && echo '{"firestore":{"rules":"<repo>/firestore.rules"},
 *     "emulators":{"auth":{"port":9099},"firestore":{"port":8080}}}' > /tmp/emu/firebase.json
 *   firebase emulators:exec --config /tmp/emu/firebase.json --only firestore,auth \
 *     --project demo-chart-designs \
 *     "NODE_OPTIONS='--require ./scripts/_chart-design-check-shim.cjs' pnpm exec tsx scripts/check-chart-design-sets.ts"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { viaDispatcher } from "./_via-dispatcher";
import type { ChartDesign, ChartDesignSystem } from "../src/types/chart-design";
import type { ChartDesignSet } from "../src/types/chart-design-set";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-chart-designs";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  !PROJECT.startsWith("demo-") ||
  process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS
) {
  console.error("Refusing to run: needs Firestore + Auth emulators, a demo-* project and no production credentials.");
  process.exit(2);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ||= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||= PROJECT;
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const auth = getAuth();

const AG = "ag1";
const SA1 = "saOne"; // mirrors production #1000: three defaults + "Test"
const SA2 = "saTwo"; // another tenant
const SA3 = "saThree"; // name groups, overflow, profile mixes
const SA4 = "saFour"; // two HD defaults → blocked
const SA5 = "saFive"; // legacy-only, never migrated in this run
const SA_NEW = "saNew"; // brand new — no chart designs at all
const SA_NEW2 = "saNew2"; // brand new — first load through the legacy list endpoint

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function req(uid: string, method = "GET", body?: unknown) {
  return new Request("http://test.local/x", {
    method,
    headers: { "x-user-uid": uid, "x-user-email": `${uid}@example.test`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const t = (iso: string) => Timestamp.fromDate(new Date(iso));

function legacyDesign(sa: string, system: ChartDesignSystem, name: string, isDefault: boolean, created: string, extra: Record<string, unknown> = {}) {
  return {
    subAccountId: sa,
    agencyId: AG,
    system,
    name,
    isDefault,
    chartDefinedColor: "#d4d4d8",
    channelsColor: "#52525b",
    gatesColor: "#18181b",
    personalityActivationColor: "#18181b",
    designActivationColor: "#9a3412",
    arrowColor: "#3f3f46",
    arrowStyle: "solid",
    planetBoxColor: "#f4f4f5",
    planetBoxMode: "fullBox",
    planetBoxBorderRadius: 6,
    centersMode: "uniform",
    headCenterColor: "#e49e4b",
    ajnaCenterColor: "#a19a5c",
    throatCenterColor: "#bf5a0f",
    gCenterColor: "#e49e4b",
    heartCenterColor: "#a23423",
    spleenCenterColor: "#bf5a0f",
    sacralCenterColor: "#a23423",
    solarPlexusCenterColor: "#bf5a0f",
    rootCenterColor: "#bf5a0f",
    backgroundColor: "#ffffff",
    houseSystem: "placidus",
    wheelAccentColor: "#5E2574",
    mandalaZodiacColor: "#8b5cf6",
    mandalaGateRingColor: "#71717a",
    mandalaQuadrantColor: "#71717a",
    createdAt: t(created),
    updatedAt: t(created),
    ...extra,
  };
}

async function setDoc(path: string, data: Record<string, unknown>) {
  await db.doc(path).set(data);
}

async function main() {
  // Lazy imports: modules read env at import time.
  const edDispatcher = await import("../src/app/api/sub-accounts/[id]/energetic-decoder/[[...path]]/route");
  const setsRoute = viaDispatcher(edDispatcher, "chart-design-sets");
  const setRoute = viaDispatcher(edDispatcher, "chart-design-sets/[setId]");
  const dupRoute = viaDispatcher(edDispatcher, "chart-design-sets/[setId]/duplicate");
  const legacyListRoute = viaDispatcher(edDispatcher, "chart-designs");
  const legacyDesignRoute = viaDispatcher(edDispatcher, "chart-designs/[designId]");
  const profileRoute = viaDispatcher(edDispatcher, "profiles/[profileId]");
  const genReportsRoute = viaDispatcher(edDispatcher, "generated-reports");
  const genPreviewRoute = viaDispatcher(edDispatcher, "generated-reports/[generatedReportId]/preview-data");

  const chartDesignService = await import("../src/lib/server/chart-design-service");
  const setService = await import("../src/lib/server/chart-design-set-service");
  const reportService = await import("../src/lib/server/generated-report-service");
  const resolution = await import("../src/lib/energetics/chart-design-resolution");
  const migration = await import("../src/lib/energetics/chart-design-set-migration");
  const fields = await import("../src/lib/energetics/chart-design-fields");
  const runner = await import("./lib/chart-design-set-migration-runner");
  const freeze = await import("./lib/generated-report-style-freeze-runner");

  const p = (id: string, extra: Record<string, string> = {}) => ({ params: Promise.resolve({ id, ...extra }) });
  const json = async (res: Response) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> });

  // ── Fixtures ──────────────────────────────────────────────────────────
  for (const [uid, agencyRole] of [["admin1", null], ["member2", null], ["outsider", null], ["admin3", null]] as const) {
    await auth.createUser({ uid, email: `${uid}@example.test` }).catch(() => undefined);
    await auth.setCustomUserClaims(uid, { status: "active", agencyId: AG, agencyRole });
  }
  for (const sa of [SA1, SA2, SA3, SA4, SA5, SA_NEW, SA_NEW2]) {
    await setDoc(`subAccounts/${sa}`, { agencyId: AG, name: sa, status: "active" });
    await setDoc(`subAccounts/${sa}/subAccountMembers/admin1`, { status: "active", role: "admin" });
  }
  await setDoc(`subAccounts/${SA1}/subAccountMembers/member2`, { status: "active", role: "collaborator" });
  await setDoc(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });
  await setDoc(`subAccounts/${SA3}/subAccountMembers/admin3`, { status: "active", role: "admin" });

  // SA1 — production shape: 3 defaults (HD customized) + "Test" HD.
  await setDoc("chartDesigns/sa1_hd", legacyDesign(SA1, "humanDesign", "Default", true, "2026-08-09T10:00:00Z", { chartDefinedColor: "#c2410c" }));
  await setDoc("chartDesigns/sa1_mandala", legacyDesign(SA1, "mandala", "Default", true, "2026-08-09T10:00:01Z", { chartDefinedColor: "#d4d4d8" }));
  await setDoc("chartDesigns/sa1_astro", legacyDesign(SA1, "astrology", "Default", true, "2026-08-09T10:00:02Z", { wheelAccentColor: "#5E2574" }));
  await setDoc("chartDesigns/sa1_test", legacyDesign(SA1, "humanDesign", "Test", false, "2026-09-01T10:00:00Z", { chartDefinedColor: "#7c3aed" }));
  // SA2 — another tenant's design (for cross-tenant references).
  await setDoc("chartDesigns/sa2_hd", legacyDesign(SA2, "humanDesign", "Default", true, "2026-08-09T10:00:00Z", { chartDefinedColor: "#000000" }));
  await setDoc("chartDesigns/sa2_mandala", legacyDesign(SA2, "mandala", "Default", true, "2026-08-09T10:00:00Z"));
  await setDoc("chartDesigns/sa2_astro", legacyDesign(SA2, "astrology", "Default", true, "2026-08-09T10:00:00Z"));
  // SA3 — "Luna" HD + "Luna" astrology (one group), a second "luna " HD
  // (overflow → its own group), and profiles exercising every override case.
  await setDoc("chartDesigns/sa3_hd", legacyDesign(SA3, "humanDesign", "Default", true, "2026-08-01T00:00:00Z"));
  await setDoc("chartDesigns/sa3_mandala", legacyDesign(SA3, "mandala", "Default", true, "2026-08-01T00:00:01Z"));
  await setDoc("chartDesigns/sa3_astro", legacyDesign(SA3, "astrology", "Default", true, "2026-08-01T00:00:02Z"));
  await setDoc("chartDesigns/sa3_luna_hd", legacyDesign(SA3, "humanDesign", "Luna", false, "2026-08-02T00:00:00Z", { chartDefinedColor: "#111111" }));
  await setDoc("chartDesigns/sa3_luna_astro", legacyDesign(SA3, "astrology", "Luna", false, "2026-08-02T00:00:01Z", { wheelAccentColor: "#222222" }));
  await setDoc("chartDesigns/sa3_luna2_hd", legacyDesign(SA3, "humanDesign", " luna ", false, "2026-08-03T00:00:00Z", { chartDefinedColor: "#333333" }));
  const profile = (sa: string, name: string, extra: Record<string, unknown> = {}) => ({
    subAccountId: sa, agencyId: AG, contactId: "c1", name, relationshipLabel: null,
    birthDate: "1990-01-01", birthTime: "12:00", birthPlace: "Austin", timeZone: "America/Chicago", lat: 30, lng: -97, ...extra,
  });
  await setDoc("energeticProfiles/p_plain", profile(SA3, "Plain"));
  await setDoc("energeticProfiles/p_luna", profile(SA3, "Luna Person", { hdChartDesignId: "sa3_luna_hd", astrologyChartDesignId: "sa3_luna_astro" }));
  await setDoc("energeticProfiles/p_mix", profile(SA3, "Mix Person", { hdChartDesignId: "sa3_luna2_hd", astrologyChartDesignId: "sa3_luna_astro" }));
  await setDoc("energeticProfiles/p_wrong", profile(SA3, "Wrong Refs", { mandalaChartDesignId: "sa3_luna_hd", hdChartDesignId: "sa2_hd" }));
  await setDoc("energeticProfiles/p_deflt", profile(SA3, "Explicit Default", { hdChartDesignId: "sa3_hd" }));
  await setDoc("energeticProfiles/p_sa1", profile(SA1, "SA1 Person", { hdChartDesignId: "sa1_test" }));
  // SA4 — two HD defaults → the migration must refuse.
  await setDoc("chartDesigns/sa4_hd_a", legacyDesign(SA4, "humanDesign", "Default", true, "2026-08-01T00:00:00Z"));
  await setDoc("chartDesigns/sa4_hd_b", legacyDesign(SA4, "humanDesign", "Other", true, "2026-08-01T00:00:01Z"));
  await setDoc("chartDesigns/sa4_mandala", legacyDesign(SA4, "mandala", "Default", true, "2026-08-01T00:00:00Z"));
  await setDoc("chartDesigns/sa4_astro", legacyDesign(SA4, "astrology", "Default", true, "2026-08-01T00:00:00Z"));
  // SA5 — legacy-only workspace.
  await setDoc("chartDesigns/sa5_hd", legacyDesign(SA5, "humanDesign", "Default", true, "2026-08-01T00:00:00Z", { chartDefinedColor: "#555555" }));
  await setDoc("chartDesigns/sa5_mandala", legacyDesign(SA5, "mandala", "Default", true, "2026-08-01T00:00:00Z"));
  await setDoc("chartDesigns/sa5_astro", legacyDesign(SA5, "astrology", "Default", true, "2026-08-01T00:00:00Z"));

  const count = async (col: string, sa?: string) =>
    (sa ? await db.collection(col).where("subAccountId", "==", sa).get() : await db.collection(col).get()).size;
  const load = (sa: string) => runner.loadSubAccountChartData(db, sa);
  const appearance = async (sa: string, profileId: string | null) => {
    const prof = profileId ? (await db.doc(`energeticProfiles/${profileId}`).get()).data() ?? null : null;
    const out: Record<string, string> = {};
    for (const s of ["humanDesign", "mandala", "astrology"] as const) {
      const d = await chartDesignService.resolveChartDesignForProfile(sa, prof, s);
      out[s] = d ? fields.chartDesignFingerprint(d) : "none";
    }
    return out;
  };

  console.log("\nPure resolver");
  await check("resolution order: profile set → legacy override → default set → legacy default → none", () => {
    const d = (id: string, system: ChartDesignSystem, extra: Partial<ChartDesign> = {}) =>
      ({ id, subAccountId: "X", agencyId: AG, system, name: id, isDefault: false, createdAt: null, updatedAt: null, ...extra }) as ChartDesign;
    const designs = [
      d("legacyDefaultHd", "humanDesign", { isDefault: true }),
      d("legacyOverrideHd", "humanDesign"),
      d("defSetHd", "humanDesign", { ownerSetId: "setDef" }),
      d("profSetHd", "humanDesign", { ownerSetId: "setProf" }),
      d("profSetMandala", "mandala", { ownerSetId: "setOther" }), // wrong owner → must not resolve via setProf
      d("foreignHd", "humanDesign", { subAccountId: "Y", ownerSetId: "setForeign" }),
    ];
    const set = (id: string, members: Partial<Record<ChartDesignSystem, string>>, isDefault = false, sa = "X") =>
      ({ id, subAccountId: sa, agencyId: AG, name: id, isDefault, members: { humanDesign: "", mandala: "", astrology: "", frequency: null, ...members }, createdAt: null, updatedAt: null }) as ChartDesignSet;
    const sets = [set("setDef", { humanDesign: "defSetHd" }, true), set("setProf", { humanDesign: "profSetHd", mandala: "profSetMandala" }), set("setForeign", { humanDesign: "foreignHd" }, false, "Y")];
    const r = (profile: Record<string, string> | null, system: ChartDesignSystem, opts: { sets?: ChartDesignSet[] } = {}) =>
      resolution.resolveChartDesign({ subAccountId: "X", designs, sets: opts.sets ?? sets, profile }, system);
    assert.equal(r({ chartDesignSetId: "setProf", hdChartDesignId: "legacyOverrideHd" }, "humanDesign").design?.id, "profSetHd");
    assert.equal(r({ chartDesignSetId: "setProf" }, "humanDesign").source, "profileSet");
    // member owned by another set → falls through (no legacy override) to the default set
    assert.equal(r({ chartDesignSetId: "setProf" }, "mandala").source, "none");
    assert.equal(r({ hdChartDesignId: "legacyOverrideHd" }, "humanDesign").design?.id, "legacyOverrideHd");
    assert.equal(r(null, "humanDesign").design?.id, "defSetHd");
    assert.equal(r(null, "humanDesign", { sets: [] }).design?.id, "legacyDefaultHd");
    assert.equal(r(null, "astrology").source, "none");
    // tenant scope: a foreign set id or a foreign record id never resolves
    assert.equal(r({ chartDesignSetId: "setForeign" }, "humanDesign").design?.id, "defSetHd");
    assert.equal(r({ hdChartDesignId: "foreignHd" }, "humanDesign").design?.id, "defSetHd");
    // wrong-system legacy override is ignored
    assert.equal(r({ mandalaChartDesignId: "legacyOverrideHd" }, "mandala").source, "none");
  });
  await check("field allow-list rejects unknown keys, bad colors, calculation settings", () => {
    assert.deepEqual(fields.sanitizeChartDesignSystemPatch("humanDesign", { chartDefinedColor: " #abcdef " }).patch, { chartDefinedColor: "#abcdef" });
    assert.equal(fields.sanitizeChartDesignSystemPatch("astrology", { houseSystem: "whole" }).errors.length, 1);
    assert.equal(fields.sanitizeChartDesignSystemPatch("humanDesign", { chartDefinedColor: "url(javascript:1)" }).errors.length, 1);
    assert.equal(fields.sanitizeChartDesignSystemPatch("mandala", { gatesColor: "#fff" }).errors.length, 1);
    assert.equal(fields.sanitizeChartDesignSystemPatch("humanDesign", { planetBoxBorderRadius: 999 }).errors.length, 1);
    assert.equal(fields.sanitizeChartDesignSystemPatch("humanDesign", { centersMode: "rainbow" }).errors.length, 1);
  });

  console.log("\nDefault unified design for new workspaces");
  await check("fresh workspace: concurrent first loads create exactly one Default plus the four ready-made designs, all with their own records", async () => {
    await Promise.all([
      setService.ensureDefaultChartDesignSet(SA_NEW, AG),
      setService.ensureDefaultChartDesignSet(SA_NEW, AG),
      setService.ensureDefaultChartDesignSet(SA_NEW, AG),
    ]);
    const data = await load(SA_NEW);
    // Default + the four ready-made designs, each with its own three records.
    assert.equal(data.sets.length, 5);
    assert.equal(data.designs.length, 15);
    assert.equal(data.sets.filter((x) => x.isDefault).length, 1);
    assert.equal(data.sets.find((x) => x.isDefault)?.name, "Default");
    assert.deepEqual(data.sets.filter((x) => x.starter).map((x) => x.name).sort(), ["Magnetix Violet", "Midnight", "Monochrome", "Warm Sunset"]);
    assert.deepEqual(((await db.doc(`subAccounts/${SA_NEW}`).get()).get("chartDesignStarters.seeded") as string[]).sort(), ["magnetix-violet", "midnight", "monochrome", "warm-sunset"]);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA_NEW, ...data }), []);
  });
  await check("fresh workspace through the legacy list endpoint is created as a unified design too", async () => {
    const res = await json(await legacyListRoute.GET(req("admin1"), p(SA_NEW2)));
    assert.equal(res.status, 200);
    assert.equal((res.body.designs as unknown[]).length, 15);
    const data = await load(SA_NEW2);
    assert.equal(data.sets.length, 5);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA_NEW2, ...data }), []);
  });
  await check("unmigrated workspace: listing unified designs creates nothing and reports migration required", async () => {
    const before = await count("chartDesigns", SA5);
    const res = await json(await setsRoute.GET(req("admin1"), p(SA5)));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sets, []);
    assert.equal(res.body.migrationRequired, true);
    assert.equal(await count("chartDesigns", SA5), before);
    assert.equal(await count("chartDesignSets", SA5), 0);
    const create = await json(await setsRoute.POST(req("admin1", "POST", { name: "X" }), p(SA5)));
    assert.equal(create.status, 409);
  });
  await check("unmigrated workspace resolves exactly as before (legacy defaults)", async () => {
    const d = await chartDesignService.getDefaultChartDesign(SA5, "humanDesign");
    assert.equal(d?.id, "sa5_hd");
  });

  console.log("\nMigration");
  const appearanceBefore: Record<string, Record<string, string>> = {};
  for (const [sa, pid] of [[SA1, null], [SA1, "p_sa1"], [SA3, null], [SA3, "p_plain"], [SA3, "p_luna"], [SA3, "p_mix"], [SA3, "p_wrong"], [SA3, "p_deflt"]] as const) {
    appearanceBefore[`${sa}:${pid}`] = await appearance(sa, pid);
  }
  const allDocsBefore = JSON.stringify((await db.collection("chartDesigns").get()).docs.map((d) => [d.id, d.data()]).sort());
  let dry: Awaited<ReturnType<typeof runner.runChartDesignSetMigration>>;
  await check("dry run plans the approved grouping and writes nothing", async () => {
    dry = await runner.runChartDesignSetMigration({ db, subAccountIds: [SA1, SA3, SA4] });
    assert.equal(JSON.stringify((await db.collection("chartDesigns").get()).docs.map((d) => [d.id, d.data()]).sort()), allDocsBefore);
    assert.equal(await count("chartDesignSets", SA1), 0);
    const sa1 = dry.plans.find((x) => x.subAccountId === SA1)!;
    assert.equal(sa1.status, "ready");
    assert.deepEqual(sa1.sets.map((s) => [s.id, s.name, s.isDefault, s.migration.copiedSystems]), [
      ["cds_sa1_hd", "Default", true, []],
      ["cds_sa1_test", "Test", false, ["mandala", "astrology"]],
    ]);
    assert.deepEqual(sa1.copies.map((c) => [c.id, c.sourceDesignId]), [
      ["cd_cds_sa1_test_mandala", "sa1_mandala"],
      ["cd_cds_sa1_test_astrology", "sa1_astro"],
    ]);
    assert.equal(sa1.ownerStamps.length, 4);
    // p_sa1 (HD override → Test, others default) → Test reproduces it exactly.
    assert.deepEqual(sa1.profileAssignments, [{ profileId: "p_sa1", setId: "cds_sa1_test" }]);
    const sa3 = dry.plans.find((x) => x.subAccountId === SA3)!;
    assert.deepEqual(sa3.sets.map((s) => [s.id, s.name, s.migration.source, s.migration.copiedSystems]), [
      ["cds_sa3_hd", "Default", "default", []],
      ["cds_sa3_luna_hd", "Luna", "named", ["mandala"]],
      ["cds_sa3_luna2_hd", "luna", "named", ["mandala", "astrology"]],
      ["cds_profile_p_mix", "Mix Person (migrated)", "profile-mix", ["humanDesign", "mandala", "astrology"]],
    ]);
    assert.deepEqual(
      sa3.profileAssignments.sort((a, b) => a.profileId.localeCompare(b.profileId)),
      [
        { profileId: "p_deflt", setId: "cds_sa3_hd" },
        { profileId: "p_luna", setId: "cds_sa3_luna_hd" },
        { profileId: "p_mix", setId: "cds_profile_p_mix" },
      ],
    );
    assert.ok(sa3.warnings.some((w) => w.includes("p_wrong")));
    const sa4 = dry.plans.find((x) => x.subAccountId === SA4)!;
    assert.equal(sa4.status, "blocked");
  });
  await check("live run is refused while any plan is blocked, and without matching --expect totals", async () => {
    const blocked = await runner.runChartDesignSetMigration({ db, live: true, subAccountIds: [SA1, SA3, SA4], expect: dry.totals });
    assert.ok(blocked.refused?.startsWith("Blocked"));
    const noExpect = await runner.runChartDesignSetMigration({ db, live: true, subAccountIds: [SA1, SA3] });
    assert.ok(noExpect.refused?.includes("don't match"));
    const wrong = await runner.runChartDesignSetMigration({ db, live: true, subAccountIds: [SA1, SA3], expect: { sets: 1, copies: 0, stamps: 0, profiles: 0 } });
    assert.ok(wrong.refused?.includes("don't match"));
    assert.equal(await count("chartDesignSets"), 10); // only the two fresh workspaces' Default + 4 ready-made designs each
  });
  let live: Awaited<ReturnType<typeof runner.runChartDesignSetMigration>>;
  await check("live run writes the plan, passes integrity, and changes no existing record's values", async () => {
    const plan = await runner.runChartDesignSetMigration({ db, subAccountIds: [SA1, SA3] });
    live = await runner.runChartDesignSetMigration({ db, live: true, subAccountIds: [SA1, SA3], expect: plan.totals });
    assert.equal(live.refused, null);
    for (const v of live.verification) assert.deepEqual(v.problems, [], `${v.subAccountId}: ${v.problems.join("; ")}`);
    const test = (await db.doc("chartDesigns/sa1_test").get()).data()!;
    assert.equal(test.ownerSetId, "cds_sa1_test");
    assert.equal(test.chartDefinedColor, "#7c3aed");
    assert.equal(test.isDefault, false);
    const copy = (await db.doc("chartDesigns/cd_cds_sa1_test_mandala").get()).data()!;
    assert.equal(copy.ownerSetId, "cds_sa1_test");
    assert.equal(copy.migration.copiedFrom, "sa1_mandala");
    assert.notEqual("cd_cds_sa1_test_mandala", "sa1_mandala"); // independent record, not a shared reference
    assert.equal((await db.doc("energeticProfiles/p_sa1").get()).get("chartDesignSetId"), "cds_sa1_test");
    // legacy override fields are left in place
    assert.equal((await db.doc("energeticProfiles/p_sa1").get()).get("hdChartDesignId"), "sa1_test");
  });
  await check("every Profile and the default look exactly the same after the migration", async () => {
    for (const key of Object.keys(appearanceBefore)) {
      const [sa, pid] = key.split(":");
      assert.deepEqual(await appearance(sa, pid === "null" ? null : pid), appearanceBefore[key], key);
    }
  });
  await check("re-running is a no-op (idempotent)", async () => {
    const again = await runner.runChartDesignSetMigration({ db, subAccountIds: [SA1, SA3] });
    assert.deepEqual(again.totals, { sets: 0, copies: 0, stamps: 0, profiles: 0 });
    assert.ok(again.plans.every((x) => x.status === "nothing-to-do"));
    const liveAgain = await runner.runChartDesignSetMigration({ db, live: true, subAccountIds: [SA1, SA3], expect: again.totals });
    assert.equal(liveAgain.written.length, 0);
  });
  await check("rollback restores the legacy state; re-running recreates identical deterministic ids", async () => {
    const preview = await runner.rollbackChartDesignSetMigration({ db, manifest: live.written });
    assert.ok(preview.actions.length > 0);
    assert.equal(await count("chartDesignSets", SA1), 2); // dry rollback wrote nothing
    await runner.rollbackChartDesignSetMigration({ db, manifest: live.written, live: true });
    assert.equal(await count("chartDesignSets", SA1), 0);
    assert.equal(await count("chartDesignSets", SA3), 0);
    assert.equal(JSON.stringify((await db.collection("chartDesigns").get()).docs.filter((d) => [SA1, SA3].includes(d.get("subAccountId"))).map((d) => [d.id, d.data()]).sort()),
      JSON.stringify(JSON.parse(allDocsBefore).filter(([, v]: [string, { subAccountId: string }]) => [SA1, SA3].includes(v.subAccountId))));
    assert.equal((await db.doc("energeticProfiles/p_sa1").get()).get("chartDesignSetId"), undefined);
    const plan = await runner.runChartDesignSetMigration({ db, subAccountIds: [SA1, SA3] });
    const rerun = await runner.runChartDesignSetMigration({ db, live: true, subAccountIds: [SA1, SA3], expect: plan.totals });
    assert.deepEqual(rerun.written, live.written);
    for (const v of rerun.verification) assert.deepEqual(v.problems, []);
  });

  console.log("\nUnified design API (permissions, independence, defaults, delete)");
  await check("members can read; only admins can create, edit, duplicate or delete", async () => {
    assert.equal((await setsRoute.GET(req("member2"), p(SA1))).status, 200);
    assert.equal((await setRoute.GET(req("member2"), p(SA1, { setId: "cds_sa1_hd" }))).status, 200);
    assert.equal((await setsRoute.POST(req("member2", "POST", { name: "Nope" }), p(SA1))).status, 403);
    assert.equal((await setRoute.PATCH(req("member2", "PATCH", { name: "Nope" }), p(SA1, { setId: "cds_sa1_test" }))).status, 403);
    assert.equal((await setRoute.PATCH(req("member2", "PATCH", { isDefault: true }), p(SA1, { setId: "cds_sa1_test" }))).status, 403);
    assert.equal((await setRoute.DELETE(req("member2", "DELETE"), p(SA1, { setId: "cds_sa1_test" }))).status, 403);
    assert.equal((await dupRoute.POST(req("member2", "POST"), p(SA1, { setId: "cds_sa1_test" }))).status, 403);
    // legacy per-record writes are admin-only now too
    assert.equal((await legacyListRoute.POST(req("member2", "POST", { system: "humanDesign", name: "x" }), p(SA1))).status, 403);
    assert.equal((await legacyDesignRoute.PATCH(req("member2", "PATCH", { name: "x" }), p(SA1, { designId: "sa1_hd" }))).status, 403);
  });
  await check("other tenants can't see or reach another workspace's designs", async () => {
    assert.equal((await setsRoute.GET(req("outsider"), p(SA1))).status, 403);
    assert.equal((await setRoute.GET(req("outsider"), p(SA2, { setId: "cds_sa1_hd" }))).status, 404);
    assert.equal((await setRoute.PATCH(req("admin1", "PATCH", { name: "x" }), p(SA2, { setId: "cds_sa1_test" }))).status, 404);
    assert.equal((await dupRoute.POST(req("admin1", "POST"), p(SA3, { setId: "cds_sa1_test" }))).status, 404);
  });
  let created = "";
  await check("new design = independent copy of the default; editing it never touches the default", async () => {
    const res = await json(await setsRoute.POST(req("admin1", "POST", { name: "Client Premium" }), p(SA1)));
    assert.equal(res.status, 200);
    const set = res.body.set as { id: string; designs: Record<string, ChartDesign> };
    created = set.id;
    const def = (await setService.getChartDesignSet(SA1, "cds_sa1_hd"))!;
    for (const s of ["humanDesign", "mandala", "astrology"] as const) {
      assert.notEqual(set.designs[s].id, def.designs[s]!.id);
      assert.equal(fields.chartDesignFingerprint(set.designs[s]), fields.chartDesignFingerprint(def.designs[s]!));
      assert.equal(set.designs[s].ownerSetId, set.id);
    }
    const patch = await json(await setRoute.PATCH(req("admin1", "PATCH", { name: "Client Premium 2", humanDesign: { chartDefinedColor: "#123456", centersMode: "traditional" }, astrology: { wheelAccentColor: "#654321" } }), p(SA1, { setId: created })));
    assert.equal(patch.status, 200);
    const after = (await setService.getChartDesignSet(SA1, created))!;
    assert.equal(after.name, "Client Premium 2");
    assert.equal(after.designs.humanDesign!.chartDefinedColor, "#123456");
    assert.equal(after.designs.astrology!.wheelAccentColor, "#654321");
    const defAfter = (await setService.getChartDesignSet(SA1, "cds_sa1_hd"))!;
    assert.equal(defAfter.designs.humanDesign!.chartDefinedColor, "#c2410c");
    assert.equal(defAfter.designs.astrology!.wheelAccentColor, "#5E2574");
  });
  await check("duplicate is a deep independent copy", async () => {
    const res = await json(await dupRoute.POST(req("admin1", "POST"), p(SA1, { setId: created })));
    const dup = res.body.set as { id: string; name: string; designs: Record<string, ChartDesign> };
    assert.equal(dup.name, "Copy of Client Premium 2");
    assert.equal(dup.designs.humanDesign.chartDefinedColor, "#123456");
    await setRoute.PATCH(req("admin1", "PATCH", { humanDesign: { chartDefinedColor: "#999999" } }), p(SA1, { setId: dup.id }));
    assert.equal((await setService.getChartDesignSet(SA1, created))!.designs.humanDesign!.chartDefinedColor, "#123456");
    const data = await load(SA1);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA1, ...data }), []);
  });
  await check("invalid edits are rejected and nothing is written", async () => {
    const before = (await setService.getChartDesignSet(SA1, created))!;
    for (const body of [
      { humanDesign: { notAField: "#fff" } },
      { astrology: { houseSystem: "whole" } },
      { mandala: { chartDefinedColor: "<script>" } },
      { name: "   " },
      { members: {} },
      { isDefault: true, name: "x" },
    ]) {
      const res = await setRoute.PATCH(req("admin1", "PATCH", body), p(SA1, { setId: created }));
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    const after = (await setService.getChartDesignSet(SA1, created))!;
    assert.equal(JSON.stringify(after.designs), JSON.stringify(before.designs));
  });
  await check("set as default switches the default design and mirrors every per-system flag", async () => {
    const res = await setRoute.PATCH(req("admin1", "PATCH", { isDefault: true }), p(SA1, { setId: created }));
    assert.equal(res.status, 200);
    const data = await load(SA1);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA1, ...data }), []);
    assert.equal((await chartDesignService.getDefaultChartDesign(SA1, "humanDesign"))?.chartDefinedColor, "#123456");
    assert.equal((await db.doc(`subAccounts/${SA1}`).get()).get("energeticDecoderTheme.chartDefinedColor"), "#123456");
    // legacy "set default" on a member of another design moves the whole design
    await legacyDesignRoute.PATCH(req("admin1", "PATCH", { isDefault: true }), p(SA1, { designId: "sa1_mandala" }));
    const again = await load(SA1);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA1, ...again }), []);
    assert.equal(again.sets.find((s) => s.isDefault)?.id, "cds_sa1_hd");
  });
  await check("safe delete: never the default, never while a Profile uses it; removes its own records only", async () => {
    assert.equal((await setRoute.DELETE(req("admin1", "DELETE"), p(SA1, { setId: "cds_sa1_hd" }))).status, 409);
    assert.equal((await setRoute.DELETE(req("admin1", "DELETE"), p(SA1, { setId: "cds_sa1_test" }))).status, 409); // p_sa1 uses it
    const victim = (await setService.getChartDesignSet(SA1, created))!;
    assert.equal((await setRoute.DELETE(req("admin1", "DELETE"), p(SA1, { setId: created }))).status, 200);
    for (const s of ["humanDesign", "mandala", "astrology"] as const) {
      assert.equal((await db.doc(`chartDesigns/${victim.designs[s]!.id}`).get()).exists, false);
    }
    assert.equal((await db.doc("chartDesigns/sa1_hd").get()).exists, true);
    // legacy per-record delete can't break a unified design
    assert.equal((await legacyDesignRoute.DELETE(req("admin1", "DELETE"), p(SA1, { designId: "sa1_test" }))).status, 400);
    const data = await load(SA1);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA1, ...data }), []);
  });
  await check("legacy single-record create in a migrated workspace makes a whole unified design", async () => {
    const res = await json(await legacyListRoute.POST(req("admin1", "POST", { system: "astrology", name: "Legacy Made" }), p(SA1)));
    assert.equal(res.status, 200);
    const design = res.body.design as ChartDesign;
    assert.equal(design.system, "astrology");
    assert.ok(design.ownerSetId);
    const data = await load(SA1);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA1, ...data }), []);
  });
  await check("Profile picker: only this workspace's unified designs can be chosen", async () => {
    assert.equal((await profileRoute.PATCH(req("admin1", "PATCH", { chartDesignSetId: "cds_sa1_test" }), p(SA3, { profileId: "p_plain" }))).status, 404);
    assert.equal((await profileRoute.PATCH(req("admin1", "PATCH", { chartDesignSetId: "nope" }), p(SA3, { profileId: "p_plain" }))).status, 404);
    const ok = await json(await profileRoute.PATCH(req("admin3", "PATCH", { chartDesignSetId: "cds_sa3_luna_hd" }), p(SA3, { profileId: "p_plain" })));
    assert.equal(ok.status, 200);
    const prof = (await db.doc("energeticProfiles/p_plain").get()).data()!;
    assert.equal((await chartDesignService.resolveChartDesignForProfile(SA3, prof, "humanDesign"))?.id, "sa3_luna_hd");
    // clearing returns it to the default design
    await profileRoute.PATCH(req("admin3", "PATCH", { chartDesignSetId: null }), p(SA3, { profileId: "p_plain" }));
    const cleared = (await db.doc("energeticProfiles/p_plain").get()).data()!;
    assert.equal((await chartDesignService.resolveChartDesignForProfile(SA3, cleared, "humanDesign"))?.id, "sa3_hd");
  });

  console.log("\nGenerated report style snapshots");
  await setDoc("reportDesigns/rd1", { subAccountId: SA1, agencyId: AG, title: "Lead Magnet", pages: [], createdAt: t("2026-09-01T00:00:00Z"), updatedAt: t("2026-09-01T00:00:00Z") });
  await setDoc("energeticDecoderReadings/r1", {
    subAccountId: SA1, agencyId: AG, contactId: "c1", profileId: "p_sa1", name: "SA1 Person",
    birthDate: "1990-01-01", birthTime: "12:00", birthPlace: "Austin", timeZone: "America/Chicago",
    spheres: [], humanDesign: { type: "Generator", variableArrows: { digestion: null } }, astrology: { placements: [] },
    createdAt: t("2026-09-01T00:00:00Z"),
  });
  let reportId = "";
  await check("generating a report freezes the chart styling it was rendered with", async () => {
    const res = await json(await genReportsRoute.POST(req("admin1", "POST", { reportDesignId: "rd1", readingId: "r1" }), p(SA1)));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    reportId = ((res.body.generatedReport ?? res.body.report) as { id: string }).id;
    const stored = (await db.doc(`generatedReports/${reportId}`).get()).data()!;
    const styles = stored.snapshot.chartStyles;
    assert.equal(styles.source, "generation");
    assert.equal(styles.setId, "cds_sa1_test");
    assert.equal(styles.humanDesign.chartDefinedColor, "#7c3aed");
    assert.equal(styles.humanDesign.id, "sa1_test");
    assert.equal(styles.frequency, null);
    assert.deepEqual(stored.snapshot.pages, []);
  });
  await check("editing the Chart Design afterwards does not change the generated report", async () => {
    await setRoute.PATCH(req("admin1", "PATCH", { humanDesign: { chartDefinedColor: "#00ff00" } }), p(SA1, { setId: "cds_sa1_test" }));
    const preview = await json(await genPreviewRoute.GET(req("admin1"), p(SA1, { generatedReportId: reportId })));
    assert.equal(preview.status, 200);
    assert.equal((preview.body.hdDesign as ChartDesign).chartDefinedColor, "#7c3aed");
    const report = (await reportService.getGeneratedReport(SA1, reportId))!;
    const reading = { profileId: "p_sa1", humanDesign: {}, astrology: {} } as never;
    const forPdf = await reportService.chartDesignsForGeneratedReport(SA1, report, reading);
    assert.equal(forPdf.frozen, true);
    assert.equal(forPdf.hdDesign?.chartDefinedColor, "#7c3aed");
  });
  await check("older reports without frozen styling keep rendering the reading's current designs", async () => {
    await setDoc("generatedReports/legacy1", {
      subAccountId: SA1, agencyId: AG, reportDesignId: "rd1", reportDesignTitleAtGeneration: "Lead Magnet",
      readingId: "r1", contactId: "c1", profileId: "p_sa1", generatedBy: "admin1",
      generatedAt: t("2026-08-20T00:00:00Z"), snapshot: { pages: [{ id: "pg1", blocks: [] }] },
    });
    const preview = await json(await genPreviewRoute.GET(req("admin1"), p(SA1, { generatedReportId: "legacy1" })));
    assert.equal((preview.body.hdDesign as ChartDesign).chartDefinedColor, "#00ff00");
  });
  await check("freeze runner: dry run writes nothing; --expect gates; live keeps current appearance only", async () => {
    const dryFreeze = await freeze.runGeneratedReportStyleFreeze({ db });
    assert.deepEqual(dryFreeze.plan.filter((x) => x.chartStyles).map((x) => x.reportId), ["legacy1"]);
    assert.equal((await db.doc("generatedReports/legacy1").get()).get("snapshot.chartStyles"), undefined);
    const refused = await freeze.runGeneratedReportStyleFreeze({ db, live: true, expect: 5 });
    assert.ok(refused.refused);
    const before = (await db.doc("generatedReports/legacy1").get()).data()!;
    const done = await freeze.runGeneratedReportStyleFreeze({ db, live: true, expect: 1 });
    assert.deepEqual(done.frozen, ["legacy1"]);
    const after = (await db.doc("generatedReports/legacy1").get()).data()!;
    assert.equal(after.snapshot.chartStyles.source, "frozen-at-migration");
    assert.equal(after.snapshot.chartStyles.humanDesign.chartDefinedColor, "#00ff00");
    const { chartStyles: _ignored, ...restSnapshot } = after.snapshot;
    void _ignored;
    assert.deepEqual(restSnapshot, before.snapshot);
    for (const k of Object.keys(before)) if (k !== "snapshot") assert.deepEqual(after[k], before[k], k);
    // the already-frozen generated report is untouched; a re-run freezes nothing
    const again = await freeze.runGeneratedReportStyleFreeze({ db });
    assert.equal(again.plan.length, 0);
    await setRoute.PATCH(req("admin1", "PATCH", { humanDesign: { chartDefinedColor: "#0000ff" } }), p(SA1, { setId: "cds_sa1_test" }));
    const preview = await json(await genPreviewRoute.GET(req("admin1"), p(SA1, { generatedReportId: "legacy1" })));
    assert.equal((preview.body.hdDesign as ChartDesign).chartDefinedColor, "#00ff00");
  });

  console.log("\nLibrary and editor flows (Batch 2)");
  const editorState = await import("../src/lib/energetics/chart-design-editor-state");
  const previewRoute = viaDispatcher(edDispatcher, "chart-designs/preview");
  type SetBody = { set: import("../src/types/chart-design-set").ChartDesignSetWithMembers };
  await check("library loads unified designs, default first, with every system's record", async () => {
    const res = await json(await setsRoute.GET(req("member2"), p(SA1)));
    assert.equal(res.status, 200);
    assert.equal(res.body.migrationRequired, false);
    const sets = res.body.sets as import("../src/types/chart-design-set").ChartDesignSetWithMembers[];
    assert.ok(sets.length >= 3);
    assert.equal(sets[0].isDefault, true);
    for (const set of sets) {
      for (const sys of ["humanDesign", "mandala", "astrology"] as const) {
        assert.equal(set.designs[sys]?.ownerSetId, set.id, `${set.name}/${sys}`);
      }
      assert.ok(set.updatedAt === null || typeof set.updatedAt === "string");
    }
  });
  await check("a new design starts as an independent copy of the CURRENT default", async () => {
    const def = (await setService.listChartDesignSets(SA3, AG)).sets.find((x) => x.isDefault)!;
    await setRoute.PATCH(req("admin3", "PATCH", { mandala: { mandalaZodiacColor: "#0a0b0c" } }), p(SA3, { setId: def.id }));
    const res = await json(await setsRoute.POST(req("admin3", "POST", { name: "Fresh" }), p(SA3)));
    const fresh = (res.body as unknown as SetBody).set;
    assert.equal(fresh.name, "Fresh");
    assert.equal(fresh.designs.mandala!.mandalaZodiacColor, "#0a0b0c");
    assert.notEqual(fresh.designs.mandala!.id, def.designs.mandala!.id);
  });
  await check("rename updates the design and its records' names", async () => {
    const created = (await json(await setsRoute.POST(req("admin3", "POST", { name: "To Rename" }), p(SA3)))).body as unknown as SetBody;
    const res = await json(await setRoute.PATCH(req("admin3", "PATCH", { name: "Renamed Design" }), p(SA3, { setId: created.set.id })));
    assert.equal(res.status, 200);
    const reloaded = (await setService.getChartDesignSet(SA3, created.set.id))!;
    assert.equal(reloaded.name, "Renamed Design");
    for (const sys of ["humanDesign", "mandala", "astrology"] as const) assert.equal(reloaded.designs[sys]!.name, "Renamed Design");
    assert.equal((await setRoute.PATCH(req("member2", "PATCH", { name: "x" }), p(SA1, { setId: "cds_sa1_test" }))).status, 403);
  });
  await check("editor round trip: one save persists every section; reload matches; other designs untouched", async () => {
    const created = (await json(await setsRoute.POST(req("admin3", "POST", { name: "Round Trip" }), p(SA3)))).body as unknown as SetBody;
    const others = (await setService.listChartDesignSets(SA3, AG)).sets.filter((x) => x.id !== created.set.id);
    let st = editorState.initChartDesignEditorState(created.set);
    st = editorState.setEditorField(st, "humanDesign", "centersMode", "traditional");
    st = editorState.setEditorField(st, "humanDesign", "rootCenterColor", "#101010");
    st = editorState.setEditorField(st, "humanDesign", "planetBoxBorderRadius", 12);
    st = editorState.setEditorField(st, "mandala", "chartDefinedColor", "#c2410c");
    st = editorState.setEditorField(st, "mandala", "mandalaZodiacColor", "#ea580c");
    st = editorState.setEditorField(st, "astrology", "wheelAccentColor", "#202020");
    st = editorState.setEditorName(st, "Round Trip Saved");
    const payload = editorState.buildEditorSavePayload(st)!;
    const res = await json(await setRoute.PATCH(req("admin3", "PATCH", payload), p(SA3, { setId: created.set.id })));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const fresh = (await json(await setRoute.GET(req("admin3"), p(SA3, { setId: created.set.id })))).body as unknown as SetBody;
    const again = editorState.initChartDesignEditorState(fresh.set);
    assert.deepEqual(again.values, st.values);
    assert.equal(again.name, "Round Trip Saved");
    assert.equal(editorState.isEditorDirty(again), false);
    for (const o of others) {
      const now = (await setService.getChartDesignSet(SA3, o.id))!;
      for (const sys of ["humanDesign", "mandala", "astrology"] as const) {
        assert.equal(fields.chartDesignFingerprint(now.designs[sys]!), fields.chartDesignFingerprint(o.designs[sys]!), `${o.name}/${sys} changed`);
      }
    }
  });
  await check("editor sample endpoint answers members only; ?sample=full returns the richer sample", async () => {
    const full = await json(await previewRoute.GET(new Request("http://test.local/x?sample=full", { headers: { "x-user-uid": "member2" } }), p(SA1)));
    assert.equal(full.status, 200);
    assert.ok(full.body.humanDesign && full.body.astrology);
    assert.equal((await previewRoute.GET(new Request("http://test.local/x?sample=full", { headers: { "x-user-uid": "outsider" } }), p(SA1))).status, 403);
  });
  await check("unmigrated workspace: the library reports it and creating or editing can't group anything", async () => {
    const before = JSON.stringify((await db.collection("chartDesigns").where("subAccountId", "==", SA5).get()).docs.map((d) => [d.id, d.data()]).sort());
    const list = await json(await setsRoute.GET(req("admin1"), p(SA5)));
    assert.equal(list.body.migrationRequired, true);
    assert.equal((await setsRoute.POST(req("admin1", "POST", { name: "Nope" }), p(SA5))).status, 409);
    assert.equal(await count("chartDesignSets", SA5), 0);
    assert.equal(JSON.stringify((await db.collection("chartDesigns").where("subAccountId", "==", SA5).get()).docs.map((d) => [d.id, d.data()]).sort()), before);
  });

  console.log("\nCalculation settings stay separate from Chart Designs");
  const reportConfigRoute = viaDispatcher(edDispatcher, "report-config");
  const legacyDesignRoute2 = legacyDesignRoute;
  const calc = await import("../src/lib/server/reading-calculation-settings-service");
  const houseRunner = await import("./lib/house-system-setting-runner");
  const readingsSnapshot = async () => JSON.stringify((await db.collection("energeticDecoderReadings").get()).docs.map((d) => [d.id, d.data()]).sort());
  await check("a Chart Design save can't carry a calculation setting", async () => {
    const def = (await setService.listChartDesignSets(SA3, AG)).sets.find((x) => x.isDefault)!;
    assert.equal((await setRoute.PATCH(req("admin3", "PATCH", { astrologyCalculation: { houseSystem: "whole" } }), p(SA3, { setId: def.id }))).status, 400);
    assert.equal((await setRoute.PATCH(req("admin3", "PATCH", { astrology: { houseSystem: "whole" } }), p(SA3, { setId: def.id }))).status, 400);
    assert.equal((await calc.getAstrologyHouseSystem(SA3)).houseSystem, "placidus");
  });
  await check("Reading Configuration owns the house system: members read it, admins change it, toggles keep it", async () => {
    const before = await json(await reportConfigRoute.GET(req("member2"), p(SA1)));
    assert.equal(before.status, 200);
    assert.equal(before.body.astrologyHouseSystem, "placidus");
    // SA1's default design was switched earlier in this run, which saved its
    // house system as the explicit calculation setting first (the pin).
    assert.equal(before.body.astrologyHouseSystemSource, "setting");
    assert.equal((await reportConfigRoute.POST(req("member2", "POST", { astrologyHouseSystem: "whole" }), p(SA1))).status, 403);
    assert.equal((await reportConfigRoute.POST(req("outsider", "POST", { astrologyHouseSystem: "whole" }), p(SA1))).status, 403);
    assert.equal((await reportConfigRoute.POST(req("admin1", "POST", { astrologyHouseSystem: "koch" }), p(SA1))).status, 400);
    assert.equal((await reportConfigRoute.POST(req("admin1", "POST", { astrologyHouseSystem: "whole" }), p(SA1))).status, 200);
    // a sequence toggle that doesn't mention it leaves it alone
    await reportConfigRoute.POST(req("admin1", "POST", { includeVenus: false }), p(SA1));
    const after = await json(await reportConfigRoute.GET(req("admin1"), p(SA1)));
    assert.equal(after.body.astrologyHouseSystem, "whole");
    assert.equal(after.body.astrologyHouseSystemSource, "setting");
    assert.equal((after.body.config as Record<string, unknown>).includeVenus, false);
    // and it isn't stored on any design record
    const astro = await chartDesignService.getDefaultChartDesign(SA1, "astrology");
    assert.equal(astro?.houseSystem, "placidus");
  });
  await check("setting a new default design or saving styling never changes the calculation", async () => {
    const sets = (await setService.listChartDesignSets(SA3, AG)).sets;
    const def = sets.find((x) => x.isDefault)!;
    const other = sets.find((x) => !x.isDefault)!;
    // legacy data: another design's Astrology record carries a different house system
    await db.doc(`chartDesigns/${other.designs.astrology!.id}`).update({ houseSystem: "equal" });
    const records = JSON.stringify((await db.collection("chartDesigns").where("subAccountId", "==", SA3).get()).docs.map((d) => [d.id, d.get("houseSystem")]).sort());
    assert.deepEqual(await calc.getAstrologyHouseSystem(SA3), { houseSystem: "placidus", source: "defaultDesign" });
    let st = editorState.initChartDesignEditorState(def);
    st = editorState.setEditorField(st, "astrology", "wheelAccentColor", "#818cf8");
    await setRoute.PATCH(req("admin3", "PATCH", editorState.buildEditorSavePayload(st)!), p(SA3, { setId: def.id }));
    assert.equal((await calc.getAstrologyHouseSystem(SA3)).houseSystem, "placidus");
    await setRoute.PATCH(req("admin3", "PATCH", { isDefault: true }), p(SA3, { setId: other.id }));
    assert.deepEqual(await calc.getAstrologyHouseSystem(SA3), { houseSystem: "placidus", source: "setting" });
    assert.equal(
      JSON.stringify((await db.collection("chartDesigns").where("subAccountId", "==", SA3).get()).docs.map((d) => [d.id, d.get("houseSystem")]).sort()),
      records,
    ); // no design record's house system was rewritten
    await setRoute.PATCH(req("admin3", "PATCH", { isDefault: true }), p(SA3, { setId: def.id }));
    assert.equal((await calc.getAstrologyHouseSystem(SA3)).houseSystem, "placidus");
  });
  await check("unmigrated workspace: switching the legacy Astrology default saves the current house system first", async () => {
    await setDoc("chartDesigns/sa5_astro_whole", legacyDesign(SA5, "astrology", "Whole Sign Look", false, "2026-08-02T00:00:00Z", { houseSystem: "whole" }));
    assert.deepEqual(await calc.getAstrologyHouseSystem(SA5), { houseSystem: "placidus", source: "defaultDesign" });
    assert.equal((await legacyDesignRoute2.PATCH(req("admin1", "PATCH", { isDefault: true }), p(SA5, { designId: "sa5_astro_whole" }))).status, 200);
    assert.deepEqual(await calc.getAstrologyHouseSystem(SA5), { houseSystem: "placidus", source: "setting" });
    // the legacy record route no longer edits house systems
    await legacyDesignRoute2.PATCH(req("admin1", "PATCH", { houseSystem: "equal" }), p(SA5, { designId: "sa5_astro_whole" }));
    assert.equal((await db.doc("chartDesigns/sa5_astro_whole").get()).get("houseSystem"), "whole");
    assert.equal(await count("chartDesignSets", SA5), 0);
  });
  await check("reading creation reads the calculation setting, never a design", () => {
    const src = readFileSync("src/lib/server/energetic-decoder-service.ts", "utf8");
    assert.ok(src.includes("getAstrologyHouseSystem(input.subAccountId, reportConfig)"));
    assert.ok(!src.includes("getDefaultChartDesign"));
  });
  await check("house-system copy script: dry run, --expect, live, idempotent, rollback; readings untouched", async () => {
    const readingsBefore = await readingsSnapshot();
    const dryRun = await houseRunner.runHouseSystemSetting({ db, subAccountIds: [SA1, SA2, SA4] });
    assert.deepEqual(dryRun.plan, [
      { subAccountId: SA2, houseSystem: "placidus", from: "defaultDesign" },
      { subAccountId: SA4, houseSystem: "placidus", from: "defaultDesign" },
    ]); // SA1 already has a saved setting
    assert.equal((await db.doc(`subAccounts/${SA2}`).get()).get("energeticDecoderReportConfig.astrologyHouseSystem"), undefined);
    const refused = await houseRunner.runHouseSystemSetting({ db, live: true, expect: 5, subAccountIds: [SA1, SA2, SA4] });
    assert.ok(refused.refused);
    const done = await houseRunner.runHouseSystemSetting({ db, live: true, expect: 2, subAccountIds: [SA1, SA2, SA4] });
    assert.equal(done.written.length, 2);
    assert.deepEqual(await calc.getAstrologyHouseSystem(SA2), { houseSystem: "placidus", source: "setting" });
    assert.equal((await houseRunner.planHouseSystemSetting(db, [SA1, SA2, SA4])).length, 0);
    assert.equal(await readingsSnapshot(), readingsBefore);
    await houseRunner.rollbackHouseSystemSetting({ db, manifest: done.written, live: true });
    assert.deepEqual(await calc.getAstrologyHouseSystem(SA2), { houseSystem: "placidus", source: "defaultDesign" });
  });

  console.log("\nReady-made designs for existing workspaces");
  const starters = await import("../src/lib/energetics/chart-design-starters");
  const starterRunner = await import("./lib/chart-design-starters-runner");
  const snapshotAll = async (col: string) => JSON.stringify((await db.collection(col).get()).docs.map((d) => [d.id, d.data()]).sort());
  // A workspace design that already uses one of the ready-made names.
  const collision = (await json(await setsRoute.POST(req("admin1", "POST", { name: "Monochrome" }), p(SA1)))).body as unknown as SetBody;
  await setRoute.PATCH(req("admin1", "PATCH", { humanDesign: { chartDefinedColor: "#0f0f0f" } }), p(SA1, { setId: collision.set.id }));
  const existingBefore: Record<string, Awaited<ReturnType<typeof load>>> = { [SA1]: await load(SA1), [SA3]: await load(SA3) };
  const others = { profiles: await snapshotAll("energeticProfiles"), reports: await snapshotAll("generatedReports"), readings: await snapshotAll("energeticDecoderReadings") };
  let starterPlan: Awaited<ReturnType<typeof starterRunner.runStarterSeeding>>;
  await check("dry run: four designs per migrated workspace, collisions renamed, others skipped, zero writes", async () => {
    const designsBefore = await snapshotAll("chartDesigns");
    starterPlan = await starterRunner.runStarterSeeding({ db, subAccountIds: [SA1, SA3, SA5, SA_NEW] });
    assert.equal(await snapshotAll("chartDesigns"), designsBefore);
    const byId = Object.fromEntries(starterPlan.plans.map((x) => [x.subAccountId, x]));
    assert.equal(byId[SA1].status, "ready");
    assert.deepEqual(byId[SA1].creates.map((c) => c.name), ["Magnetix Violet", "Monochrome (ready-made)", "Warm Sunset", "Midnight"]);
    assert.equal(byId[SA1].creates[1].renamedBecauseTaken, "Monochrome");
    assert.equal(byId[SA3].creates.length, 4);
    assert.equal(byId[SA5].status, "not-migrated");
    assert.equal(byId[SA_NEW].status, "nothing-to-do"); // seeded at creation
    assert.deepEqual(starterPlan.totals, { sets: 8, records: 24 });
  });
  await check("live run needs matching --expect; writes complete, independent designs; verification OK", async () => {
    assert.ok((await starterRunner.runStarterSeeding({ db, live: true, subAccountIds: [SA1, SA3, SA5, SA_NEW], expect: { sets: 1, records: 3 } })).refused);
    const live = await starterRunner.runStarterSeeding({ db, live: true, subAccountIds: [SA1, SA3, SA5, SA_NEW], expect: { sets: 8, records: 24 } });
    assert.equal(live.refused, null);
    for (const v of live.verification) assert.deepEqual(v.problems, [], `${v.subAccountId}: ${v.problems.join("; ")}`);
    for (const sa of [SA1, SA3]) {
      const after = await load(sa);
      const def = after.sets.find((x) => x.isDefault)!;
      for (const starter of starters.CHART_DESIGN_STARTERS) {
        const set = after.sets.find((x) => x.starter?.key === starter.key)!;
        assert.ok(set, `${sa}/${starter.key}`);
        assert.equal(set.isDefault, false);
        for (const sys of ["humanDesign", "mandala", "astrology"] as const) {
          const member = after.designs.find((d) => d.id === set.members[sys])!;
          const defMember = after.designs.find((d) => d.id === def.members[sys])!;
          assert.equal(member.ownerSetId, set.id);
          assert.notEqual(member.id, defMember.id);
          assert.equal(fields.chartDesignFingerprint(member), fields.chartDesignFingerprint(starters.starterSystemValues(defMember, starter.key, sys)), `${sa}/${starter.key}/${sys} values`);
        }
      }
      assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: sa, ...after }), []);
    }
    (globalThis as Record<string, unknown>).__starterManifest = live.written;
  });
  await check("existing Default, custom designs (incl. the same-named one), Profiles, readings and reports are unchanged", async () => {
    for (const sa of [SA1, SA3]) {
      const before = existingBefore[sa];
      const after = await load(sa);
      for (const d of before.designs) {
        const now = after.designs.find((x) => x.id === d.id)!;
        assert.equal(fields.chartDesignFingerprint(now), fields.chartDesignFingerprint(d), `${d.id}`);
        assert.equal(now.isDefault, d.isDefault);
        assert.equal(now.name, d.name);
      }
      for (const set of before.sets) {
        const now = after.sets.find((x) => x.id === set.id)!;
        assert.equal(now.name, set.name);
        assert.equal(now.isDefault, set.isDefault);
        assert.deepEqual(now.members, set.members);
      }
    }
    assert.equal((await setService.getChartDesignSet(SA1, collision.set.id))!.designs.humanDesign!.chartDefinedColor, "#0f0f0f");
    assert.equal(await snapshotAll("energeticProfiles"), others.profiles);
    assert.equal(await snapshotAll("generatedReports"), others.reports);
    assert.equal(await snapshotAll("energeticDecoderReadings"), others.readings);
  });
  await check("idempotent: a re-run adds nothing, and a deleted ready-made design is never re-added", async () => {
    const again = await starterRunner.planStarterSeeding(db, [SA1, SA3]);
    assert.deepEqual(again.totals, { sets: 0, records: 0 });
    const midnight = (await load(SA3)).sets.find((x) => x.starter?.key === "midnight")!;
    assert.equal((await setRoute.DELETE(req("admin3", "DELETE"), p(SA3, { setId: midnight.id }))).status, 200);
    const afterDelete = await starterRunner.planStarterSeeding(db, [SA3]);
    assert.deepEqual(afterDelete.totals, { sets: 0, records: 0 });
  });
  await check("ready-made designs are ordinary designs: editing one changes nothing else; duplicates aren't marked ready-made", async () => {
    const sets = (await load(SA3)).sets;
    const violet = sets.find((x) => x.starter?.key === "magnetix-violet")!;
    const before = await load(SA3);
    await setRoute.PATCH(req("admin3", "PATCH", { mandala: { mandalaQuadrantColor: "#123123" }, name: "Violet Custom" }), p(SA3, { setId: violet.id }));
    const after = await load(SA3);
    for (const d of before.designs) {
      if (d.ownerSetId === violet.id) continue;
      assert.equal(fields.chartDesignFingerprint(after.designs.find((x) => x.id === d.id)!), fields.chartDesignFingerprint(d), d.id);
    }
    const dup = (await json(await dupRoute.POST(req("admin3", "POST"), p(SA3, { setId: violet.id })))).body as unknown as SetBody;
    assert.equal((await db.doc(`chartDesignSets/${dup.set.id}`).get()).get("starter"), undefined);
    assert.equal(dup.set.designs.mandala!.mandalaQuadrantColor, "#123123");
    // and it can become the default like any design (flags mirrored), then back
    const def = sets.find((x) => x.isDefault)!;
    assert.equal((await setRoute.PATCH(req("admin3", "PATCH", { isDefault: true }), p(SA3, { setId: violet.id }))).status, 200);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA3, ...(await load(SA3)) }), []);
    await setRoute.PATCH(req("admin3", "PATCH", { isDefault: true }), p(SA3, { setId: def.id }));
  });
  await check("ready-made designs keep admin-only writes and tenant isolation", async () => {
    const warm = (await load(SA1)).sets.find((x) => x.starter?.key === "warm-sunset")!;
    assert.equal((await setRoute.PATCH(req("member2", "PATCH", { name: "x" }), p(SA1, { setId: warm.id }))).status, 403);
    assert.equal((await setRoute.DELETE(req("member2", "DELETE"), p(SA1, { setId: warm.id }))).status, 403);
    assert.equal((await setRoute.GET(req("outsider"), p(SA2, { setId: warm.id }))).status, 404);
    assert.equal((await setRoute.PATCH(req("admin1", "PATCH", { name: "x" }), p(SA3, { setId: warm.id }))).status, 404);
  });
  await check("rollback removes exactly what the run added and restores the marker; a re-run recreates the same ids", async () => {
    const manifest = ((globalThis as Record<string, unknown>).__starterManifest as Awaited<ReturnType<typeof starterRunner.runStarterSeeding>>["written"]).filter((m) => m.subAccountId === SA1);
    const before = await load(SA1);
    const preview = await starterRunner.rollbackStarterSeeding({ db, manifest });
    assert.ok(preview.actions.length > 0);
    assert.equal((await load(SA1)).sets.length, before.sets.length); // dry
    await starterRunner.rollbackStarterSeeding({ db, manifest, live: true });
    const after = await load(SA1);
    assert.equal(after.sets.filter((x) => x.starter).length, 0);
    assert.equal((await db.doc(`subAccounts/${SA1}`).get()).get("chartDesignStarters"), undefined);
    assert.deepEqual(migration.checkChartDesignSetIntegrity({ subAccountId: SA1, ...after }), []);
    const replan = await starterRunner.planStarterSeeding(db, [SA1]);
    assert.deepEqual(replan.plans[0].creates.map((c) => c.setId), manifest[0].sets);
  });

  console.log(`\n${passed} checks passed.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
