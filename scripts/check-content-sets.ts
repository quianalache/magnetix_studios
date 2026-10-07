/**
 * Content Sets (2026-10-07) — data-side checks for Energetic Decoder →
 * Content: the pure model (schemas, validation, entry states, progress,
 * no-fallback resolution, missing-content detection, export/import) and the
 * server service against an in-memory Firestore (virtual Default over the
 * legacy override collections, independent copies, usage from real Report
 * Design references, delete guards, tenancy, no writes outside the
 * expected collections).
 *
 * Pure + a fake Firestore — no emulator, no network.
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-content-sets.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONTENT_CATEGORIES,
  CONTENT_SET_DESCRIPTION_MAX,
  buildContentSetExport,
  categorySchema,
  contentNeededForReading,
  entryState,
  missingContentForReading,
  parseContentEntryId,
  parseContentSetImport,
  resolveEntryForReport,
  systemProgress,
  validateContentSetMeta,
  validateEntryInput,
  type ContentEntryValues,
} from "../src/lib/energetic-decoder/content-sets";
import {
  ContentSetError,
  createContentSet,
  deleteContentSet,
  duplicateContentSet,
  exportContentSet,
  getContentSet,
  getContentSetUsage,
  importContentSet,
  listContentSets,
  loadDefaultLibrary,
  resetContentEntry,
  saveContentEntry,
  updateContentSetMeta,
} from "../src/lib/server/content-set-service";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function rejects(p: Promise<unknown>, status: number, re?: RegExp) {
  try {
    await p;
  } catch (err) {
    assert.ok(err instanceof ContentSetError, `expected ContentSetError, got ${String(err)}`);
    assert.equal(err.status, status, err.message);
    if (re) assert.match(err.message, re);
    return;
  }
  assert.fail("expected a rejection");
}

const caller = { uid: "u1", email: "owner@example.com", agencyId: "ag1" };

(async () => {
  console.log("\nModel");
  await check("only real categories are listed; the retired 'skill' category is not offered", () => {
    assert.ok(CONTENT_CATEGORIES.every((c) => c.fields.length > 0));
    assert.equal(categorySchema("hd:skill"), undefined);
    assert.deepEqual(
      [...new Set(CONTENT_CATEGORIES.map((c) => c.system))],
      ["hd", "astro", "freq"],
    );
  });
  await check("richer fields are preserved (Centers defined/undefined/headline, Gates shadow/gift, Types strategy)", () => {
    assert.deepEqual(categorySchema("hd:center")!.fields.map((f) => f.key), ["definedText", "undefinedText", "strengthHeadline"]);
    assert.deepEqual(categorySchema("freq:gate")!.fields.map((f) => f.key), ["showsUp", "giftText"]);
    assert.deepEqual(categorySchema("hd:type")!.fields.map((f) => f.key), ["strategy", "description"]);
  });
  await check("entry ids parse back to their canonical keys", () => {
    assert.deepEqual(parseContentEntryId("hd:type:Manifesting Generator"), { system: "hd", category: "type", key: "Manifesting Generator", categoryId: "hd:type" });
    assert.equal(parseContentEntryId("nope"), null);
  });
  await check("meta: name required, description ≤ 100 refused (never truncated), 'Default' reserved", () => {
    assert.equal(validateContentSetMeta({ name: " " }).ok, false);
    const long = "x".repeat(CONTENT_SET_DESCRIPTION_MAX + 1);
    const r = validateContentSetMeta({ name: "Career", description: long });
    assert.equal(r.ok, false);
    assert.ok(validateContentSetMeta({ name: "Career", description: "x".repeat(100) }).ok);
    assert.equal(validateContentSetMeta({ name: "default" }).ok, false);
  });
  await check("entry input: unknown fields and over-length text refused; Default requires every field; Default has no custom term", () => {
    const type = categorySchema("hd:type")!;
    assert.equal(validateEntryInput(type, { fields: { salesStyle: "x" } }, { requireAll: false, allowLabel: true }).ok, false);
    assert.equal(validateEntryInput(type, { fields: { strategy: "x".repeat(301) } }, { requireAll: false, allowLabel: true }).ok, false);
    assert.equal(validateEntryInput(type, { fields: { strategy: "To respond" } }, { requireAll: true, allowLabel: false }).ok, false);
    assert.equal(validateEntryInput(type, { label: "Doer", fields: { strategy: "a", description: "b" } }, { requireAll: true, allowLabel: false }).ok, false);
    const ok = validateEntryInput(type, { label: " Doer ", fields: { strategy: " a " } }, { requireAll: false, allowLabel: true });
    assert.ok(ok.ok && ok.label === "Doer" && ok.fields.strategy === "a" && ok.fields.description === "");
  });
  await check("entry states are distinct from Active/Draft and from each other", () => {
    const s = categorySchema("hd:type")!;
    const def: ContentEntryValues = { fields: { strategy: "S", description: "D" } };
    assert.equal(entryState(s, undefined, def, { isDefaultSet: false }), "not_started");
    assert.equal(entryState(s, { fields: { strategy: "S" } }, def, { isDefaultSet: false }), "needs_content");
    assert.equal(entryState(s, { fields: { strategy: "S", description: "D" } }, def, { isDefaultSet: false }), "complete");
    assert.equal(entryState(s, { fields: { strategy: "S", description: "Mine" } }, def, { isDefaultSet: false }), "customized");
    assert.equal(entryState(s, { label: "Doer", fields: { strategy: "S", description: "D" } }, def, { isDefaultSet: false }), "customized");
    assert.equal(entryState(s, def, def, { isDefaultSet: true }), "complete");
    assert.equal(entryState(s, def, def, { isDefaultSet: true, defaultCustomized: true }), "customized");
  });
  await check("system progress counts Complete + Customized only", () => {
    assert.deepEqual(systemProgress(["complete", "customized", "needs_content", "not_started"]), { done: 2, total: 4, label: "In progress" });
    assert.equal(systemProgress(["not_started"]).label, "Not started");
    assert.equal(systemProgress(["complete"]).label, "Complete");
  });
  await check("report resolution has NO fallback: blank stays blank; custom term replaces only the label", () => {
    const e = { id: "hd:type:Generator", system: "hd" as const, category: "type", key: "Generator", canonicalLabel: "Generator" };
    const r = resolveEntryForReport(e, { label: "Builder", fields: { strategy: "", description: "Mine" } });
    assert.deepEqual(r, { canonical: "Generator", label: "Builder", fields: { strategy: "", description: "Mine" } });
    const blank = resolveEntryForReport(e, undefined);
    assert.deepEqual(blank.fields, {});
    assert.equal(blank.label, "Generator");
  });
  const reading = {
    humanDesign: { type: "Generator", authority: "Sacral", profile: "2/4", definedCenters: ["sacral"], openCenters: ["head"], variables: { digestion: { value: "Direct" } } },
    astrology: { placements: [{ body: "sun", sign: "Leo", house: 5 }, { body: "moon", sign: "Aries", house: 1 }], angles: { ascendant: { sign: "Virgo" } }, aspects: [{ type: "Trine" }] },
    spheres: [{ gate: 12 }],
  };
  await check("content needed for a reading covers type/authority/lines/centers/variables/signs/house/aspect/gates", () => {
    const ids = new Set(contentNeededForReading(reading).map((n) => `${n.entryId}#${n.field}`));
    for (const k of [
      "hd:type:Generator#strategy", "hd:authority:Sacral#description", "hd:line:2#name", "hd:line:4#name",
      "hd:center:sacral#definedText", "hd:center:head#undefinedText", "hd:digestion:Direct#description",
      "astro:sign:Leo#description", "astro:sign:Aries#description", "astro:sign:Virgo#description",
      "astro:house:5#theme", "astro:aspect:Trine#description", "freq:gate:12#showsUp", "freq:gate:12#giftText",
    ]) assert.ok(ids.has(k), k);
  });
  await check("missing content lists every blank needed field (the pre-generation warning) and fills nothing", () => {
    const vals = new Map<string, ContentEntryValues>([["hd:type:Generator", { fields: { strategy: "S", description: "" } }]]);
    const missing = missingContentForReading(reading, (id) => vals.get(id));
    assert.ok(missing.some((m) => m.entryId === "hd:type:Generator" && m.field === "description"));
    assert.ok(!missing.some((m) => m.entryId === "hd:type:Generator" && m.field === "strategy"));
    assert.equal(vals.get("hd:type:Generator")!.fields.description, "", "nothing was filled in");
  });
  await check("export omits blanks; import validates, skips unknown entries, refuses bad files and never accepts 'Default' as a name", () => {
    const file = buildContentSetExport({ name: "Career", description: "d" }, new Map([
      ["hd:type:Generator", { label: "Builder", fields: { strategy: "S", description: "" } }],
      ["hd:type:Projector", { fields: { strategy: "", description: "" } }],
    ]));
    assert.deepEqual(Object.keys(file.entries), ["hd:type:Generator"]);
    assert.deepEqual(file.entries["hd:type:Generator"], { label: "Builder", fields: { strategy: "S" } });
    const known = new Set(["hd:type:Generator"]);
    const ok = parseContentSetImport({ ...file, entries: { ...file.entries, "hd:digestion:Unseen": { fields: { description: "x" } } } }, known);
    assert.ok(ok.ok);
    assert.equal(ok.recognized, 1);
    assert.deepEqual(ok.skipped, ["hd:digestion:Unseen"]);
    assert.equal(parseContentSetImport({ format: "other" }, known).ok, false);
    const over = parseContentSetImport({ ...file, entries: { "hd:type:Generator": { fields: { strategy: "x".repeat(400) } } } }, known);
    assert.equal(over.ok, false);
    assert.equal(parseContentSetImport({ ...file, name: "Default" }, known).name, "Default (imported)");
  });

  console.log("\nServer service (fake Firestore)");
  const db = makeFakeDb();
  // Legacy workspace content: one HD override, one gate override, one platform Variable.
  db.seed("bodygraphVariableDefaults/digestion:Direct", { category: "digestion", value: "Direct", description: "Eat one thing at a time." });
  db.seed("bodygraphVariableDefaults/skill:Old", { category: "skill", value: "Old", description: "Retired." });
  db.seed("subAccounts/sa1/energeticDecoderChartContent/hd:type:Generator", { strategy: "Respond", description: "My Generator text", updatedAt: ts("2026-09-01") });
  db.seed("subAccounts/sa1/energeticDecoderGateContent/12", { showsUp: "My shadow", giftText: "My gift", updatedAt: ts("2026-09-02") });
  db.seed("reportDesigns/rd1", { subAccountId: "sa1", title: "Main report", pages: [] });
  db.seed("reportDesigns/rd2", { subAccountId: "sa1", title: "Career report", pages: [], contentSetId: "PLACEHOLDER" });
  db.seed("reportDesigns/rdX", { subAccountId: "sa2", title: "Other workspace", pages: [] });

  await check("Default is virtual over the legacy library: overrides merged, shipped text elsewhere, 'skill' left untouched", async () => {
    const def = await loadDefaultLibrary("sa1", db);
    assert.equal(def.values.get("hd:type:Generator")!.fields.description, "My Generator text");
    assert.ok(def.customized.has("hd:type:Generator"));
    assert.equal(def.values.get("freq:gate:12")!.fields.showsUp, "My shadow");
    assert.ok(def.values.get("freq:gate:1")!.fields.showsUp.length > 0, "shipped gate text");
    assert.equal(def.values.get("hd:digestion:Direct")!.fields.description, "Eat one thing at a time.");
    assert.ok(!def.catalog.some((e) => e.category === "skill"));
    assert.equal(def.catalog.filter((e) => e.category === "gate").length, 64);
    assert.equal(def.updatedAt, "2026-09-02T00:00:00.000Z");
  });
  await check("library: Default first (Active, built-in) with only Default seeded — no other sets created", async () => {
    const sets = await listContentSets("sa1", db);
    assert.deepEqual(sets.map((s) => s.name), ["Default"]);
    assert.equal(sets[0].isDefault, true);
    assert.equal(sets[0].status, "active");
    assert.equal(db.paths().filter((p) => p.startsWith("energeticDecoderContentSets/")).length, 0, "listing writes nothing");
  });
  await check("usage = real Report Design references; designs without a set count for Default; other workspaces never counted", async () => {
    const usage = await getContentSetUsage("sa1", "default", db);
    assert.deepEqual(usage.reportDesigns.map((d) => d.title), ["Main report"]);
    assert.equal(usage.implicit, true);
  });

  let careerId = "";
  await check("create from Default = independent Draft copy; later Default edits don't reach it", async () => {
    const set = await createContentSet("sa1", caller, { name: "Business & Career", description: "Career wording", startFrom: "default" }, db);
    careerId = set.id;
    assert.equal(set.status, "draft");
    const detail = await getContentSet("sa1", careerId, db);
    assert.equal(detail.values["hd:type:Generator"].fields.description, "My Generator text");
    await saveContentEntry("sa1", caller, "default", "hd:type:Generator", { fields: { strategy: "Respond", description: "Changed later" } }, db);
    const again = await getContentSet("sa1", careerId, db);
    assert.equal(again.values["hd:type:Generator"].fields.description, "My Generator text", "copy is independent");
    assert.equal(again.states["hd:type:Generator"], "customized", "differs from Default now");
  });
  await check("create: duplicate names refused (409), over-long description refused (400)", async () => {
    await rejects(createContentSet("sa1", caller, { name: "business & career", startFrom: "blank" }, db), 409);
    await rejects(createContentSet("sa1", caller, { name: "X", description: "y".repeat(101), startFrom: "blank" }, db), 400);
  });
  let blankId = "";
  await check("create Blank: nothing written, every entry Not started; blanks stay blank (no fallback)", async () => {
    blankId = (await createContentSet("sa1", caller, { name: "Spanish", startFrom: "blank" }, db)).id;
    const d = await getContentSet("sa1", blankId, db);
    assert.equal(Object.keys(d.values).length, 0);
    assert.ok(Object.values(d.states).every((s) => s === "not_started"));
    assert.ok(d.defaults["hd:type:Generator"], "Default text available only as a reference");
  });
  await check("custom set saves: partial fields allowed, custom term kept, canonical key unchanged; clearing deletes the entry", async () => {
    await saveContentEntry("sa1", caller, blankId, "hd:type:Generator", { label: "Generador", fields: { strategy: "Responder" } }, db);
    let d = await getContentSet("sa1", blankId, db);
    assert.equal(d.values["hd:type:Generator"].label, "Generador");
    assert.equal(d.states["hd:type:Generator"], "needs_content");
    assert.ok(d.catalog.some((e) => e.id === "hd:type:Generator" && e.canonicalLabel === "Generator"));
    await resetContentEntry("sa1", caller, blankId, "hd:type:Generator", db);
    d = await getContentSet("sa1", blankId, db);
    assert.equal(d.values["hd:type:Generator"], undefined);
  });
  await check("Default saves write the legacy docs (same as the old editor); requires every field; reset deletes the override", async () => {
    await rejects(saveContentEntry("sa1", caller, "default", "hd:type:Projector", { fields: { strategy: "Wait" } }, db), 400, /required/);
    await rejects(saveContentEntry("sa1", caller, "default", "hd:type:Projector", { label: "Guide", fields: { strategy: "a", description: "b" } }, db), 400);
    await saveContentEntry("sa1", caller, "default", "freq:gate:5", { fields: { showsUp: "S5", giftText: "G5" } }, db);
    assert.equal(db.get("subAccounts/sa1/energeticDecoderGateContent/5")!.showsUp, "S5");
    await resetContentEntry("sa1", caller, "default", "hd:type:Generator", db);
    assert.equal(db.get("subAccounts/sa1/energeticDecoderChartContent/hd:type:Generator"), undefined);
  });
  await check("unknown entries and unknown fields are refused", async () => {
    await rejects(saveContentEntry("sa1", caller, careerId, "hd:type:Wizard", { fields: { strategy: "x" } }, db), 404);
    await rejects(saveContentEntry("sa1", caller, careerId, "hd:skill:Old", { fields: { description: "x" } }, db), 404);
    await rejects(saveContentEntry("sa1", caller, careerId, "hd:type:Generator", { fields: { salesStyle: "x" } }, db), 400);
  });
  await check("status Active/Draft is independent of completeness; Default can't be renamed, drafted or deleted", async () => {
    await updateContentSetMeta("sa1", caller, blankId, { status: "active" }, db);
    const d = await getContentSet("sa1", blankId, db);
    assert.equal(d.status, "active");
    assert.ok(Object.values(d.states).every((s) => s === "not_started"));
    await rejects(updateContentSetMeta("sa1", caller, "default", { name: "Mine" }, db), 400);
    await rejects(deleteContentSet("sa1", "default", db), 400);
  });
  await check("duplicate makes an independent '(copy)' Draft", async () => {
    const dup = await duplicateContentSet("sa1", caller, careerId, db);
    assert.equal(dup.name, "Business & Career (copy)");
    assert.equal(dup.status, "draft");
    const d = await getContentSet("sa1", dup.id, db);
    assert.equal(d.values["hd:type:Generator"].fields.description, "My Generator text");
    assert.equal((await duplicateContentSet("sa1", caller, careerId, db)).name, "Business & Career (copy 2)");
  });
  await check("delete is blocked while a Report Design uses the set; allowed once unused (entries removed too)", async () => {
    db.seed("reportDesigns/rd2", { ...db.get("reportDesigns/rd2"), contentSetId: careerId });
    assert.equal((await getContentSetUsage("sa1", careerId, db)).reportDesigns[0].title, "Career report");
    assert.equal((await listContentSets("sa1", db)).find((s) => s.id === careerId)!.usageCount, 1);
    await rejects(deleteContentSet("sa1", careerId, db), 409, /used in 1 report design/);
    db.seed("reportDesigns/rd2", { ...db.get("reportDesigns/rd2"), contentSetId: null });
    await deleteContentSet("sa1", careerId, db);
    assert.equal(db.paths().filter((p) => p.startsWith(`energeticDecoderContentSets/${careerId}`)).length, 0);
  });
  await check("tenancy: another workspace's set reads as 404 everywhere", async () => {
    await rejects(getContentSet("sa2", blankId, db), 404);
    await rejects(saveContentEntry("sa2", caller, blankId, "hd:type:Generator", { fields: { strategy: "x" } }, db), 404);
    await rejects(deleteContentSet("sa2", blankId, db), 404);
    await rejects(getContentSetUsage("sa2", blankId, db), 404);
    assert.deepEqual((await listContentSets("sa2", db)).map((s) => s.name), ["Default"]);
  });
  await check("export → import round-trip creates a NEW Draft set; preview writes nothing", async () => {
    await saveContentEntry("sa1", caller, blankId, "astro:sign:Leo", { label: "León", fields: { description: "Texto" } }, db);
    const file = await exportContentSet("sa1", blankId, db);
    const before = db.paths().length;
    const prev = await importContentSet("sa1", caller, file, { commit: false }, db);
    assert.equal(prev.preview.ok, true);
    assert.equal(db.paths().length, before, "preview is read-only");
    await rejects(importContentSet("sa1", caller, file, { commit: true }, db), 409, /already exists/);
    const res = await importContentSet("sa1", caller, file, { commit: true, name: "Spanish 2" }, db);
    assert.equal(res.created!.status, "draft");
    const d = await getContentSet("sa1", res.created!.id, db);
    assert.equal(d.values["astro:sign:Leo"].label, "León");
  });
  await check("writes only touch the expected collections (no readings, generated reports or report designs changed)", () => {
    const allowed = [/^energeticDecoderContentSets\//, /^subAccounts\/sa1\/energeticDecoder(Chart|Gate)Content\//, /^reportDesigns\/rd2$/];
    for (const p of db.writes) assert.ok(allowed.some((r) => r.test(p)), `unexpected write ${p}`);
    assert.ok(!db.writes.some((p) => p.startsWith("energeticDecoderReadings") || p.startsWith("generatedReports")));
  });

  console.log("\nSource guards");
  await check("report viewer renders text blocks as escaped text (no dangerouslySetInnerHTML)", () => {
    const src = readFileSync("src/components/energetic-decoder/report-design-viewer.tsx", "utf8");
    assert.ok(!src.includes("dangerouslySetInnerHTML"));
  });
  await check("reading generation still uses the legacy resolver (copy-to-Reading untouched)", () => {
    const src = readFileSync("src/lib/server/energetic-decoder-service.ts", "utf8");
    assert.ok(/resolveReadingContent|resolveGateContent/.test(src));
  });
  await check("content-set routes are admin-gated for writes and member-gated for reads", () => {
    const base = "src/app/api/sub-accounts/[id]/energetic-decoder/_routes/content-sets";
    const read = (p: string) => readFileSync(`${base}/${p}`, "utf8");
    assert.match(read("route.ts"), /POST[\s\S]*requireSubAccountAdmin/);
    assert.match(read("[setId]/route.ts"), /PATCH[\s\S]*requireSubAccountAdmin[\s\S]*DELETE[\s\S]*requireSubAccountAdmin/);
    assert.match(read("[setId]/entries/[entryId]/route.ts"), /requireSubAccountAdmin/);
    assert.match(read("import/route.ts"), /requireSubAccountAdmin/);
  });

  console.log(`\n${passed} checks passed.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

/* eslint-disable @typescript-eslint/no-explicit-any -- a minimal in-memory Firestore fake; typing the Admin SDK surface buys nothing here */
// ── fake Firestore ───────────────────────────────────────────────────

