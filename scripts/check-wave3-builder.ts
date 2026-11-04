/**
 * Wave 3 — Page Settings + Media / Embeds + Editing Polish. Deterministic checks.
 *
 * Offline: Page Settings model (legacy fallback, strict save, public
 * metadata, tracking-ID safety), Magnetix tracking surface classification
 * (every top-level route classified; tenant surfaces + custom domains never
 * Magnetix), background images (position / size / repeat / overlay / safe
 * URL / legacy output), column order CSS, Embed allow-list + sandbox,
 * Audio, Social Links, Media Library video + poster + focal point, Icon
 * colors, canvas editing (config + renders), Animations tab removed,
 * registry / guard.
 * Emulator (FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-*): Page Settings
 * draft → publish semantics, rename, unpublish (+ republish), revert draft
 * to published (content + popups + settings), strict save refusals.
 *
 * Run: pnpm check:wave3
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Data } from "@puckeditor/core";
import {
  EMPTY_PAGE_SETTINGS,
  findPageSettingsProblem,
  isGa4Id,
  isGtmId,
  isMetaPixelId,
  pageNameProblem,
  pageSettingsProblem,
  publicPageMetadata,
  resolvePageSettings,
  safeTrackingIds,
  withPageSettings,
  type PageSettings,
} from "../src/lib/pages-funnels/page-settings";
import { MAGNETIX_OWNED_SEGMENTS, TENANT_SEGMENTS, classifyTrackingSurface, isPlatformHost } from "../src/lib/tracking/surfaces";
import { backgroundCssValue, backgroundOverlay, backgroundProblem, findBackgroundProblem, safeBackgroundImageUrl } from "../src/lib/pages-funnels/puck/background";
import { BackgroundLayer } from "../src/components/pages-funnels/puck/background-layer";
import { columnOrderCss, columnOrderProblem, findColumnOrderProblem } from "../src/lib/pages-funnels/puck/column-order";
import { EMBED_PROVIDERS, EMBED_SANDBOX, embedBlockProblem, embedFrameSize, resolveEmbedUrl } from "../src/lib/pages-funnels/embed";
import { audioBlockProblem, safeAudioSrc } from "../src/lib/pages-funnels/audio";
import { normalizeSocialItems, socialAccessibleName, socialHref, socialLinksProblem } from "../src/lib/pages-funnels/social-links";
import { AudioRender, EmbedRender, SocialLinksRender } from "../src/components/pages-funnels/puck/media-blocks";
import { collectMediaVideoIds, normalizeMediaVideo, withBunnyPlaybackFlags } from "../src/lib/pages-funnels/puck/media-video";
import { findWave3BlockProblem } from "../src/lib/pages-funnels/puck/wave3-validation";
import { resolveIconColor, toIconColorSetting } from "../src/lib/pages-funnels/icon-color";
import { resolveImageSizeStyle } from "../src/lib/pages-funnels/puck/media-size";
import { AccordionRender, VideoRender } from "../src/components/pages-funnels/puck/elements";
import { ProofRender, StatsRender, TabsRender } from "../src/components/pages-funnels/puck/parity-blocks";
import { ProgressBarRender } from "../src/components/pages-funnels/data-metrics/progress-bar";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { BLOCK_ICONS } from "../src/components/pages-funnels/puck/block-icons";
import { KNOWN_PUCK_BLOCK_TYPES, findUnknownBlockTypes } from "../src/lib/pages-funnels/puck/known-blocks";
import { derivePuckPublishStatus } from "../src/lib/pages-funnels/puck/publish-status";

let passed = 0;
const check = async (label: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${label}`);
    throw err;
  }
};
const text = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** What Puck hands a render function for a contentEditable field in the builder. */
const inline = (value: string): ReactNode => h("span", { value, "data-puck-inline": "" }, value);
const brandKit = [{ id: "brand-plum", hex: "#3D1652" }];
const SETTINGS: PageSettings = {
  seoTitle: "Free Workshop",
  seoDescription: "Learn the three-step method.",
  socialImage: "https://firebasestorage.googleapis.com/v0/b/x/o/social.png?alt=media",
  noindex: true,
  tracking: { metaPixelId: "123456789012345", ga4Id: "G-ABCDE12345", gtmId: "GTM-ABC1234" },
};

