/**
 * Firestore handle for the one-time Energetic Decoder scripts.
 *
 *  - Emulator (FIRESTORE_EMULATOR_HOST set): a demo-* project only.
 *  - Real project: ONLY with an explicit `--env-file <path>` pointing at a
 *    file holding the FIREBASE_ADMIN_* service-account values — never an
 *    implicit .env.local, so a script can't reach production by accident
 *    from a worktree.
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function scriptFirestore(): { db: Firestore; target: string } {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || "demo-chart-designs";
    if (!projectId.startsWith("demo-")) throw new Error("Emulator runs must use a demo-* project.");
    initializeApp({ projectId });
    return { db: getFirestore(), target: `emulator (${projectId})` };
  }
  const envFile = argValue("--env-file");
  if (!envFile) {
    throw new Error("Pass --env-file <path to .env.local> to run against a real Firebase project (read-only unless --live).");
  }
  const env: Record<string, string> = {};
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
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
      privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  return { db: getFirestore(), target: `project ${env.FIREBASE_ADMIN_PROJECT_ID}` };
}

export function parseTotals(raw: string | undefined, keys: readonly string[]): Record<string, number> | undefined {
  if (!raw) return undefined;
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=");
    if (!keys.includes(k) || !/^\d+$/.test(v ?? "")) throw new Error(`Bad --expect value "${part}" (keys: ${keys.join(", ")})`);
    out[k] = Number(v);
  }
  for (const k of keys) if (!(k in out)) throw new Error(`--expect is missing "${k}"`);
  return out;
}