function ts(day: string) {
  const d = new Date(`${day}T00:00:00.000Z`);
  return { toDate: () => d };
}

type Data = Record<string, unknown>;

function makeFakeDb() {
  const store = new Map<string, Data>();
  const writes: string[] = [];
  let auto = 0;
  const now = () => ts("2026-10-07");
  const materialize = (data: Data): Data =>
    Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v && typeof v === "object" && /FieldValue|Transform|Sentinel/.test(v.constructor?.name ?? "") ? now() : v]));

  function docRef(path: string): any {
    const id = path.split("/").pop()!;
    return {
      id,
      path,
      get: async () => snap(path),
      set: async (data: Data, opts?: { merge?: boolean }) => {
        writes.push(path);
        store.set(path, materialize(opts?.merge ? { ...(store.get(path) ?? {}), ...data } : data));
      },
      update: async (data: Data) => {
        if (!store.has(path)) throw new Error(`update of missing ${path}`);
        writes.push(path);
        store.set(path, materialize({ ...store.get(path)!, ...data }));
      },
      delete: async () => {
        writes.push(path);
        store.delete(path);
      },
      collection: (name: string) => colRef(`${path}/${name}`),
    };
  }
  function snap(path: string) {
    const data = store.get(path);
    return { id: path.split("/").pop()!, exists: !!data, data: () => (data ? { ...data } : undefined), get: (f: string) => data?.[f], ref: docRef(path) };
  }
  function colRef(path: string, filters: [string, unknown][] = []): any {
    const depth = path.split("/").length + 1;
    const q = {
      doc: (id?: string) => docRef(`${path}/${id ?? `auto${++auto}`}`),
      where: (f: string, _op: string, v: unknown) => colRef(path, [...filters, [f, v]]),
      select: () => q,
      get: async () => ({
        docs: [...store.keys()]
          .filter((k) => k.startsWith(`${path}/`) && k.split("/").length === depth)
          .filter((k) => filters.every(([f, v]) => store.get(k)![f] === v))
          .sort()
          .map(snap),
      }),
    };
    return q;
  }
  const db: any = {
    collection: (p: string) => colRef(p),
    doc: (p: string) => docRef(p),
    batch: () => {
      const ops: (() => Promise<void>)[] = [];
      return {
        set: (ref: any, data: Data) => ops.push(() => ref.set(data)),
        commit: async () => {
          for (const op of ops) await op();
        },
      };
    },
    recursiveDelete: async (ref: any) => {
      for (const k of [...store.keys()]) if (k === ref.path || k.startsWith(`${ref.path}/`)) {
        writes.push(k);
        store.delete(k);
      }
    },
    seed: (path: string, data: Data) => store.set(path, data),
    get: (path: string) => store.get(path),
    paths: () => [...store.keys()],
    writes,
  };
  return db as FirebaseFirestore.Firestore & { seed: (p: string, d: Data) => void; get: (p: string) => any; paths: () => string[]; writes: string[] };
}
