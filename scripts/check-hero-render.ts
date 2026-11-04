/**
 * Hero public-render parity (Wave 2B-1 cleanup). Deterministic checks that
 * (a) the Image / Gallery "No image set" placeholder is editor-only, and
 * (b) Hero's default gradient is ONE concrete definition, so builder,
 * Preview and the public page can't resolve it to different theme colors.
 * Authored values (hex stops, solid colors, images) must render unchanged.
 * Run: pnpm check:hero
 */
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render, type Data } from "@puckeditor/core";
import {
  DEFAULT_BACKGROUND,
  HERO_DEFAULT_BACKGROUND,
  HERO_DEFAULT_GRADIENT_COLORS,
  backgroundCssValue,
  canonicalStopColor,
  gradientCssValue,
} from "../src/lib/pages-funnels/puck/background";
import { buildHeroSection } from "../src/lib/pages-funnels/puck/presets/hero";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { ImageRender } from "../src/components/pages-funnels/puck/elements";
import { GalleryRender, SliderRender } from "../src/components/pages-funnels/puck/parity-blocks";
import type { BackgroundConfig } from "../src/types/pages-funnels-puck";

let passed = 0;
const check = (label: string, fn: () => void) => {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`FAIL ${label}`);
    throw err;
  }
};

const CANONICAL_CSS = `linear-gradient(135deg, ${HERO_DEFAULT_GRADIENT_COLORS.start} 0%, ${HERO_DEFAULT_GRADIENT_COLORS.end} 100%)`;
const gradientBg = (stops: [string, number][], angle = 135): BackgroundConfig => ({
  source: "color",
  color: {
    mode: "gradient",
    solid: "",
    gradient: { type: "linear", angle, stops: stops.map(([color, position], i) => ({ id: `s${i}`, color, position })) },
  },
  blur: { enabled: false, intensity: 0 },
});