async function offline() {
  // ── Page Settings model ──────────────────────────────────────────────
  await check("legacy page (no Wave 3 settings) reads its flat seo field; new tree reads its own", () => {
    const legacy = resolvePageSettings({ root: { props: {} } }, { title: "Old title", description: "Old desc", ogImage: "https://x.com/a.png" });
    assert.equal(legacy.seoTitle, "Old title");
    assert.equal(legacy.seoDescription, "Old desc");
    assert.equal(legacy.socialImage, "https://x.com/a.png");
    assert.equal(legacy.noindex, false);
    const tree = withPageSettings({ root: { props: { pageBackground: { source: "none" } } }, content: [] }, SETTINGS);
    assert.deepEqual(resolvePageSettings(tree, { title: "Old title" }), SETTINGS);
    assert.deepEqual((tree.root as { props: Record<string, unknown> }).props.pageBackground, { source: "none" }, "page background kept");
  });
  await check("strict save: valid settings pass; malformed IDs / image / lengths refused", () => {
    assert.equal(pageSettingsProblem(SETTINGS), null);
    assert.equal(pageSettingsProblem(undefined), null);
    assert.match(pageSettingsProblem({ ...SETTINGS, tracking: { ...SETTINGS.tracking, metaPixelId: "abc" } })!, /Meta Pixel/);
    assert.match(pageSettingsProblem({ ...SETTINGS, tracking: { ...SETTINGS.tracking, ga4Id: "UA-1234" } })!, /GA4/);
    assert.match(pageSettingsProblem({ ...SETTINGS, tracking: { ...SETTINGS.tracking, gtmId: "GTM-'</script>" } })!, /GTM/);
    assert.match(pageSettingsProblem({ ...SETTINGS, socialImage: "javascript:alert(1)" })!, /https image/);
    assert.match(pageSettingsProblem({ ...SETTINGS, seoTitle: "x".repeat(121) })!, /SEO title/);
    assert.match(pageSettingsProblem({ ...SETTINGS, seoDescription: "x".repeat(321) })!, /description/);
    assert.match(pageSettingsProblem({ ...SETTINGS, noindex: "yes" })!, /couldn't be read/);
    assert.match(findPageSettingsProblem({ root: { props: { pageSettings: "bad" } } })!, /couldn't be read/);
  });
  await check("tracking ID formats + safe render drops malformed IDs", () => {
    assert.ok(isMetaPixelId("123456789012345") && !isMetaPixelId("12ab"));
    assert.ok(isGa4Id("G-ABCDE12345") && !isGa4Id("g-abc") && !isGa4Id("G-ABC'"));
    assert.ok(isGtmId("GTM-ABC1234") && !isGtmId("GTM-"));
    assert.deepEqual(safeTrackingIds(SETTINGS.tracking), SETTINGS.tracking);
    assert.deepEqual(safeTrackingIds({ metaPixelId: "1'); alert(1); ('", ga4Id: "", gtmId: "GTM-ABC1234" }), { gtmId: "GTM-ABC1234" });
    assert.deepEqual(safeTrackingIds(EMPTY_PAGE_SETTINGS.tracking), {}, "empty IDs never load");
  });
  await check("public metadata: SEO title vs page name, description, image, noindex, Reading forced noindex", () => {
    const m = publicPageMetadata({ settings: SETTINGS, pageName: "Internal name" });
    assert.deepEqual(m, { title: "Free Workshop", description: "Learn the three-step method.", image: SETTINGS.socialImage, noindex: true });
    const blank = publicPageMetadata({ settings: EMPTY_PAGE_SETTINGS, pageName: "Internal name" });
    assert.deepEqual(blank, { title: "Internal name", description: null, image: null, noindex: false });
    assert.equal(publicPageMetadata({ settings: EMPTY_PAGE_SETTINGS, pageName: "R", forceNoindex: true }).noindex, true);
    assert.equal(publicPageMetadata({ settings: { ...SETTINGS, socialImage: "ftp://x/y.png" }, pageName: "x" }).image, null);
  });
  await check("page name: required, trimmed, ≤60", () => {
    assert.equal(pageNameProblem("  Launch page "), null);
    assert.match(pageNameProblem("   ")!, /Enter/);
    assert.match(pageNameProblem("x".repeat(61))!, /60/);
    assert.match(pageNameProblem(42)!, /Enter/);
  });
  await check("publish status: unpublished page with a published copy reads as Unpublished", () => {
    assert.equal(derivePuckPublishStatus({ puckPublishedData: {} as never, puckPublishedAt: null, puckDraftUpdatedAt: null, status: "draft" }), "unpublished");
    assert.equal(derivePuckPublishStatus({ puckPublishedData: {} as never, puckPublishedAt: null, puckDraftUpdatedAt: null, status: "published" }), "published");
    assert.equal(derivePuckPublishStatus({ puckPublishedData: null, puckPublishedAt: null, puckDraftUpdatedAt: null, status: "draft" }), "v1-only");
  });
  await check("public route reads PUBLISHED settings; tenant tracking only on the live page; Preview shows draft title", () => {
    const route = read("src/app/p/[pageId]/page.tsx");
    assert.match(route, /page\.puckPublishedData \? decodeStoredPuckData\(page\.puckPublishedData\)/);
    assert.match(route, /description: meta\.description/);
    assert.match(route, /<TenantPageTracking \{\.\.\.tracking\} \/>/);
    assert.match(route, /safeTrackingIds\(resolvePageSettings\(publishedData, page\.seo\)\.tracking\)/);
    const preview = read("src/app/(builder)/sa/[subAccountId]/pages-funnels/[pageId]/new-builder/preview/page.tsx");
    assert.doesNotMatch(preview, /TenantPageTracking/, "Preview never loads tenant tracking");
    assert.match(preview, /document\.title = `Preview · /);
    assert.doesNotMatch(read("src/components/pages-funnels/puck/editor-shell.tsx"), /TenantPageTracking/, "builder never loads tenant tracking");
    const tracker = read("src/components/pages-funnels/tenant-page-tracking.tsx");
    assert.match(tracker, /trackSingle/);
    assert.match(tracker, /id="tenant-gtm"/);
    assert.match(tracker, /id="tenant-ga4"/);
    assert.match(tracker, /id="tenant-meta-pixel"/);
  });

  // ── Magnetix tracking surfaces ───────────────────────────────────────
  const platform = { appUrl: "https://crm.magnetixstudios.com", primaryDomain: "magnetixstudios.com" };
  await check("tenant surfaces never load Magnetix tracking (platform host)", () => {
    for (const path of ["/p/abc", "/b/sa/slug", "/booking/slug", "/f/form1", "/q/tok", "/pay/tok", "/pay/charge/tok", "/c/sa/group", "/u/tok", "/replay/x.y", "/my/readings/r1", "/portal", "/decoder/sa", "/courses/x", "/offer/sa/o1", "/webinar/sa/w", "/my-community", "/embed/chat/sa", "/e/tok", "/communities"]) {
      assert.equal(classifyTrackingSurface(path, "crm.magnetixstudios.com", platform), "tenant", path);
    }
  });
  await check("Magnetix-owned surfaces may load Magnetix tracking", () => {
    for (const path of ["/", "/login", "/signup", "/thank-you", "/terms", "/agency", "/sa/x/dashboard", "/me/settings", "/get-started/pro", "/offer/agency/o1", "/course/agency/c1", "/about"]) {
      assert.equal(classifyTrackingSurface(path, "crm.magnetixstudios.com", platform), "magnetix", path);
    }
    assert.equal(classifyTrackingSurface("/", "www.magnetixstudios.com", platform), "magnetix");
    assert.equal(classifyTrackingSurface("/", "magnetixstudios.com", platform), "magnetix");
  });
  await check("tenant custom domains are always tenant, whatever the path", () => {
    assert.equal(isPlatformHost("quianalache.com", platform), false);
    for (const path of ["/", "/p/abc", "/login", "/agency"]) assert.equal(classifyTrackingSurface(path, "quianalache.com", platform), "tenant", path);
  });
  await check("every top-level app route is classified (new routes need an explicit decision)", () => {
    const appDir = join(process.cwd(), "src/app");
    const classified = new Set<string>([...MAGNETIX_OWNED_SEGMENTS, ...TENANT_SEGMENTS, "api", "docs"]);
    const segments: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (!statSync(full).isDirectory()) continue;
        if (/^\(.*\)$/.test(entry)) walk(full);
        else if (!entry.includes(".")) segments.push(entry); // manifest.webmanifest etc. are file routes, not pages
      }
    };
    walk(appDir);
    const missing = segments.filter((s) => !classified.has(s));
    assert.deepEqual(missing, [], `unclassified top-level routes: ${missing.join(", ")}`);
  });
  await check("root layout no longer emits Magnetix noscript trackers; scripts gated; tenant forms send no Lead", () => {
    const layout = read("src/app/layout.tsx");
    assert.doesNotMatch(layout, /googletagmanager\.com\/ns\.html|facebook\.com\/tr/);
    const scripts = read("src/components/analytics-scripts.tsx");
    assert.match(scripts, /magnetixSurface && process\.env\.NEXT_PUBLIC_GTM_ID/);
    assert.match(scripts, /magnetixSurface && process\.env\.NEXT_PUBLIC_META_PIXEL_ID/);
    assert.doesNotMatch(read("src/components/forms/public-form.tsx"), /trackLeadEvent|fbq/);
    assert.doesNotMatch(read("src/lib/attribution.ts"), /fbq/);
  });

  // ── Background images ────────────────────────────────────────────────
  const imgBg = (image: Record<string, unknown>, overlay?: Record<string, unknown>) => ({ source: "image", color: { mode: "solid", solid: "", gradient: { type: "linear", angle: 0, stops: [] } }, image, overlay, blur: { enabled: false, intensity: 0 } }) as never;
  await check("image background: legacy output unchanged; position / size / repeat applied", () => {
    assert.equal(backgroundCssValue(imgBg({ url: "https://x.com/a.jpg" })), 'url("https://x.com/a.jpg") center / cover no-repeat');
    assert.equal(backgroundCssValue(imgBg({ url: "https://x.com/a.jpg", position: { x: 20, y: 80 }, size: "contain", repeat: true })), 'url("https://x.com/a.jpg") 20% 80% / contain repeat');
    assert.equal(backgroundCssValue(imgBg({ url: "https://x.com/a.jpg", size: "auto" })), 'url("https://x.com/a.jpg") center / auto no-repeat');
    assert.equal(backgroundCssValue(imgBg({ url: "https://x.com/a.jpg", position: { x: 300, y: -5 } })), 'url("https://x.com/a.jpg") 100% 0% / cover no-repeat');
  });
  await check("image background: unsafe URLs never reach CSS", () => {
    assert.equal(backgroundCssValue(imgBg({ url: "javascript:alert(1)" })), undefined);
    assert.equal(safeBackgroundImageUrl('https://x.com/a.jpg") ; background:url("evil'), 'https://x.com/a.jpg%22%29%20;%20background:url%28%22evil');
    assert.equal(backgroundCssValue(imgBg({ url: "" })), undefined, "removed image renders nothing");
    assert.equal(backgroundCssValue({ source: "video", video: { url: "https://x.com/v.mp4" } } as never), undefined, "video background not rendered");
  });
  await check("overlay: brand / custom / default colors, opacity, only over a real image", () => {
    const resolve = (c: { source: string; custom?: string; brandColorId?: string }) => (c.source === "custom" ? c.custom ?? null : c.source === "brand" ? brandKit[0].hex : null);
    assert.deepEqual(backgroundOverlay(imgBg({ url: "https://x.com/a.jpg" }, { enabled: true, color: { source: "custom", custom: "#112233" }, opacity: 40 }), resolve as never), { color: "#112233", opacity: 0.4 });
    assert.deepEqual(backgroundOverlay(imgBg({ url: "https://x.com/a.jpg" }, { enabled: true, color: { source: "brand", brandColorId: "brand-plum" }, opacity: 60 }), resolve as never), { color: "#3D1652", opacity: 0.6 });
    assert.equal(backgroundOverlay(imgBg({ url: "https://x.com/a.jpg" }, { enabled: true, color: { source: "default" }, opacity: 50 }), resolve as never)!.color, "#000000");
    assert.equal(backgroundOverlay(imgBg({ url: "" }, { enabled: true, color: { source: "default" }, opacity: 50 }), resolve as never), null);
    assert.equal(backgroundOverlay(imgBg({ url: "https://x.com/a.jpg" }, { enabled: false, color: { source: "default" }, opacity: 50 }), resolve as never), null);
    const markup = renderToStaticMarkup(h(BackgroundLayer, { background: imgBg({ url: "https://x.com/a.jpg" }, { enabled: true, color: { source: "brand", brandColorId: "brand-plum" }, opacity: 50 }), brandKit }));
    assert.match(markup, /data-background-overlay/);
    assert.match(markup, /background-color:#3D1652;opacity:0.5/);
  });
  await check("background strict save: URL, size, position, overlay", () => {
    assert.equal(backgroundProblem(imgBg({ url: "https://x.com/a.jpg", position: { x: 1, y: 2 }, size: "cover" }, { enabled: true, color: { source: "custom", custom: "#000000" }, opacity: 10 })), null);
    assert.match(backgroundProblem(imgBg({ url: "javascript:x" }))!, /public https/);
    assert.match(backgroundProblem(imgBg({ url: "https://x.com/a.jpg", size: "huge" }))!, /size/);
    assert.match(backgroundProblem(imgBg({ url: "https://x.com/a.jpg", position: { x: 101, y: 0 } }))!, /position/);
    assert.match(backgroundProblem(imgBg({ url: "https://x.com/a.jpg" }, { enabled: true, opacity: 200 }))!, /opacity/);
    assert.match(backgroundProblem(imgBg({ url: "https://x.com/a.jpg" }, { enabled: true, opacity: 20, color: { source: "custom", custom: "red" } }))!, /hex/);
    assert.match(findBackgroundProblem({ root: { props: { pageBackground: imgBg({ url: "ftp://a" }) } } })!, /public https/);
    assert.equal(backgroundProblem({ source: "color", color: { mode: "solid", solid: "#fff" } }), null, "older shapes unaffected");
  });
  await check("background editor: Image offered, Video removed, picker + focal point + overlay controls", () => {
    const field = read("src/components/pages-funnels/puck/background-field.tsx");
    assert.doesNotMatch(field, /\{ value: "video", label: "Video" \}/);
    assert.doesNotMatch(field, /reserved for a future phase/);
    for (const needle of ["ImageFieldEditor", "FocalPointField", "Overlay color", "Overlay opacity", '"contain"', "Repeat image"]) assert.ok(field.includes(needle), needle);
  });

  // ── Column order ─────────────────────────────────────────────────────
  await check("column order: independent device ranges, direct children only, nothing when unset", () => {
    assert.equal(columnOrderCss("row-1", undefined), null);
    assert.equal(columnOrderCss("row-1", {}), null);
    const mobile = columnOrderCss("row-1", { mobile: true })!;
    assert.match(mobile, /^@media \(max-width:767px\)\{#row-1>\.grid>:nth-child\(1\)\{order:-1\}/);
    assert.doesNotMatch(mobile, /min-width/);
    const all = columnOrderCss("row-1", { desktop: true, tablet: true, mobile: true })!;
    assert.match(all, /@media \(min-width:1280px\)/);
    assert.match(all, /@media \(min-width:768px\) and \(max-width:1279px\)/);
    assert.equal(columnOrderCss("bad id\"}", { mobile: true }), null);
    assert.equal(columnOrderProblem({ mobile: true }), null);
    assert.match(columnOrderProblem({ mobile: "yes" })!, /column order/);
    assert.match(findColumnOrderProblem({ content: [{ type: "Row", props: { columnOrder: { phone: true } } }] })!, /column order/);
  });

  // ── Embed ────────────────────────────────────────────────────────────
  await check("Embed: every allow-listed provider resolves to its official embed URL", () => {
    const cases: [string, string, string][] = [
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
      ["https://youtu.be/dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
      ["https://vimeo.com/76979871", "vimeo", "https://player.vimeo.com/video/76979871"],
      ["https://www.loom.com/share/abc123DEF", "loom", "https://www.loom.com/embed/abc123DEF"],
      ["https://acme.wistia.com/medias/e4a27b971d", "wistia", "https://fast.wistia.net/embed/iframe/e4a27b971d"],
      ["https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk", "spotify", "https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk"],
      ["https://podcasts.apple.com/us/podcast/the-show/id1234567890", "apple-podcasts", "https://embed.podcasts.apple.com/us/podcast/the-show/id1234567890"],
      ["https://soundcloud.com/artist/track", "soundcloud", "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack&auto_play=false&visual=false"],
      ["https://www.google.com/maps?q=Eiffel+Tower", "google-maps", "https://maps.google.com/maps?q=Eiffel%20Tower&output=embed"],
      ["https://www.google.com/maps/embed?pb=!1m18", "google-maps", "https://www.google.com/maps/embed?pb=!1m18"],
      ["https://calendly.com/acme/30min", "calendly", "https://calendly.com/acme/30min?embed_type=Inline&hide_gdpr_banner=1"],
      ["https://acme.typeform.com/to/AbC123", "typeform", "https://form.typeform.com/to/AbC123"],
      ["https://tally.so/r/w4Ab1z", "tally", "https://tally.so/embed/w4Ab1z?alignLeft=1&hideTitle=1&transparentBackground=1"],
    ];
    for (const [url, provider, src] of cases) assert.deepEqual(resolveEmbedUrl(url), { provider, src }, url);
    assert.equal(Object.keys(EMBED_PROVIDERS).length, 11);
  });
  await check("Embed: blocked provider, malformed and unsafe links render nothing", () => {
    for (const bad of ["https://evil.example.com/embed", "http://www.youtube.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "not a url", "https://www.youtube.com/watch?v=<script>", "", 42]) {
      assert.equal(resolveEmbedUrl(bad), null, String(bad));
    }
    assert.equal(renderToStaticMarkup(h(EmbedRender, { id: "Embed-1", url: "https://evil.example.com/x" })), "");
    assert.match(text(renderToStaticMarkup(h(EmbedRender, { id: "Embed-1", url: "https://evil.example.com/x", editing: true }))), /can.t be embedded/);
  });
  await check("Embed: sandboxed provider-origin iframe; inert in the builder; sizing", () => {
    assert.doesNotMatch(EMBED_SANDBOX, /allow-top-navigation|allow-downloads|allow-modals/);
    const live = renderToStaticMarkup(h(EmbedRender, { id: "Embed-1", url: "https://www.loom.com/share/abc123DEF", title: "Walkthrough" }));
    assert.match(live, /<iframe src="https:\/\/www\.loom\.com\/embed\/abc123DEF" title="Walkthrough" sandbox="allow-scripts allow-same-origin/);
    assert.match(live, /aspect-ratio:16 \/ 9/);
    assert.doesNotMatch(live, /pointer-events:none/);
    const editing = renderToStaticMarkup(h(EmbedRender, { id: "Embed-1", url: "https://www.loom.com/share/abc123DEF", editing: true }));
    assert.match(editing, /pointer-events:none/);
    assert.match(text(editing), /interactive in Preview/);
    assert.deepEqual(embedFrameSize({ sizing: "auto", aspectRatio: "16:9", heightPx: 400 }, "spotify"), { height: 352 });
    assert.deepEqual(embedFrameSize({ sizing: "height", aspectRatio: "16:9", heightPx: 9999 }, "spotify"), { height: 1600 });
    assert.deepEqual(embedFrameSize({ sizing: "ratio", aspectRatio: "9:16", heightPx: 400 }, "youtube"), { aspectRatio: "9 / 16" });
  });
  await check("Embed strict save", () => {
    assert.equal(embedBlockProblem({ url: "https://www.youtube.com/watch?v=x", sizing: "auto", maxWidth: "full" }), null);
    assert.equal(embedBlockProblem({ url: "https://unknown.example" }), null, "unsupported links may sit in a draft (render nothing)");
    assert.match(embedBlockProblem({ url: "javascript:alert(1)" })!, /https/);
    assert.match(embedBlockProblem({ heightPx: 5 })!, /height/);
    assert.match(embedBlockProblem({ aspectRatio: "2:1" })!, /aspect/);
  });

  // ── Audio ────────────────────────────────────────────────────────────
  await check("Audio: native controls, no autoplay, accessible name, safe source", () => {
    const live = renderToStaticMarkup(h(AudioRender, { id: "Audio-1", source: { src: "https://x.com/ep.mp3" }, title: "Episode 1", caption: "Intro" }));
    assert.match(live, /<audio controls="" preload="metadata" src="https:\/\/x\.com\/ep\.mp3"/);
    assert.match(live, /aria-label="Episode 1"/);
    assert.doesNotMatch(live, /autoplay/i);
    assert.equal(renderToStaticMarkup(h(AudioRender, { id: "Audio-1", source: { src: "javascript:alert(1)" } })), "");
    assert.equal(safeAudioSrc("http://evil.com/x.mp3"), null);
    assert.match(audioBlockProblem({ source: { src: "ftp://x" } })!, /https/);
    assert.match(audioBlockProblem({ title: "x".repeat(161) })!, /title/);
    assert.equal(audioBlockProblem({ source: { src: "https://x.com/a.mp3", mediaAssetId: "abc" }, title: "t", caption: "c" }), null);
  });
  await check("Audio: Media Library accepts audio (types, magic bytes, storage rule, public copy)", async () => {
    const svc = await import("../src/lib/server/assets/media-library-service");
    assert.equal(svc.classifyUpload("audio/mpeg"), "audio");
    assert.equal(svc.classifyUpload("audio/flac"), null);
    assert.ok(svc.looksLikeAudio(Buffer.from("ID3\u0004\u0000"), "audio/mpeg"));
    assert.ok(svc.looksLikeAudio(Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]), "audio/mp4"));
    assert.ok(svc.looksLikeAudio(Buffer.from("RIFF\u0000\u0000\u0000\u0000WAVE"), "audio/wav"));
    assert.ok(!svc.looksLikeAudio(Buffer.from("<html>"), "audio/mpeg"));
    assert.equal(svc.validateLibraryUpload("audio/mpeg", 1000), "audio");
    assert.throws(() => svc.validateLibraryUpload("audio/mpeg", 16 * 1024 * 1024), /15 MB/);
    assert.match(read("storage.rules"), /audio\/\(mpeg\|mp4\|x-m4a\|aac\|wav\|x-wav\|ogg\|webm\)/);
    assert.match(read("src/lib/server/assets/media-public-image-service.ts"), /kind === "audio" && upload === "audio"/);
  });

  // ── Social Links ─────────────────────────────────────────────────────
  await check("Social Links: hrefs, accessible names, hidden empty links, hover color", () => {
    assert.equal(socialHref({ network: "instagram", url: "instagram.com/acme" }), "https://instagram.com/acme");
    assert.equal(socialHref({ network: "email", url: "hi@acme.com" }), "mailto:hi@acme.com");
    assert.equal(socialHref({ network: "email", url: "not an email" }), null);
    assert.equal(socialHref({ network: "website", url: "javascript:alert(1)" }), null);
    assert.equal(socialAccessibleName({ network: "tiktok", label: "" }), "TikTok");
    assert.equal(socialAccessibleName({ network: "x", label: "Follow on X" }), "Follow on X");
    const items = [
      { id: "a", network: "instagram", url: "https://instagram.com/acme", label: "" },
      { id: "b", network: "youtube", url: "", label: "" },
      { id: "c", network: "email", url: "hi@acme.com", label: "Email us" },
    ];
    const live = renderToStaticMarkup(h(SocialLinksRender, { id: "Social-1", items, socialStyle: { color: { source: "brand", brandColorId: "brand-plum" }, hoverColor: { source: "custom", custom: "#ff0066" } }, brandKit }));
    assert.match(live, /<span class="sr-only">Instagram<\/span>/);
    assert.match(live, /<span class="sr-only">Email us<\/span>/);
    assert.doesNotMatch(live, /youtube/i, "link without an address hidden on the live page");
    assert.match(live, /href="mailto:hi@acme\.com"/);
    assert.match(live, /target="_blank" rel="noopener noreferrer"/);
    assert.match(live, /color:#3D1652/);
    assert.match(live, /#Social-1 \[data-social-link\]:hover,#Social-1 \[data-social-link\]:focus-visible\{color:#ff0066\}/);
    const editing = renderToStaticMarkup(h(SocialLinksRender, { id: "Social-1", items, editing: true }));
    assert.match(editing, /YouTube \(no link yet\)/);
    assert.doesNotMatch(editing, /href=/, "builder links don't navigate");
    assert.deepEqual(normalizeSocialItems(items.slice().reverse()).map((i) => i.id), ["c", "b", "a"], "order is the stored order");
  });
  await check("Social Links strict save", () => {
    assert.equal(socialLinksProblem({ items: [{ id: "a", network: "x", url: "https://x.com/acme", label: "" }] }), null);
    assert.match(socialLinksProblem({ items: [{ id: "a", network: "myspace", url: "", label: "" }] })!, /network/);
    assert.match(socialLinksProblem({ items: Array.from({ length: 13 }, (_, i) => ({ id: `${i}`, network: "x", url: "", label: "" })) })!, /12/);
    assert.match(socialLinksProblem({ items: [{ id: "a", network: "x", url: "javascript:alert(1)", label: "" }] })!, /https/);
  });

  // ── Media consistency ────────────────────────────────────────────────
  await check("Video: Media Library source wins, resolves per page, builder stand-in, no URL fallback leak", () => {
    const ref = { assetId: "vid_123", title: "Welcome" };
    assert.deepEqual(normalizeMediaVideo(ref), ref);
    assert.equal(normalizeMediaVideo({ assetId: "../x" }), null);
    assert.deepEqual(collectMediaVideoIds({ content: [{ type: "Video", props: { mediaVideo: ref } }, { type: "Video", props: { url: "https://youtu.be/x" } }] }), ["vid_123"]);
    assert.equal(withBunnyPlaybackFlags("https://iframe.mediadelivery.net/embed/1/g?token=t&expires=1", { autoplay: true, muted: true }), "https://iframe.mediadelivery.net/embed/1/g?token=t&expires=1&autoplay=true&muted=true&preload=true");
    const live = renderToStaticMarkup(h(VideoRender, { id: "Video-1", url: "https://youtu.be/dQw4w9WgXcQ", caption: "", mediaVideo: ref, resolvedVideos: { vid_123: "https://iframe.mediadelivery.net/embed/1/g?token=t&expires=1" } }));
    assert.match(live, /src="https:\/\/iframe\.mediadelivery\.net\/embed\/1\/g\?token=t&amp;expires=1&amp;autoplay=false&amp;preload=true"/);
    assert.equal(renderToStaticMarkup(h(VideoRender, { id: "Video-1", url: "https://youtu.be/dQw4w9WgXcQ", caption: "", mediaVideo: ref, resolvedVideos: { vid_123: null } })), "", "unavailable library video renders nothing (no silent URL fallback)");
    assert.match(text(renderToStaticMarkup(h(VideoRender, { id: "Video-1", url: "", caption: "", mediaVideo: ref, editing: true }))), /Welcome Plays in Preview/);
    assert.match(findWave3BlockProblem({ content: [{ type: "Video", props: { mediaVideo: { assetId: "../x" } } }] })!, /Media Library video/);
    assert.equal(findWave3BlockProblem({ content: [{ type: "Video", props: { playback: { posterUrl: "old free text" } } }] }), null, "legacy poster text still saves");
    assert.match(findWave3BlockProblem({ content: [{ type: "Video", props: { playback: { posterUrl: "javascript:x" } } }] })!, /poster/);
  });
  await check("poster, testimonial avatar, focal point, icon color", () => {
    const poster = renderToStaticMarkup(h(VideoRender, { id: "V", url: "https://x.com/v.mp4", caption: "", playback: { posterUrl: "javascript:alert(1)" } }));
    assert.doesNotMatch(poster, /poster=/);
    const proof = renderToStaticMarkup(h(ProofRender, { id: "T", alignment: "left", items: [{ quote: "Great", name: "Sam", role: "", imageUrl: "javascript:x", sourceLabel: "" }] }));
    assert.doesNotMatch(proof, /<img/);
    assert.deepEqual(resolveImageSizeStyle({ heightPx: 300, objectFit: "cover", focalPoint: { x: 25, y: 75 } }).objectPosition, "25% 75%");
    assert.equal(resolveImageSizeStyle({ heightPx: 300, objectPosition: "top" }).objectPosition, "top", "legacy position kept");
    assert.equal(resolveIconColor("#ff0000"), "#ff0000", "legacy string unchanged");
    assert.equal(resolveIconColor({ source: "brand", brandColorId: "brand-plum" }, brandKit), "#3D1652");
    assert.equal(resolveIconColor({ source: "default" }), "");
    assert.deepEqual(toIconColorSetting(""), { source: "default" });
    const cfg = read("src/components/pages-funnels/puck/config.tsx");
    assert.match(cfg, /label="Avatar \(optional\)" value=\{value as string \| undefined\} onChange=\{onChange\} removable/);
    assert.match(cfg, /label="Poster image \(video files only\)"/);
    assert.match(cfg, /<MediaVideoField value=\{value\} onChange=\{onChange\} \/>/);
    assert.match(cfg, /<IconColorField label="Icon color"/);
  });

  // ── Canvas editing ───────────────────────────────────────────────────
  await check("canvas editing: the right fields are contentEditable (and Navigation / Offer / Form / Booking are not)", () => {
    const comps = clientPuckConfig.components as Record<string, { fields?: Record<string, { contentEditable?: boolean; arrayFields?: Record<string, { contentEditable?: boolean }> }> }>;
    const arr = (block: string, field: string, sub: string) => comps[block].fields?.[field]?.arrayFields?.[sub]?.contentEditable === true;
    const top = (block: string, field: string) => comps[block].fields?.[field]?.contentEditable === true;
    assert.ok(arr("Accordion", "items", "title") && arr("Accordion", "items", "content"));
    assert.ok(arr("Tabs", "items", "label") && arr("Tabs", "items", "content"));
    for (const f of ["quote", "name", "role", "sourceLabel"]) assert.ok(arr("Testimonial", "items", f), f);
    assert.ok(top("Video", "caption"));
    assert.ok(arr("Stats", "items", "label") && arr("Stats", "items", "supportingText"));
    for (const b of ["AnimatedCounter", "ProgressBar", "ProgressRing"]) assert.ok(top(b, "label") && top(b, "supportingText"), b);
    assert.ok(top("Chart", "title") && top("Chart", "description"));
    assert.ok(top("Audio", "title") && top("Audio", "caption"));
    assert.ok(!JSON.stringify(Object.keys(comps.Navigation.fields ?? {})).includes("contentEditable"));
    assert.ok(!top("OfferSummary", "ctaLabel"), "Offer content stays Settings-only");
  });
  await check("canvas editing renders: inline values shown, empty fields get builder placeholders, live page hides empties", () => {
    const acc = renderToStaticMarkup(h(AccordionRender, { id: "A", editing: true, allowMultiple: false, items: [{ id: "1", title: inline("Why?"), content: inline("") }] }));
    assert.match(acc, /<details open=""/, "all answers open for editing");
    assert.doesNotMatch(acc, /name="A"/, "single-open grouping off while editing");
    assert.match(acc, /--inline-placeholder:&quot;Answer&quot;/);
    const tabs = renderToStaticMarkup(h(TabsRender, { id: "T", editing: true, activeIndex: 0, alignment: "left", items: [{ label: inline("Overview"), content: inline("Body") }] }));
    assert.doesNotMatch(tabs, /<button/, "tab labels aren't buttons while editing");
    assert.match(text(tabs), /Overview Body/);
    const liveTabs = renderToStaticMarkup(h(TabsRender, { id: "T", activeIndex: 0, alignment: "left", items: [{ label: "Overview", content: "Body" }] }));
    assert.match(liveTabs, /<button type="button" role="tab"/);
    const proof = renderToStaticMarkup(h(ProofRender, { id: "P", editing: true, alignment: "left", items: [{ quote: inline("Loved it"), name: inline(""), role: inline(""), imageUrl: "", sourceLabel: inline("") }] }));
    assert.match(text(proof), /Loved it/);
    assert.match(proof, /--inline-placeholder:&quot;Name&quot;/);
    const liveProof = renderToStaticMarkup(h(ProofRender, { id: "P", alignment: "left", items: [{ quote: "Loved it", name: "", role: "", imageUrl: "", sourceLabel: "" }] }));
    assert.doesNotMatch(text(liveProof), /\bName\b/, "no 'Name' placeholder on the live page");
    const video = renderToStaticMarkup(h(VideoRender, { id: "V", url: "https://youtu.be/dQw4w9WgXcQ", caption: inline("My caption"), editing: true }));
    assert.match(video, /title="My caption"/);
    const stats = renderToStaticMarkup(h(StatsRender, { id: "S", editing: true, columns: 2, alignment: "left", items: [{ value: "10", label: inline("Clients"), supportingText: inline("") }] }));
    assert.match(text(stats), /Clients/);
    const bar = renderToStaticMarkup(h(ProgressBarRender, { id: "B", currentValue: 5, targetValue: 10, label: inline("Raised"), editing: true } as never));
    assert.match(bar, /aria-labelledby=/);
    assert.match(text(bar), /Raised/);
  });

  // ── Animations / registry / guard ────────────────────────────────────
  await check("Animations tab removed everywhere", () => {
    assert.doesNotMatch(read("src/components/pages-funnels/puck/settings-panel.tsx"), /value="animations"|Animations are coming soon/);
  });
  await check("new blocks registered, categorized, icon-mapped, column-allowed, recognised by the unknown-block guard", () => {
    const comps = clientPuckConfig.components as Record<string, unknown>;
    const elements = clientPuckConfig.categories?.elements?.components ?? [];
    const column = (comps.Column as { fields: { elements: { allow: string[] } } }).fields.elements.allow;
    for (const name of ["Embed", "Audio", "SocialLinks"]) {
      assert.ok(name in comps, name);
      assert.ok(elements.includes(name), `${name} category`);
      assert.ok(name in BLOCK_ICONS, `${name} icon`);
      assert.ok(column.includes(name), `${name} column`);
      assert.ok((KNOWN_PUCK_BLOCK_TYPES as readonly string[]).includes(name), `${name} guard`);
    }
    assert.deepEqual(findUnknownBlockTypes({ content: [{ type: "Embed", props: {} }, { type: "Audio", props: {} }, { type: "SocialLinks", props: {} }] }), []);
    const row = (comps.Row as { fields: Record<string, unknown> }).fields;
    assert.ok("columnOrder" in row, "Row has Column order");
  });
}

async function emulator() {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const svc = await import("../src/lib/server/pages-funnels-puck-service");
  const { readStoredPuckData } = await import("../src/lib/pages-funnels/puck-storage");
  const db = getAdminDb();
  const SA = `sa_w3_${Date.now()}`, PAGE = `pg_w3_${Date.now()}`;
  const tree = (heading: string, settings?: PageSettings): Data => {
    const base = { root: { props: {} }, content: [{ type: "Heading", props: { id: "Heading-1", text: heading, level: "h1" } }] } as unknown as Data;
    return settings ? withPageSettings(base, settings) : base;
  };
  const doc = async () => (await db.doc(`pages/${PAGE}`).get()).data()!;
  const published = async () => resolvePageSettings(readStoredPuckData((await doc()).puckPublishedData), (await doc()).seo);
  const draft = async () => resolvePageSettings(readStoredPuckData((await doc()).puckDraftData), (await doc()).seo);
  try {
    await db.doc(`pages/${PAGE}`).set({ subAccountId: SA, name: "QA · Wave 3", status: "draft", seo: { title: "Legacy title", description: "Legacy desc", ogImage: "" } });
    await check("legacy SEO is the starting point; Publish v1 with settings A", async () => {
      assert.equal((await svc.publishPuckPage(SA, PAGE, tree("v1", SETTINGS), {})).ok, true);
      assert.deepEqual(await published(), SETTINGS);
    });
    await check("draft settings change does NOT change the live page until Publish", async () => {
      const B = { ...SETTINGS, seoTitle: "Draft title", noindex: false, tracking: { ...SETTINGS.tracking, gtmId: "" } };
      assert.equal((await svc.savePuckDraft(SA, PAGE, tree("v2", B), {})).ok, true);
      assert.equal((await draft()).seoTitle, "Draft title");
      assert.equal((await published()).seoTitle, "Free Workshop", "live page still on A");
      assert.equal(derivePuckPublishStatus(await doc() as never), "published-outdated");
      assert.equal((await svc.publishPuckPage(SA, PAGE, tree("v2", B), {})).ok, true);
      assert.equal((await published()).seoTitle, "Draft title");
      assert.equal((await published()).tracking.gtmId, "");
    });
    await check("strict save refuses malformed tracking / image / background / embed and changes nothing", async () => {
      const before = JSON.stringify(await doc());
      for (const bad of [
        tree("x", { ...SETTINGS, tracking: { ...SETTINGS.tracking, ga4Id: "UA-1" } }),
        tree("x", { ...SETTINGS, socialImage: "javascript:x" }),
        { root: { props: { pageBackground: { source: "image", image: { url: "javascript:x" } } } }, content: [] } as unknown as Data,
        { root: { props: {} }, content: [{ type: "Embed", props: { id: "E", url: "javascript:alert(1)" } }] } as unknown as Data,
        { root: { props: {} }, content: [{ type: "Row", props: { id: "R", columnOrder: { mobile: "yes" }, columns: [] } }] } as unknown as Data,
      ]) {
        const r = await svc.savePuckDraft(SA, PAGE, bad, {});
        assert.equal(r.ok, false);
      }
      assert.equal(JSON.stringify(await doc()), before);
    });
    await check("rename is immediate and touches nothing else", async () => {
      const before = await doc();
      assert.equal((await svc.renamePuckPage(SA, PAGE, "QA · Wave 3 renamed")).ok, true);
      const after = await doc();
      assert.equal(after.name, "QA · Wave 3 renamed");
      assert.deepEqual(after.puckDraftData, before.puckDraftData);
      assert.deepEqual(after.puckPublishedData, before.puckPublishedData);
      assert.equal(after.status, "published");
      assert.equal((await svc.renamePuckPage("other_sa", PAGE, "Hijack")).ok, false, "foreign workspace can't rename");
    });
    await check("revert draft to published restores content, popups and settings in one write", async () => {
      const { createDefaultPopup } = await import("../src/types/pages-funnels-popup");
      const popups = { popup_a: createDefaultPopup("popup_a", "Draft only") };
      const saved = await svc.savePuckDraft(SA, PAGE, tree("unpublished edit", { ...SETTINGS, seoTitle: "Throwaway" }), popups as never);
      assert.equal(saved.ok, true, JSON.stringify(saved));
      assert.ok(Object.keys((await doc()).puckDraftPopups ?? {}).length > 0, "draft has a draft-only popup");
      assert.equal((await draft()).seoTitle, "Throwaway");
      assert.equal((await svc.revertPuckDraftToPublished(SA, PAGE)).ok, true);
      const d = await doc();
      assert.deepEqual(d.puckDraftData, d.puckPublishedData);
      assert.deepEqual(d.puckDraftPopups ?? {}, d.puckPublishedPopups ?? {});
      assert.equal((await draft()).seoTitle, "Draft title");
      assert.equal(derivePuckPublishStatus(d as never), "published");
    });
    await check("unpublish keeps draft + published copies; republish restores", async () => {
      const before = await doc();
      assert.equal((await svc.unpublishPuckPage(SA, PAGE)).ok, true);
      const off = await doc();
      assert.equal(off.status, "draft");
      assert.deepEqual(off.puckPublishedData, before.puckPublishedData, "published copy kept");
      assert.deepEqual(off.puckDraftData, before.puckDraftData, "draft kept");
      assert.equal(derivePuckPublishStatus(off as never), "unpublished");
      assert.equal((await svc.unpublishPuckPage(SA, PAGE)).ok, false, "can't unpublish twice");
      assert.equal((await svc.publishPuckPage(SA, PAGE, readStoredPuckData(off.puckDraftData)!, {})).ok, true);
      assert.equal((await doc()).status, "published");
    });
    await check("revert refuses a never-published page", async () => {
      const NEW = `${PAGE}_new`;
      await db.doc(`pages/${NEW}`).set({ subAccountId: SA, name: "never", status: "draft" });
      const r = await svc.revertPuckDraftToPublished(SA, NEW);
      assert.equal(r.ok, false);
      await db.doc(`pages/${NEW}`).delete();
    });
  } finally {
    await db.doc(`pages/${PAGE}`).delete().catch(() => {});
  }
}

async function main() {
  await offline();
  const emu = process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT?.startsWith("demo-");
  if (emu) await emulator();
  console.log(`Wave 3 builder checks: ${passed} passed${emu ? " (incl. emulator persistence)" : " (offline; set the emulator env for persistence)"}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
