/**
 * Readings library (2026-10-07) — data-side checks for Energetic Decoder →
 * Readings: one row per person, latest snapshot wins, no newest-50 cap,
 * server paging, search on names only (never birth place), legacy
 * profile-less readings kept as their own rows, field-projected reads, no
 * composite-index query shapes, and forward-only reading origin.
 *
 * Pure + a fake Firestore — no emulator, no network.
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-readings-library.ts
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  assembleReadingsLibrary,
  libraryPageWindow,
  normalizeLibraryPage,
  normalizeLibrarySort,
  sunSignOf,
  READINGS_LIBRARY_PAGE_SIZE,
  type LibraryProfileInput,
  type LibraryReadingInput,
} from "../src/lib/energetic-decoder/readings-library";
import { listReadingsLibrary } from "../src/lib/server/readings-library-service";
import { READING_ORIGINS } from "../src/types/energetic-decoder";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const iso = (day: number) => new Date(Date.UTC(2026, 0, 1) + day * 86400000).toISOString();

// 60 people, 2 readings each (120 readings) — the oldest people's readings
// are all older than the newest 50, which is exactly what the old list lost.
const profiles: LibraryProfileInput[] = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `Person ${String(i).padStart(2, "0")}`, contactId: `c${i}` }));
const readings: LibraryReadingInput[] = profiles.flatMap((p, i) => [
  { id: `r${i}a`, profileId: p.id, contactId: p.contactId, name: p.name, createdAt: iso(i * 2) },
  { id: `r${i}b`, profileId: p.id, contactId: p.contactId, name: p.name, createdAt: iso(i * 2 + 1) },
]);

(async () => {
  console.log("\nRows, paging, the 50-reading bug");
  await check("every person is one row, opening their LATEST reading — no nested history rows", () => {
    const all = assembleReadingsLibrary(profiles, readings, new Map(), { pageSize: 1000 });
    assert.equal(all.total, 60);
    assert.equal(all.rows.length, 60);
    for (const row of all.rows) {
      assert.equal(row.kind, "profile");
      assert.equal(row.latestReadingId, `r${row.id.slice(1)}b`, `${row.name} opens its newest snapshot`);
    }
  });
  await check("no newest-N cap: the oldest person still has their reading (old bug: 'No readings yet' past the newest 50)", () => {
    const newest50 = [...readings].sort((a, b) => b.createdAt!.localeCompare(a.createdAt!)).slice(0, 50).map((r) => r.id);
    assert.ok(!newest50.includes("r0b"), "fixture: person 0's readings are outside the newest 50");
    const all = assembleReadingsLibrary(profiles, readings, new Map(), { pageSize: 1000 });
    assert.equal(all.rows.find((r) => r.id === "p0")!.latestReadingId, "r0b");
    assert.ok(all.rows.every((r) => r.latestReadingId), "nobody looks empty");
  });
  await check("25 per page; pages don't overlap and cover everyone; page is clamped", () => {
    assert.equal(READINGS_LIBRARY_PAGE_SIZE, 25);
    const pages = [1, 2, 3].map((page) => assembleReadingsLibrary(profiles, readings, new Map(), { page }));
    assert.deepEqual(pages.map((p) => p.rows.length), [25, 25, 10]);
    assert.ok(pages.every((p) => p.pageCount === 3 && p.total === 60));
    const ids = pages.flatMap((p) => p.rows.map((r) => r.id));
    assert.equal(new Set(ids).size, 60);
    assert.equal(assembleReadingsLibrary(profiles, readings, new Map(), { page: 99 }).page, 3);
    assert.equal(normalizeLibraryPage("0"), 1);
    assert.equal(normalizeLibraryPage("x"), 1);
    assert.equal(normalizeLibraryPage("4"), 4);
    assert.deepEqual(libraryPageWindow(1, 3), [1, 2, 3]);
    assert.deepEqual(libraryPageWindow(6, 10), [4, 5, 6, 7, 8]);
    assert.deepEqual(libraryPageWindow(10, 10), [6, 7, 8, 9, 10]);
  });
  await check("sort: recent (newest reading first, no-reading people last), name A→Z, Z→A", () => {
    const withEmpty = [...profiles.slice(0, 3), { id: "pz", name: "Aaron NoReading", contactId: "cz" }];
    const r = assembleReadingsLibrary(withEmpty, readings.filter((x) => ["p0", "p1", "p2"].includes(x.profileId!)), new Map());
    assert.deepEqual(r.rows.map((x) => x.id), ["p2", "p1", "p0", "pz"]);
    assert.equal(r.rows[3].latestReadingId, null);
    assert.deepEqual(assembleReadingsLibrary(withEmpty, [], new Map(), { sort: "name_asc" }).rows.map((x) => x.id)[0], "pz");
    assert.deepEqual(assembleReadingsLibrary(withEmpty, [], new Map(), { sort: "name_desc" }).rows.map((x) => x.id)[0], "p2");
    assert.equal(normalizeLibrarySort("bogus"), "recent");
  });
  await check("two Profiles under one Contact stay two distinct rows", () => {
    const kids: LibraryProfileInput[] = [
      { id: "k1", name: "Mia Parent", contactId: "parent" },
      { id: "k2", name: "Leo Parent", contactId: "parent" },
    ];
    const r = assembleReadingsLibrary(kids, [
      { id: "kr1", profileId: "k1", contactId: "parent", name: "Mia Parent", createdAt: iso(1) },
      { id: "kr2", profileId: "k2", contactId: "parent", name: "Leo Parent", createdAt: iso(2) },
    ], new Map());
    assert.deepEqual(r.rows.map((x) => [x.id, x.latestReadingId]), [["k2", "kr2"], ["k1", "kr1"]]);
  });
  await check("a legacy reading with no Profile gets its own row (kind 'reading') — never hidden", () => {
    const r = assembleReadingsLibrary(profiles.slice(0, 1), [
      ...readings.slice(0, 2),
      { id: "legacy", profileId: null, contactId: "cx", name: "Old Reading", createdAt: iso(500) },
      { id: "dangling", profileId: "deleted-profile", contactId: "cy", name: "Dangling", createdAt: iso(400) },
    ], new Map());
    assert.deepEqual(r.rows.map((x) => [x.kind, x.id, x.latestReadingId]), [["reading", "legacy", "legacy"], ["reading", "dangling", "dangling"], ["profile", "p0", "r0b"]]);
  });

  console.log("\nSearch + privacy");
  await check("search matches the person's name and their Contact's name — never birth place or relationship", () => {
    // Inputs carrying extra birth fields (as raw docs would) — the library must not use them.
    const raw = profiles.slice(0, 3).map((p) => ({ ...p, birthPlace: "Austin, Texas", birthDate: "1985-03-09", relationshipLabel: "daughter" }));
    const names = new Map([["c1", "Jordan Guardian"]]);
    assert.equal(assembleReadingsLibrary(raw, readings, names, { q: "person 02" }).total, 1);
    assert.equal(assembleReadingsLibrary(raw, readings, names, { q: "guardian" }).rows[0].id, "p1");
    for (const q of ["austin", "texas", "1985", "daughter"]) assert.equal(assembleReadingsLibrary(raw, readings, names, { q }).total, 0, q);
  });
  await check("row objects carry no birth/location/relationship field at all", () => {
    const raw = profiles.slice(0, 2).map((p) => ({ ...p, birthPlace: "Austin, Texas", birthDate: "1985-03-09", birthTime: "09:00", timeZone: "America/Chicago", lat: 30, lng: -97, relationshipLabel: "daughter" }));
    const row = assembleReadingsLibrary(raw, readings, new Map()).rows[0];
    assert.deepEqual(Object.keys(row).sort(), ["contactId", "id", "kind", "latestReadingId", "name"]);
  });
  await check("Sun sign comes from the reading's Sun placement", () => {
    assert.equal(sunSignOf([{ body: "moon", sign: "Leo" }, { body: "sun", sign: "Virgo" }]), "Virgo");
    assert.equal(sunSignOf(null), null);
    assert.equal(sunSignOf([{ body: "moon", sign: "Leo" }]), null);
  });

  console.log("\nServer service (fake Firestore)");
  await check("field-projected reads, equality-only queries (no limit/orderBy → no index), contacts only when searching, tenancy re-checked", async () => {
    const log: string[] = [];
    const fake = makeFakeDb(log);
    const page = await listReadingsLibrary("sa1", { page: 1 }, fake);
    // Every person shows up with real chart data; the other tenant's doc is ignored.
    assert.equal(page.total, 2);
    const staff = page.rows.find((r) => r.name === "Staff QA Test")!;
    assert.deepEqual([staff.energyType, staff.hdProfile, staff.sunSign, staff.latestReadingId], ["Projector", "4/6", "Virgo", "rStaffNew"]);
    const ethan = page.rows.find((r) => r.name === "ethan ross")!;
    assert.deepEqual([ethan.energyType, ethan.sunSign], [null, null], "cross-tenant summary doc is never used");
    assert.ok(!log.some((l) => l.startsWith("getAll contacts")), "no Contact reads without a search");
    const projections = log.filter((l) => l.startsWith("select") || l.startsWith("getAll"));
    for (const banned of ["birthDate", "birthTime", "birthPlace", "timeZone", "lat", "lng", "relationshipLabel", "email", "phone"]) {
      assert.ok(!projections.some((l) => l.split(/[ ,]/).includes(banned)), `${banned} is never fetched for the list`);
    }
    await listReadingsLibrary("sa1", { q: "guardian" }, fake);
    assert.ok(log.some((l) => l === "getAll contacts mask=subAccountId,name,firstName,lastName"), "search reads only Contact name fields");
    const searched = await listReadingsLibrary("sa1", { q: "guardian" }, fake);
    assert.deepEqual(searched.rows.map((r) => r.name), ["Staff QA Test"]);
    assert.equal((await listReadingsLibrary("sa1", { q: "austin" }, fake)).total, 0, "birth place is not searchable");
  });

  console.log("\nReading origin (forward-only)");
  await check("origin values: staff + public_decoder today, future paths reserved", () => {
    assert.deepEqual([...READING_ORIGINS], ["staff", "public_decoder", "purchase", "offer", "lead_magnet", "automation", "other"]);
  });
  await check("routes set origin server-side (after the body spread); service stores createdByUid for staff only; no backfill", () => {
    const staff = readFileSync("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/readings/route.ts", "utf8");
    assert.ok(staff.indexOf('origin: "staff"') > staff.indexOf("...body"), "a request body can't override origin");
    const pub = readFileSync("src/app/api/decoder/[saId]/submit/route.ts", "utf8");
    assert.ok(pub.indexOf('origin: "public_decoder"') > pub.indexOf("...publicInput"));
    const svc = readFileSync("src/lib/server/energetic-decoder-service.ts", "utf8");
    assert.ok(svc.includes("origin: input.origin,"));
    assert.ok(svc.includes('...(input.origin === "staff" && input.createdByUid ? { createdByUid: input.createdByUid } : {}),'));
    assert.ok(!/origin[^\n]*\.update\(|backfill/i.test(readFileSync("src/lib/server/readings-library-service.ts", "utf8")), "nothing writes origin onto old readings");
  });

  console.log("\nRoutes");
  await check("library endpoint is served by the consolidated dispatcher; reports + readings can scope to a Profile", () => {
    execSync("node scripts/gen-api-dispatch.mjs --check", { stdio: "pipe" });
    const d = readFileSync("src/app/api/sub-accounts/[id]/energetic-decoder/[[...path]]/route.ts", "utf8");
    assert.ok(d.includes('["library", h'));
    assert.ok(readFileSync("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/generated-reports/route.ts", "utf8").includes("listGeneratedReportsForProfile(subAccountId, profileId)"));
    const gr = readFileSync("src/lib/server/generated-report-service.ts", "utf8");
    const fn = gr.slice(gr.indexOf("export async function listGeneratedReportsForProfile"), gr.indexOf("export async function getGeneratedReport("));
    assert.ok(fn.includes('.where("subAccountId", "==", subAccountId)') && fn.includes('.where("profileId", "==", profileId)'), "reports resolve through this Profile's readings in this sub-account only");
    assert.ok(fn.includes("listGeneratedReports(subAccountId, { readingId: d.id })"));
    assert.ok(!/orderBy|\.limit\(/.test(fn));
  });

  console.log(`\n${passed} checks passed.`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

// ── fake Firestore ───────────────────────────────────────────────────

function makeFakeDb(log: string[]): FirebaseFirestore.Firestore {
  const data: Record<string, Record<string, Record<string, unknown>>> = {
    energeticProfiles: {
      pStaff: { subAccountId: "sa1", name: "Staff QA Test", contactId: "cStaff", birthPlace: "Austin, Texas", birthDate: "1985-03-09", relationshipLabel: "self" },
      pEthan: { subAccountId: "sa1", name: "ethan ross", contactId: "cEthan", birthPlace: "Austin, Texas" },
      pOther: { subAccountId: "sa2", name: "Other Tenant", contactId: "cOther" },
    },
    energeticDecoderReadings: {
      rStaffOld: { subAccountId: "sa1", profileId: "pStaff", contactId: "cStaff", name: "Staff QA Test", createdAt: "2026-01-01T00:00:00.000Z", humanDesign: { type: "Generator", profile: "1/3" } },
      rStaffNew: { subAccountId: "sa1", profileId: "pStaff", contactId: "cStaff", name: "Staff QA Test", createdAt: "2026-02-01T00:00:00.000Z", birthPlace: "Austin, Texas", humanDesign: { type: "Projector", profile: "4/6" }, astrology: { placements: [{ body: "sun", sign: "Virgo" }] } },
      // pEthan's latest reading id points at a doc that belongs to another tenant (defensive)
      rEthan: { subAccountId: "sa2", profileId: "pEthan", contactId: "cEthan", name: "ethan ross", createdAt: "2026-03-01T00:00:00.000Z", humanDesign: { type: "Reflector", profile: "3/5" } },
      rOther: { subAccountId: "sa2", profileId: "pOther", contactId: "cOther", name: "Other Tenant", createdAt: "2026-03-01T00:00:00.000Z" },
    },
    contacts: {
      cStaff: { subAccountId: "sa1", name: "Jordan Guardian", email: "x@y.z" },
      cEthan: { subAccountId: "sa1", name: "ethan ross" },
    },
  };
  const project = (doc: Record<string, unknown>, fields: string[]) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = f.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), doc);
      if (v !== undefined) out[f] = v;
    }
    return out;
  };
  const snap = (col: string, id: string, fields: string[]) => {
    const doc = data[col][id];
    const p = doc ? project(doc, fields) : {};
    return { id, exists: !!doc, get: (f: string) => p[f] };
  };
  // The library's own query for rEthan ignores the doc's tenant on purpose, so put rEthan's
  // query-time subAccountId under sa1 (it was "found" by profile grouping) but keep the doc as sa2.
  const queryTenant: Record<string, string> = { rEthan: "sa1" };
  return {
    collection(col: string) {
      return {
        where(field: string, op: string, value: unknown) {
          assert.equal(field, "subAccountId");
          assert.equal(op, "==");
          const q = {
            select(...fields: string[]) {
              log.push(`select ${col} ${fields.join(",")}`);
              return {
                get: async () => ({
                  docs: Object.entries(data[col])
                    .filter(([id, d]) => (queryTenant[id] ?? d.subAccountId) === value)
                    .map(([id]) => snap(col, id, fields)),
                }),
              };
            },
            orderBy() { throw new Error("orderBy used — would need a composite index"); },
            limit() { throw new Error("limit used — the library must see every reading"); },
            get() { throw new Error("unprojected read"); },
          };
          return q;
        },
        doc(id: string) {
          return { __col: col, id };
        },
      };
    },
    async getAll(...args: unknown[]) {
      const opts = args.pop() as { fieldMask: string[] };
      const refs = args as { __col: string; id: string }[];
      log.push(`getAll ${refs[0].__col} mask=${opts.fieldMask.join(",")}`);
      return refs.map((r) => snap(r.__col, r.id, opts.fieldMask));
    },
  } as unknown as FirebaseFirestore.Firestore;
}
