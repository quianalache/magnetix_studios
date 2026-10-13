/**
 * Mint a short-lived Firebase ID token for local visual QA
 * (scripts/qa/visual-pass.mjs `--token-file`). Uses the Admin SDK from
 * .env.local to create a custom token for an EXISTING user and exchanges it
 * for an ID token (~1h lifetime). Nothing is written to Firestore or Auth
 * beyond the sign-in timestamp Firebase records.
 *
 * Prefer a dedicated QA staff account (QA_EMAIL) over the owner's own.
 * Write the token OUTSIDE the repo and delete it when the pass is done.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/qa/mint-qa-session.ts --email qa@example.com --out /tmp/qa-token.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email") ?? process.env.QA_EMAIL;
  const out = arg("out");
  if (!email || !out) throw new Error("Usage: --email <existing user> --out <path outside the repo>");
  if (resolve(out).startsWith(process.cwd())) throw new Error("Refusing to write a session token inside the repo.");
  const { getAdminAuth } = await import("../../src/lib/firebase/admin");
  const user = await getAdminAuth().getUserByEmail(email);
  const custom = await getAdminAuth().createCustomToken(user.uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) },
  );
  const json = (await res.json()) as { idToken?: string; refreshToken?: string; expiresIn?: string; error?: { message?: string } };
  if (!json.idToken) throw new Error(`Token exchange failed: ${json.error?.message ?? res.status}`);
  // idToken → server session cookie (/api/login). The rest lets the harness sign
  // the browser's Firebase client SDK in too, so client-side Firestore reads
  // (agency theme, live lists) behave exactly as in a real signed-in browser.
  writeFileSync(
    out,
    JSON.stringify({
      idToken: json.idToken,
      refreshToken: json.refreshToken,
      expiresAt: Date.now() + Number(json.expiresIn ?? 3600) * 1000,
      uid: user.uid,
      email: user.email,
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    }),
    { mode: 0o600 },
  );
  console.log(`Wrote a ~1h QA session token for ${email} to ${out}. Delete it after the pass.`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
