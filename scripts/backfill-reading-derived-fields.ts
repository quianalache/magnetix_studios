/**
 * Historical Reading normalization (2026-10-21) — fills derived fields that
 * newer Readings receive automatically but Readings created before those
 * fields existed lack. Owner-approved; strictly fill-absent, never overwrite.
 *
 *   Human Design (added 2026-08-09 / 08-11 / 08-12):
 *     strategy, signature, notSelfTheme, designDateUtc, incarnationCross,
 *     incarnationCrossName, incarnationCrossAngle — recomputed by the same
 *     engine (calculateHumanDesignProfile) from the Reading's own saved birth
 *     date/time/zone, and ONLY written when the recomputed chart matches the
 *     saved chart exactly (every activation gate+line, type, authority,
 *     profile, centers, channels). Otherwise the Reading is reported, not
 *     touched.
 *     skills — computeLocalSkills() over the saved chart (+ the cross
 *     name/angle above), the same function new Readings use.
 *     content.lines — the Profile line names, resolveReadingContent(), the
 *     same snapshot new Readings get.
 *   Astrology (added 2026-08-09): the North Node, South Node and Lilith
 *     placements, and the aspects involving them — recomputed from the saved
 *     birth inputs + the original coordinates (the Reading's Profile, else a
 *     same-business Reading with identical birth inputs and identical saved
 *     angles and house cusps — never a fresh geocode) + the saved house system, and ONLY written when every saved placement, angle and
 *     house cusp matches the recomputation and every saved aspect is still
 *     present (the new list is a pure superset).
 *
 * Never touches: birth data, Contact/Profile links, attribution, embed,
 * timestamps, content-set Readings' text, legacy fields, or any field that
 * already has a value. Writes only the listed field paths with update()
 * (no Contact writes, no notifications, no workflows, no webhooks, no counts).
 * Idempotent: a second run finds nothing to fill.
 *
 * Dry run (default — reads only):
 *   NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' node --env-file=.env.local --import tsx scripts/backfill-reading-derived-fields.ts
 * Apply:
 *   …same… scripts/backfill-reading-derived-fields.ts --apply
 */
import { getAdminDb } from "../src/lib/firebase/admin";
import { calculateHumanDesignProfile, type HumanDesignProfile } from "../src/lib/energetics/human-design";
import { calculateAstrologyChart } from "../src/lib/energetics/astrology";
import { computeLocalSkills } from "../src/lib/server/human-design-skills-service";
import { resolveReadingContent } from "../src/lib/server/energetic-decoder-chart-content-service";

const APPLY = process.argv.includes("--apply");
const NEW_ASTRO_BODIES = new Set(["northNode", "southNode", "lilith"]);
const HD_SCALARS = ["strategy", "signature", "notSelfTheme", "designDateUtc", "incarnationCross", "incarnationCrossName", "incarnationCrossAngle"] as const;

type Activation = { body: string; gate: number; line: number };
const actKey = (a: Activation[] | undefined) => (a ?? []).map((x) => `${x.body}:${x.gate}.${x.line}`).sort().join("|");
const absent = (v: unknown) => v === undefined || v === null;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function sameChart(saved: Record<string, unknown>, calc: HumanDesignProfile): string | null {
  if (actKey(saved.personality as Activation[]) !== actKey(calc.personality as Activation[])) return "personality activations differ";
  if (actKey(saved.design as Activation[]) !== actKey(calc.design as Activation[])) return "design activations differ";
  for (const k of ["type", "authority", "profile", "definitionLabel"] as const) {
    if (saved[k] !== calc[k]) return `${k} differs (${String(saved[k])} vs ${String(calc[k])})`;
  }
  if (JSON.stringify(saved.definedCenters) !== JSON.stringify(calc.definedCenters)) return "definedCenters differ";
  const ch = (x: unknown) => ((x as { key: string }[]) ?? []).map((c) => c.key).sort().join(",");
  if (ch(saved.definedChannels) !== ch(calc.definedChannels)) return "definedChannels differ";
  return null;
}

type Placement = { body: string; longitude: number; house?: number | null; sign?: string };
type Aspect = { bodyA: string; bodyB: string; type: string; orb: number };
const aspectId = (x: Aspect) => [x.bodyA, x.bodyB].sort().join("~") + ":" + x.type;

