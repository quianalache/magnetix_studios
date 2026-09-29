/**
 * API route consolidation — compatibility checks (Vercel route-limit fix,
 * 2026-09-29). No emulators, no network, no handler side effects: every
 * handler module is replaced by a recording stub built from the REAL
 * generated route tables.
 *
 * Run: NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' ./node_modules/.bin/tsx scripts/check-api-dispatch.ts [baseRef]
 *   baseRef (default origin/main) = the commit whose route files must all still be served.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createApiDispatcher } from "../src/lib/server/api-dispatch";

const ROOT = path.resolve(__dirname, "..");
const BASE = process.argv[2] || "origin/main";
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

let passes = 0;
let failures = 0;
async function check(label: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passes++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label} — ${(err as Error).message}`);
  }
}

async function main() {
  const { GROUPS } = (await import(path.join(ROOT, "scripts/gen-api-dispatch.mjs").replace(/^/, "file://"))) as { GROUPS: string[] };

  const exportedMethods = (file: string) =>
    METHODS.filter((m) => new RegExp(`export (async )?function ${m}\\b|export const ${m}\\b`).test(fs.readFileSync(file, "utf8")));

  // Route files at the base commit, per group.
  const baseFiles = execFileSync("git", ["ls-tree", "-r", "--name-only", BASE, "src/app/api"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => /\/route\.tsx?$/.test(f));

  for (const group of GROUPS) {
    const handlersDir = path.join(ROOT, group, "_routes");
    const table: Array<[string, string]> = []; // [pattern, file]
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/^route\.tsx?$/.test(e.name)) {
          const dir = path.relative(handlersDir, path.dirname(p)).split(path.sep).join("/");
          table.push([dir === "" ? "" : dir, p]);
        }
      }
    };
    walk(handlersDir);

    const calls: Array<{ pattern: string; method: string; params: Record<string, unknown> }> = [];
    const stubs = table.map(([pattern, file]) => {
      const mod: Record<string, unknown> = {};
      for (const m of exportedMethods(file)) {
        mod[m] = async (_req: Request, ctx: { params: Promise<Record<string, unknown>> }) => {
          calls.push({ pattern, method: m, params: await ctx.params });
          return new Response(`${m} ${pattern}`, { status: 200, headers: { "x-pattern": pattern } });
        };
      }
      return [pattern, mod] as [string, unknown];
    });
    const d = createApiDispatcher(stubs) as unknown as Record<string, (r: Request, c: { params: Promise<Record<string, unknown>> }) => Promise<Response>>;

    // Generated route file registers exactly these handlers.
    await check(`${group}: generated dispatcher lists every handler in _routes/`, () => {
      const gen = fs.readFileSync(path.join(ROOT, group, "[[...path]]", "route.ts"), "utf8");
      const listed = [...gen.matchAll(/^\s+\["([^"]*)", h\d+\],$/gm)].map((m) => m[1]).sort();
      assert.deepEqual(listed, table.map(([p]) => p).sort());
    });

    // Every route file that existed at the base commit is still served (dispatcher or kept standalone).
    await check(`${group}: every endpoint at ${BASE} is still served`, () => {
      const prefix = group + "/";
      const missing: string[] = [];
      for (const f of baseFiles.filter((f) => f.startsWith(prefix))) {
        const sub = path.dirname(f.slice(prefix.length));
        const pattern = sub === "." ? "" : sub;
        const kept = fs.existsSync(path.join(ROOT, f));
        if (!kept && !table.some(([p]) => p === pattern)) missing.push(f);
      }
      assert.deepEqual(missing, []);
    });

    // Each endpoint URL reaches its own handler, with its own params, for every method it exports.
    await check(`${group}: each endpoint's URL + methods dispatch to its own handler with correct params`, async () => {
      const parent = { __parent: "P" };
      for (const [pattern, file] of table) {
        const segs = pattern.split("/").filter(Boolean);
        const sample: Record<string, string> = {};
        const urlPath = segs.map((s, i) => {
          if (!s.startsWith("[")) return s;
          const name = s.replace(/^\[+\.{0,3}|\]+$/g, "");
          sample[name] = `v${i}-${name}`;
          return sample[name];
        });
        for (const m of exportedMethods(file)) {
          calls.length = 0;
          const res = await d[m](new Request("http://t.local/x", { method: m }), { params: Promise.resolve({ ...parent, path: urlPath }) });
          assert.equal(res.status, 200, `${m} /${pattern} → ${res.status}`);
          assert.equal(calls[0]?.pattern, pattern, `${m} /${pattern} reached /${calls[0]?.pattern}`);
          assert.deepEqual(calls[0]?.params, { ...parent, ...sample }, `${m} /${pattern} params`);
        }
      }
    });

    // Static segments beat dynamic ones even when the value collides (Next precedence).
    await check(`${group}: static segments win over a colliding dynamic value`, async () => {
      for (const [pattern, file] of table) {
        if (/\[/.test(pattern)) continue;
        const m = exportedMethods(file)[0];
        if (!m) continue;
        calls.length = 0;
        await d[m](new Request("http://t.local/x", { method: m }), { params: Promise.resolve({ path: pattern.split("/").filter(Boolean) }) });
        assert.equal(calls[0]?.pattern, pattern, `${m} /${pattern} reached /${calls[0]?.pattern}`);
      }
    });

    await check(`${group}: unknown path → 404, unexported method → 405 with Allow, HEAD/OPTIONS like Next`, async () => {
      const r404 = await d.GET(new Request("http://t.local/x"), { params: Promise.resolve({ path: ["__nope__", "x", "y", "z", "w", "v"] }) });
      assert.equal(r404.status, 404);
      const [pattern, file] = table.find(([, f]) => exportedMethods(f).length > 0)!;
      const exported = exportedMethods(file);
      const segs = pattern.split("/").filter(Boolean).map((s) => (s.startsWith("[") ? "x1" : s));
      const missing = METHODS.find((m) => m !== "HEAD" && m !== "OPTIONS" && !exported.includes(m));
      if (missing) {
        const r405 = await d[missing](new Request("http://t.local/x", { method: missing }), { params: Promise.resolve({ path: segs }) });
        assert.equal(r405.status, 405);
        assert.ok(r405.headers.get("allow")?.includes(exported[0]));
      }
      if (exported.includes("GET") && !exported.includes("HEAD")) {
        const head = await d.HEAD(new Request("http://t.local/x", { method: "HEAD" }), { params: Promise.resolve({ path: segs }) });
        assert.equal(head.status, 200);
        assert.equal(await head.text(), "");
      }
      if (!exported.includes("OPTIONS")) {
        const opt = await d.OPTIONS(new Request("http://t.local/x", { method: "OPTIONS" }), { params: Promise.resolve({ path: segs }) });
        assert.equal(opt.status, 204);
      }
    });
  }

  // Kept standalone routes still exist as real route files with their own config.
  await check("routes with their own maxDuration stay standalone real routes", () => {
    for (const f of [
      "src/app/api/community/[saId]/[groupId]/skool-import/connect/route.ts",
      "src/app/api/community/[saId]/[groupId]/skool-import/scan/step/route.ts",
      "src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-script/route.ts",
      "src/app/api/sub-accounts/[id]/ytcs/videos/[videoId]/generate-titles/route.ts",
    ]) {
      const s = fs.readFileSync(path.join(ROOT, f), "utf8");
      assert.match(s, /export const maxDuration = \d+/, f);
    }
  });

  // Agency Community dispatcher: the pre-existing precedence bug is fixed.
  await check("agency community: GET /[groupId]/courses/catalog reaches the catalog handler, not courses/[courseId]", async () => {
    const src = fs.readFileSync(path.join(ROOT, "src/app/api/agency/community/[...path]/route.ts"), "utf8");
    const patterns = [...src.matchAll(/^\s+\["([^"]*)", r\d+\],$/gm)].map((m) => m[1]);
    assert.ok(patterns.length >= 49, `table has ${patterns.length} entries`);
    const hits: string[] = [];
    const d = createApiDispatcher(
      patterns.map((p) => [p, { GET: async () => (hits.push(p), new Response("ok")), POST: async () => (hits.push(p), new Response("ok")) }])
    ) as unknown as Record<string, (r: Request, c: { params: Promise<Record<string, unknown>> }) => Promise<Response>>;
    await d.GET(new Request("http://t.local/x"), { params: Promise.resolve({ path: ["g1", "courses", "catalog"] }) });
    await d.GET(new Request("http://t.local/x"), { params: Promise.resolve({ path: ["g1", "courses", "c9"] }) });
    await d.GET(new Request("http://t.local/x"), { params: Promise.resolve({ path: ["g1", "live-rooms", "moderation"] }) });
    await d.GET(new Request("http://t.local/x"), { params: Promise.resolve({ path: [] }) });
    assert.deepEqual(hits, ["[groupId]/courses/catalog", "[groupId]/courses/[courseId]", "[groupId]/live-rooms/moderation", ""]);
  });

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