// ---- canonical default --------------------------------------------------
check("default Hero stops are concrete colors, not theme variables", () => {
  const stops = HERO_DEFAULT_BACKGROUND.color.gradient.stops;
  assert.deepEqual(stops.map((s) => s.color), [HERO_DEFAULT_GRADIENT_COLORS.start, HERO_DEFAULT_GRADIENT_COLORS.end]);
  for (const s of stops) assert.match(s.color, /^#[0-9A-F]{6}$/);
});
check("default Hero renders the canonical gradient", () => {
  assert.equal(backgroundCssValue(HERO_DEFAULT_BACKGROUND), CANONICAL_CSS);
  assert.ok(!backgroundCssValue(HERO_DEFAULT_BACKGROUND)!.includes("var("));
});
check("registry Hero defaultProps use the shared default", () => {
  const props = clientPuckConfig.components.Hero.defaultProps as { background: BackgroundConfig };
  assert.equal(props.background, HERO_DEFAULT_BACKGROUND);
});
check("buildHeroSection uses the shared default", () => {
  const section = buildHeroSection() as unknown as { props: { background: BackgroundConfig } };
  assert.equal(section.props.background, HERO_DEFAULT_BACKGROUND);
});
check("legacy stored default (theme variables) renders the canonical gradient", () => {
  assert.equal(backgroundCssValue(gradientBg([["var(--accent)", 0], ["var(--primary)", 100]])), CANONICAL_CSS);
});
check("legacy stop colors show as hex in the editor", () => {
  assert.equal(canonicalStopColor("var(--accent)"), HERO_DEFAULT_GRADIENT_COLORS.start);
  assert.equal(canonicalStopColor(" var(--primary) "), HERO_DEFAULT_GRADIENT_COLORS.end);
});

// ---- authored values preserved -----------------------------------------
check("explicit hex gradient is preserved", () => {
  assert.equal(backgroundCssValue(gradientBg([["#112233", 0], ["#AABBCC", 100]], 90)), "linear-gradient(90deg, #112233 0%, #AABBCC 100%)");
});
check("unrelated colors pass through canonicalStopColor", () => {
  for (const c of ["#ff0000", "rgb(1, 2, 3)", "var(--brand-primary)", "transparent"]) assert.equal(canonicalStopColor(c), c);
});
check("explicit solid background is preserved", () => {
  assert.equal(backgroundCssValue({ ...DEFAULT_BACKGROUND, source: "color", color: { ...DEFAULT_BACKGROUND.color, mode: "solid", solid: "#123456" } }), "#123456");
});
check("explicit image background is preserved", () => {
  assert.equal(
    backgroundCssValue({ ...DEFAULT_BACKGROUND, source: "image", image: { url: "https://example.com/bg.jpg" } } as BackgroundConfig),
    'url("https://example.com/bg.jpg") center / cover no-repeat',
  );
});
check("radial / angular authored gradients unchanged", () => {
  const g = gradientBg([["#000000", 0], ["#FFFFFF", 100]]).color.gradient;
  assert.equal(gradientCssValue({ ...g, type: "radial" }), "radial-gradient(circle, #000000 0%, #FFFFFF 100%)");
  assert.equal(gradientCssValue({ ...g, type: "angular", angle: 45 }), "conic-gradient(from 45deg, #000000 0%, #FFFFFF 100%)");
});

// ---- malformed / missing settings fall back safely ---------------------
check("missing or empty backgrounds render nothing", () => {
  assert.equal(backgroundCssValue(undefined), undefined);
  assert.equal(backgroundCssValue(DEFAULT_BACKGROUND), undefined);
  assert.equal(gradientCssValue(undefined), undefined);
  assert.equal(gradientCssValue({ type: "linear", angle: 0, stops: [] }), undefined);
});
check("malformed stop color does not throw", () => {
  assert.doesNotThrow(() => gradientCssValue({ type: "linear", angle: 0, stops: [{ id: "a", color: undefined as unknown as string, position: 0 }, { id: "b", color: "#000000", position: 100 }] }));
});
check("single legacy stop renders a flat canonical fill", () => {
  assert.equal(gradientCssValue({ type: "linear", angle: 0, stops: [{ id: "a", color: "var(--primary)", position: 0 }] }), HERO_DEFAULT_GRADIENT_COLORS.end);
});

// ---- Image placeholder is editor-only ----------------------------------
const imageProps = { id: "img", alt: "Product screenshot", action: { type: "none" as const } };
check("builder shows the no-image placeholder", () => {
  assert.match(renderToStaticMarkup(h(ImageRender, { ...imageProps, src: "", editing: true })), /No image set/);
});
check("Preview / public render nothing for a Hero image with no source", () => {
  assert.equal(renderToStaticMarkup(h(ImageRender, { ...imageProps, src: "", editing: false })), "");
  assert.equal(renderToStaticMarkup(h(ImageRender, { ...imageProps, src: "" })), "");
});
check("an image with a source renders in both modes", () => {
  for (const editing of [true, false]) {
    const html = renderToStaticMarkup(h(ImageRender, { ...imageProps, src: "https://example.com/a.png", editing }));
    assert.match(html, /<img[^>]+src="https:\/\/example.com\/a.png"/);
    assert.ok(!html.includes("No image set"));
  }
});
const galleryProps = { id: "g", columns: 2 as const, gap: 16, fit: "cover" as const, aspect: "square" as const, alignment: "left" as const };
check("Gallery empty slot placeholder is editor-only", () => {
  const images = [{ src: "", alt: "" }, { src: "https://example.com/b.png", alt: "B" }];
  assert.match(renderToStaticMarkup(h(GalleryRender, { ...galleryProps, images, editing: true })), /No image set/);
  const pub = renderToStaticMarkup(h(GalleryRender, { ...galleryProps, images, editing: false }));
  assert.ok(!pub.includes("No image set"));
  assert.match(pub, /src="https:\/\/example.com\/b.png"/);
});

check("Slider empty slide placeholder is editor-only", () => {
  const sp = { id: "sl", images: [{ src: "", alt: "" }], autoplay: false, interval: 5000, showControls: false, showDots: false };
  assert.match(renderToStaticMarkup(h(SliderRender, { ...sp, editing: true })), /No image set/);
  assert.ok(!renderToStaticMarkup(h(SliderRender, { ...sp, editing: false })).includes("No image set"));
});

// ---- whole default Hero through the real Puck renderer -----------------
const heroDefaults = clientPuckConfig.components.Hero.defaultProps as Record<string, unknown>;
const pageWith = (heroProps: Record<string, unknown>): Data => ({
  root: { props: {} },
  content: [{ type: "Hero", props: { id: "Hero-a", ...heroDefaults, ...heroProps } }],
} as unknown as Data);
const publicHtml = (data: Data) => renderToStaticMarkup(h(Render, { config: clientPuckConfig, data }));

check("default Hero visitor render: no placeholder, canonical gradient", () => {
  const html = publicHtml(pageWith({}));
  assert.ok(!html.includes("No image set"), "placeholder leaked");
  assert.ok(html.includes("Grow your list with a page that converts"));
  assert.ok(html.includes(`${HERO_DEFAULT_GRADIENT_COLORS.start} 0%`) && html.includes(`${HERO_DEFAULT_GRADIENT_COLORS.end} 100%`));
  assert.ok(!html.includes("var(--accent)") && !html.includes("var(--primary) 100%"));
});
check("legacy-stored Hero visitor render uses the canonical gradient", () => {
  const html = publicHtml(pageWith({ background: gradientBg([["var(--accent)", 0], ["var(--primary)", 100]]) }));
  assert.ok(html.includes(`${HERO_DEFAULT_GRADIENT_COLORS.start} 0%`));
});
check("authored Hero gradient renders unchanged", () => {
  const html = publicHtml(pageWith({ background: gradientBg([["#0A7E8C", 0], ["#F2C14E", 100]], 45) }));
  assert.ok(html.includes("linear-gradient(45deg, #0A7E8C 0%, #F2C14E 100%)"));
  assert.ok(!html.includes(HERO_DEFAULT_GRADIENT_COLORS.end));
});
check("Hero with missing background renders without crashing", () => {
  const html = publicHtml(pageWith({ background: undefined }));
  assert.ok(html.includes("Grow your list"));
});

console.log(`hero render checks: ${passed} passed`);