async function main() {
  const db = getAdminDb();
  const snap = await db.collection("energeticDecoderReadings").get();
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const skipped: string[] = [];
  const plans: { id: string; patch: Record<string, unknown>; fields: string[] }[] = [];

  for (const doc of snap.docs) {
    const r = doc.data();
    const label = `${doc.id} (${r.createdAt?.toDate?.().toISOString().slice(0, 10) ?? "?"}, sa ${String(r.subAccountId).slice(0, 6)})`;
    const patch: Record<string, unknown> = {};
    const hd = r.humanDesign as Record<string, unknown> | null | undefined;

    if (hd) {
      const missingScalars = HD_SCALARS.filter((k) => absent(hd[k]));
      const needSkills = absent(hd.skills);
      const content = hd.content as Record<string, unknown> | undefined;
      const needLines = !!content && absent(content.lines);
      if (missingScalars.length || needSkills || needLines) {
        let calc: HumanDesignProfile | null = null;
        try {
          calc = calculateHumanDesignProfile({ date: r.birthDate, time: r.birthTime, timeZone: r.timeZone });
        } catch (err) {
          skipped.push(`${label}: Human Design recompute failed — ${(err as Error).message}`);
        }
        const mismatch = calc ? sameChart(hd, calc) : "no recompute";
        if (calc && !mismatch) {
          for (const k of missingScalars) {
            const v = calc[k];
            if (!absent(v)) { patch[`humanDesign.${k}`] = v; bump(`humanDesign.${k}`); }
          }
          if (needSkills) {
            const merged = { ...(hd as unknown as HumanDesignProfile), ...Object.fromEntries(missingScalars.map((k) => [k, calc![k]])) } as HumanDesignProfile;
            patch["humanDesign.skills"] = await computeLocalSkills(r.subAccountId, merged);
            bump("humanDesign.skills");
          }
        } else if (calc) {
          skipped.push(`${label}: Human Design not touched — recomputed chart doesn't match saved (${mismatch})`);
        }
        if (needLines) {
          if (r.contentSetId && r.contentSetId !== "default") {
            skipped.push(`${label}: content.lines not touched — Reading uses a custom Content Set`);
          } else {
            const resolved = await resolveReadingContent(r.subAccountId, { type: hd.type as never, authority: hd.authority as never });
            if (resolved.humanDesign?.lines && Object.keys(resolved.humanDesign.lines).length) {
              patch["humanDesign.content.lines"] = resolved.humanDesign.lines;
              bump("humanDesign.content.lines");
            }
          }
        }
      }
    }

    const astro = r.astrology as { placements?: Placement[]; aspects?: Aspect[]; angles?: Record<string, { longitude: number }>; houses?: { system: string; cusps: { longitude: number }[] | number[] } } | null | undefined;
    if (astro?.placements) {
      const have = new Set(astro.placements.map((p) => p.body));
      const missingBodies = [...NEW_ASTRO_BODIES].filter((b) => !have.has(b));
      if (missingBodies.length) {
        const coords = await recoverCoordinates(doc.id, r, astro, snap.docs);
        if (!coords) {
          skipped.push(`${label}: Astrology not touched — original coordinates not recoverable from saved data`);
        } else {
          const profile = coords;
          console.log(`  ${label}: coordinates from ${coords.source}`);
          const chiron = astro.placements.find((p) => p.body === "chiron") as (Placement & { retrograde?: boolean }) | undefined;
          const calc = calculateAstrologyChart({
            date: r.birthDate, time: r.birthTime, timeZone: r.timeZone, lat: profile.lat, lng: profile.lng,
            houseSystem: (astro.houses?.system ?? "placidus") as never,
            chironLongitude: chiron?.longitude, chironRetrograde: chiron?.retrograde,
          });
          const byBody = new Map<string, Placement>(calc.placements.map((p) => [p.body as string, p as unknown as Placement]));
          const placementsMatch = astro.placements.every((p) => { const c = byBody.get(p.body); return c && close(c.longitude, p.longitude) && c.house === p.house; });
          const anglesMatch = Object.entries(astro.angles ?? {}).every(([k, v]) => close((calc.angles as Record<string, { longitude: number }>)[k]?.longitude, v.longitude));
          const cuspVal = (c: unknown) => (typeof c === "number" ? c : (c as { longitude: number }).longitude);
          const savedCusps = (astro.houses?.cusps ?? []) as unknown[];
          const calcCusps = (calc.houses.cusps ?? []) as unknown[];
          const cuspsMatch = savedCusps.length === calcCusps.length && savedCusps.every((c, i) => close(cuspVal(c), cuspVal(calcCusps[i])));
          const calcAspects = new Map((calc.aspects as unknown as Aspect[]).map((a) => [aspectId(a), a]));
          // Every saved aspect must still be produced, with the same orb — then the engine list is a pure superset.
          const aspectsSuperset = (astro.aspects ?? []).every((a) => { const c = calcAspects.get(aspectId(a)); return !!c && close(c.orb, a.orb); });
          if (placementsMatch && anglesMatch && cuspsMatch && aspectsSuperset) {
            const added = calc.placements.filter((p) => missingBodies.includes(p.body));
            // Keep the saved entries exactly as stored; append only the missing bodies, in engine order.
            const order = calc.placements.map((p) => p.body);
            patch["astrology.placements"] = [...astro.placements, ...added].sort((a, b) => order.indexOf(a.body as never) - order.indexOf(b.body as never));
            // Superset with identical orbs: the engine list is the saved list plus the new bodies' aspects, in the engine's own order.
            patch["astrology.aspects"] = calc.aspects;
            bump("astrology.placements (+nodes/lilith)");
            bump("astrology.aspects (+aspects to new bodies)");
          } else {
            skipped.push(`${label}: Astrology not touched — recompute doesn't match saved (placements ${placementsMatch}, angles ${anglesMatch}, cusps ${cuspsMatch}, aspects superset ${aspectsSuperset})`);
          }
        }
      }
    }

    if (Object.keys(patch).length) plans.push({ id: doc.id, patch, fields: Object.keys(patch) });
  }

  console.log(`Readings inspected: ${snap.size}`);
  console.log("Proposed field writes:", JSON.stringify(counts, null, 1));
  for (const p of plans) {
    console.log(`  ${p.id}: ${p.fields.join(", ")}`);
    if (process.argv.includes("--show")) console.log("    " + JSON.stringify(p.patch).slice(0, 1200));
  }
  console.log(skipped.length ? `Not touched (${skipped.length}):\n  ${skipped.join("\n  ")}` : "Not touched: none");
  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to write exactly the fields above.");
    return;
  }
  for (const p of plans) await db.doc(`energeticDecoderReadings/${p.id}`).update(p.patch);
  console.log(`\nApplied: ${plans.length} Reading(s) updated.`);
}

