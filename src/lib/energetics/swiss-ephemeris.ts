import "server-only";

import SwissEph from "swisseph-wasm";

/**
 * File-backed Swiss Ephemeris (not the astronomia/astronomy-engine
 * approximations used elsewhere) — added 2026-08-10, specifically for the
 * one place precision actually matters at this granularity: the true lunar
 * Node longitude feeding Environment/Perspective (see human-design-
 * variables.ts). Proven necessary, not assumed: astronomia's node
 * approximation (northNodeLongitude in gate-wheel.ts) was measured directly
 * against this library on a real test instant and found to differ by ~357
 * arcseconds — nearly 4x a single Tone-width (93.75 arcsec) and over half a
 * Color-width (562.5 arcsec), guaranteed to land in the wrong bucket on a
 * real fraction of real charts. Sun/Earth longitude, by contrast, measured
 * within 0.6 arcsec of astronomy-engine's own value — already far more than
 * accurate enough — so this is deliberately NOT used for Sun/Earth, and
 * gate-wheel.ts's existing, already-validated Gate/Line pipeline (which
 * only needs ~0.94° resolution, nowhere near this sensitive) is untouched.
 *
 * WASM, not a native addon (no node-gyp/native-compile risk on Vercel) —
 * self-contained: ships its own real ephemeris data file (~2.1MB), no
 * network fetch at runtime. License is GPL-3.0-or-later (not AGPL) —
 * meaningfully different from AGPL for a closed-source SaaS backend
 * (GPL's copyleft is triggered by distributing the software, not by
 * running it server-side; AGPL specifically closes that gap for network
 * use). Still a real license to be aware of, not MIT/LGPL-clean — flagged
 * directly rather than silently adopted; the alternative if this is ever a
 * concern is Astrodienst's own paid commercial Swiss Ephemeris license.
 *
 * Lazily initialized once per server process (WASM init is real async
 * work) and reused — never re-initialized per request.
 */

let instance: InstanceType<typeof SwissEph> | null = null;
let initPromise: Promise<InstanceType<typeof SwissEph>> | null = null;

async function getSwissEph(): Promise<InstanceType<typeof SwissEph>> {
  if (instance) return instance;
  if (!initPromise) {
    initPromise = (async () => {
      const swe = new SwissEph();
      await swe.initSwissEph();
      instance = swe;
      return swe;
    })();
  }
  return initPromise;
}

/**
 * True (not mean) lunar Node longitude, degrees 0-360, file-backed Swiss
 * Ephemeris precision — SEFLG_SWIEPH explicitly requests the real ephemeris
 * file calculation, not the faster/lower-precision Moshier analytic
 * fallback Swiss Ephemeris also supports.
 */
export async function trueNodeLongitudeHighPrecision(date: Date): Promise<number> {
  const swe = await getSwissEph();
  const jd = swe.julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
  );
  const result = swe.calc_ut(jd, swe.SE_TRUE_NODE, swe.SEFLG_SWIEPH);
  const lon = result[0];
  return ((lon % 360) + 360) % 360;
}
