/**
 * Frequency deferral (2026-10-11) — owner decision: Frequency is "Coming
 * soon". New-entry actions are closed, Human Design + Astrology stay fully
 * usable, and every stored Frequency record stays exactly as it was.
 *
 * Part 1 — source guards + pure checks (always run).
 * Part 2 — the REAL createEnergeticDecoderReading against the Firestore
 * emulator: new readings store no spheres but keep HD + Astrology, a
 * historical Frequency reading is byte-identical afterwards, and a
 * configuration with nothing left to include is refused before any
 * Contact/Profile write. Runs only when FIRESTORE_EMULATOR_HOST is set with
 * a demo-* project and no production credential.
 *
 * Run (pure only):
 *   NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx scripts/check-frequency-coming-soon.ts
 * Run (with emulator — swisseph-wasm can't load under tsx, so it is stubbed
 * via the existing check shim; the service already falls back for Chiron +
 * the high-precision node, and Frequency gating doesn't depend on either):
 *   firebase emulators:exec --only firestore --project demo-frequency-soon \
 *     "NODE_OPTIONS='--require ./scripts/_chart-design-check-shim.cjs' pnpm exec tsx scripts/check-frequency-coming-soon.ts"
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FREQUENCY_CHART_PIECE,
  FREQUENCY_COMING_SOON,
  FREQUENCY_COMING_SOON_LABEL,
  FREQUENCY_SHORTCODE_GROUP,
} from "../src/lib/energetics/frequency-availability";
import { SHORTCODE_CATALOG } from "../src/lib/energetics/shortcodes";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
const read = (p: string) => fs.readFileSync(p, "utf8");

const service = read("src/lib/server/energetic-decoder-service.ts");
const config = read("src/components/energetic-decoder/reading-configuration.tsx");
const workspace = read("src/components/energetic-decoder/human-design-reading-workspace.tsx");
const readingsTab = read("src/components/energetic-decoder/readings-tab.tsx");
const editor = read("src/components/energetic-decoder/report-editor.tsx");
const setEditor = read("src/components/energetic-decoder/content-set-editor.tsx");
const calculate = read("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/calculate/route.ts");
const designRoute = read("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/report-designs/[designId]/route.ts");
const designsRoute = read("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/report-designs/route.ts");

async function main() {
  console.log("\nGate");
  await check("Frequency is Coming soon, with one shared label", () => {
    assert.equal(FREQUENCY_COMING_SOON, true);
    assert.equal(FREQUENCY_COMING_SOON_LABEL, "Coming soon");
  });

  console.log("\nNew-entry actions are closed");
  await check("Reading Configuration: Frequency sequences disabled + Coming soon badge; HD/Astrology toggles unchanged", () => {
    assert.match(config, /disabled=\{FREQUENCY_COMING_SOON \|\| !isAdmin \|\| savingConfig\}/);
    assert.match(config, /!FREQUENCY_COMING_SOON && isAdmin && toggleSequence\(seq\.key\)/);
    assert.match(config, /data-coming-soon>\s*\{FREQUENCY_COMING_SOON_LABEL\}/);
    for (const key of ["includeHumanDesign", "includeAstrology"]) {
      assert.ok(config.includes(`checked={config.${key}}`), `${key} still reflects the saved config`);
      assert.ok(config.includes(`onChange={() => isAdmin && toggleSequence("${key}")}`), `${key} still toggles`);
    }
  });
  await check("new readings skip the Frequency calculation; config is read before any Contact/Profile write", () => {
    assert.match(service, /const includeFrequency =\s*!FREQUENCY_COMING_SOON &&/);
    assert.match(service, /const profile = includeFrequency\s*\? calculateGeneKeysProfile/);
    const configAt = service.indexOf("const reportConfig = {");
    assert.ok(configAt > 0 && configAt < service.indexOf("createContactServerSide({") && configAt < service.indexOf("await createEnergeticProfile("));
    assert.equal(service.match(/const reportConfig = \{/g)?.length, 1, "read once");
    assert.match(service, /Frequency is coming soon\./);
  });
  await check("the Frequency-only calculator API answers 403 Coming soon (after auth)", () => {
    const auth = calculate.indexOf("requireSubAccountMember(request, subAccountId)");
    const gate = calculate.indexOf("if (FREQUENCY_COMING_SOON)");
    assert.ok(auth > 0 && gate > auth);
    assert.match(calculate, /"Frequency is coming soon\." \}, \{ status: 403 \}/);
  });
  await check("Report Builder: Frequency chart piece + Frequency shortcodes are disabled options labelled Coming soon", () => {
    assert.match(editor, /<option value=\{FREQUENCY_CHART_PIECE\} disabled=\{FREQUENCY_COMING_SOON\}>/);
    assert.match(editor, /disabled=\{FREQUENCY_COMING_SOON && s\.group === FREQUENCY_SHORTCODE_GROUP\}/);
    assert.equal(FREQUENCY_CHART_PIECE, "frequency-hologenetic");
    const freq = SHORTCODE_CATALOG.filter((s) => s.group === FREQUENCY_SHORTCODE_GROUP);
    assert.equal(freq.length, 13, "catalog itself is unchanged");
    // 2026-10-12 Charts tool: "human-design-full" became the explicit Full Chart + Bodygraph parts (legacy elements show as Bodygraph).
    for (const piece of ["human-design-full-chart", "human-design-bodygraph", "human-design-mandala", "human-design-gates", "astrology-wheel"]) {
      assert.ok(editor.includes(`<option value="${piece}">`), `${piece} still selectable`);
    }
    assert.ok(SHORTCODE_CATALOG.some((s) => s.group === "Human Design") && SHORTCODE_CATALOG.some((s) => s.group === "Astrology"));
  });
  await check("no Frequency starter template (Template Library templates use no Frequency piece or token)", () => {
    const templates = read("src/lib/energetics/report-templates.batch1.json");
    assert.doesNotMatch(templates, /frequency|life_work|Frequency/);
  });
  await check("Content Set editor: Frequency system tab disabled + Coming soon; ?system=freq falls back to Human Design", () => {
    assert.match(setEditor, /FREQUENCY_COMING_SOON && s\.key === "freq" \?/);
    assert.match(setEditor, /aria-disabled="true"\s*disabled\s*title="Frequency is coming soon"/);
    assert.match(setEditor, /!\(FREQUENCY_COMING_SOON && selection\.system === "freq"\) \? selection\.system : "hd"/);
  });

  console.log("\nHistorical Frequency stays viewable, read-only");
  await check("a reading that has spheres keeps its real Frequency tab + SphereList, with a read-only note", () => {
    assert.match(readingsTab, /if \(selected\.spheres\.length > 0\) list\.push\(\{ key: "frequency", label: "Frequency" \}\)/);
    assert.match(workspace, /data-frequency-saved-note/);
    assert.match(workspace, /<SphereList spheres=\{reading\.spheres\} \/>/);
  });
  await check("a reading without Frequency shows a greyed, non-clickable Coming soon tab", () => {
    assert.match(workspace, /FREQUENCY_COMING_SOON && !availableSystems\.some\(\(s\) => s\.key === "frequency"\)/);
    assert.match(workspace, /disabled\s*title="Frequency is coming soon"\s*data-frequency-coming-soon/);
  });
  await check("renderers + bindings untouched: chart piece, PDF, shortcodes still resolve stored spheres", () => {
    assert.match(read("src/components/energetic-decoder/report-design-viewer.tsx"), /case "frequency-hologenetic":/);
    assert.match(read("src/lib/energetics/report-design-pdf-document.tsx"), /case "frequency-hologenetic":/);
    // 2026-10-12: the editor canvas draws charts through the shared Charts-tool preview.
    assert.match(read("src/components/energetic-decoder/report-chart-preview.tsx"), /if \(p === "frequency-hologenetic"\) return <GeneKeysChart/);
    assert.match(editor, /<ReportChartPreview /);
    assert.match(read("src/lib/energetics/shortcodes.ts"), /case "frequency_content":/);
  });

  console.log("\nContent Sets");
  await check("the hard-coded “Owner Review — Blank Frequency” entry is gone from the picker", () => {
    assert.doesNotMatch(editor, /local-review-custom|Owner Review/);
    assert.match(editor, /\{ id: "default", name: "Default" \},\s*\.\.\.\(d\.sets/);
  });
  await check("an unknown saved id shows as Unavailable instead of silently showing another set", () => {
    assert.match(editor, /!sets\.some\(\(s\) => s\.id === contentSetId\) && \(\s*<option value=\{contentSetId\} disabled>/);
  });
  await check("both Report Design save routes validate contentSetId before writing; the editor shows the server's message", () => {
    for (const src of [designRoute, designsRoute]) assert.match(src, /await assertContentSetSelectable\(subAccountId,/);
    assert.ok(designRoute.indexOf("assertContentSetSelectable(") < designRoute.indexOf("updateReportDesign(subAccountId"));
    assert.ok(designsRoute.indexOf("assertContentSetSelectable(") < designsRoute.indexOf("createReportDesign({"));
    assert.match(editor, /toast\.error\(err instanceof Error && err\.message \? err\.message : "Couldn’t save report design\."\)/);
  });

  // ── Part 2: real reading creation against the emulator ────────────────
  const PROJECT = process.env.GCLOUD_PROJECT ?? "";
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.log("\n(emulator section skipped — FIRESTORE_EMULATOR_HOST not set)");
  } else {
    if (!PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.error("Refusing to run: needs a demo-* project and no production credentials.");
      process.exit(2);
    }
    for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "OPENROUTER_API_KEY", "VAPID_PRIVATE_KEY", "STRIPE_SECRET_KEY"]) delete process.env[k];
    const { initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    initializeApp({ projectId: PROJECT });
    const db = getFirestore();
    db.settings({ ignoreUndefinedProperties: true });
    const { createEnergeticDecoderReading } = await import("../src/lib/server/energetic-decoder-service");

    await db.doc("subAccounts/sa1").set({ agencyId: "ag1", name: "Studio", status: "active" });
    const sphere = (name: string, gate: number) => ({ sphere: name, gate, line: 3, shadow: "S", gift: "G", siddhi: "X", showsUp: "shows", giftText: "gift" });
    const historical = {
      subAccountId: "sa1", agencyId: "ag1", contactId: "c-old", profileId: "p-old", system: "geneKeys", name: "Old Client",
      birthDate: "1990-01-01", birthTime: "12:00", birthPlace: "Austin, TX", timeZone: "America/Chicago",
      spheres: ["Life's Work", "Evolution", "Radiance", "Purpose"].map((n, i) => sphere(n, i + 10)),
      humanDesign: null, astrology: null, origin: "staff",
    };
    await db.doc("energeticDecoderReadings/old1").set(historical);
    const before = (await db.doc("energeticDecoderReadings/old1").get()).data();

    const input = {
      subAccountId: "sa1", agencyId: "ag1", createdByUid: "u1", origin: "staff" as const,
      name: "New Client", email: "new@example.com", birthDate: "1992-05-17", birthTime: "08:30",
      birthPlace: "Austin, TX", lat: 30.2672, lng: -97.7431, timeZone: "America/Chicago",
    };

    await check("emulator: a new reading stores no Frequency spheres but keeps Human Design + Astrology (all toggles on)", async () => {
      const res = await createEnergeticDecoderReading(input as Parameters<typeof createEnergeticDecoderReading>[0]);
      assert.ok(!("error" in res), "error" in res ? res.error : "");
      if ("error" in res) return;
      const stored = (await db.doc(`energeticDecoderReadings/${res.reading.id}`).get()).data()!;
      assert.deepEqual(stored.spheres, []);
      assert.ok(stored.humanDesign?.type, "Human Design computed");
      assert.ok(stored.astrology, "Astrology computed");
    });
    await check("emulator: the historical Frequency reading is untouched", async () => {
      assert.deepEqual((await db.doc("energeticDecoderReadings/old1").get()).data(), before);
    });
    await check("emulator: HD + Astrology both off (Frequency only) is refused before any Contact or Profile write", async () => {
      await db.doc("subAccounts/sa1").set(
        { energeticDecoderReportConfig: { includeActivation: true, includeVenus: true, includePearl: true, includeHumanDesign: false, includeAstrology: false } },
        { merge: true },
      );
      const contactsBefore = (await db.collection("contacts").get()).size;
      const readingsBefore = (await db.collection("energeticDecoderReadings").get()).size;
      const res = await createEnergeticDecoderReading({ ...input, email: "another@example.com" } as Parameters<typeof createEnergeticDecoderReading>[0]);
      assert.ok("error" in res && /Frequency is coming soon/.test(res.error));
      assert.equal((await db.collection("contacts").get()).size, contactsBefore);
      assert.equal((await db.collection("energeticDecoderReadings").get()).size, readingsBefore);
    });
    await check("emulator: HD only still works", async () => {
      await db.doc("subAccounts/sa1").set({ energeticDecoderReportConfig: { includeHumanDesign: true, includeAstrology: false } }, { merge: true });
      const res = await createEnergeticDecoderReading({ ...input, email: "hd@example.com" } as Parameters<typeof createEnergeticDecoderReading>[0]);
      assert.ok(!("error" in res));
      if ("error" in res) return;
      const stored = (await db.doc(`energeticDecoderReadings/${res.reading.id}`).get()).data()!;
      assert.deepEqual(stored.spheres, []);
      assert.ok(stored.humanDesign?.type);
      assert.equal(stored.astrology, null);
    });
  }

  console.log(`\n${passed} checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