/**
 * The exact coordinates the Reading was calculated with — never a fresh
 * geocode. First the Reading's own Profile. Otherwise another Reading in the
 * same business with byte-identical birth date, time, zone and place text
 * whose Profile stores coordinates AND whose saved angles and every house
 * cusp equal this Reading's (angles/cusps are a function of the exact
 * coordinates, so equality proves the same location produced both charts).
 * All qualifying sources must agree.
 */
async function recoverCoordinates(
  id: string,
  r: FirebaseFirestore.DocumentData,
  astro: { angles?: Record<string, { longitude: number }>; houses?: { cusps: unknown[] } },
  all: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<{ lat: number; lng: number; source: string } | null> {
  const db = getAdminDb();
  const own = r.profileId ? (await db.doc(`energeticProfiles/${r.profileId}`).get()).data() : null;
  if (typeof own?.lat === "number" && typeof own?.lng === "number") return { lat: own.lat, lng: own.lng, source: "its own Profile" };
  const cusps = (h?: { cusps: unknown[] }) => JSON.stringify((h?.cusps ?? []).map((c) => (typeof c === "number" ? c : (c as { longitude: number }).longitude)));
  const found: { lat: number; lng: number; from: string }[] = [];
  for (const d of all) {
    if (d.id === id) continue;
    const o = d.data();
    if (o.subAccountId !== r.subAccountId || o.birthDate !== r.birthDate || o.birthTime !== r.birthTime || o.timeZone !== r.timeZone || o.birthPlace !== r.birthPlace) continue;
    const oa = o.astrology as typeof astro | undefined;
    const anglesEqual = ["ascendant", "descendant", "mc", "ic"].every((k) => oa?.angles?.[k]?.longitude === astro.angles?.[k]?.longitude);
    if (!anglesEqual || cusps(oa?.houses) !== cusps(astro.houses) || cusps(astro.houses) === "[]") continue;
    const p = o.profileId ? (await db.doc(`energeticProfiles/${o.profileId}`).get()).data() : null;
    if (typeof p?.lat === "number" && typeof p?.lng === "number") found.push({ lat: p.lat, lng: p.lng, from: d.id });
  }
  if (!found.length) return null;
  if (!found.every((f) => f.lat === found[0].lat && f.lng === found[0].lng)) return null;
  return { lat: found[0].lat, lng: found[0].lng, source: `matching Reading(s) ${found.map((f) => f.from).join(", ")} (identical birth inputs, angles and cusps)` };
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
