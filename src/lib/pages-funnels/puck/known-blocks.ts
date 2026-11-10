import { decodeStoredPuckData } from "@/lib/pages-funnels/puck-storage";
import { normalizePopupMap } from "@/types/pages-funnels-popup";

/**
 * Unknown-block safety guard (2026-11-04). Every block type THIS build of the
 * Pages & Funnels builder can render and edit — exactly the keys of
 * `createPuckConfig(...).components` (client and server configs are the same
 * set; `pnpm check:puck-registry` fails if they ever drift). Kept as a plain
 * list so the server save path can check content without importing the
 * React block registry.
 *
 * Why: a stale preview or a rolled-back build can meet a page saved by a
 * NEWER build. Puck would drop or mangle block types it doesn't know, and
 * autosave would then write that damage back. So a page containing any type
 * not listed here is never opened for editing, and the save / publish path
 * refuses to write over it (see `findUnknownBlockTypesInPage`).
 *
 * Adding a block: register it in config.tsx AND add its type here.
 */
export const KNOWN_PUCK_BLOCK_TYPES = [
  "Accordion", "AnimatedCounter", "Audio", "AstrologyAspects", "AstrologyChart", "AstrologyHouses", "AstrologyKeyFacts",
  "AstrologyPlacements", "AtAGlance", "Booking", "Button", "Centers", "Channels", "Chart", "CheckoutBlock", "Column", "Countdown",
  "CustomHtml", "Divider", "Embed", "FeaturedOffer", "Form", "Gates", "GeneKeys", "Heading", "Hero", "HumanDesignChart",
  "Icon", "Image", "ImageGallery", "ImageSlider", "LogoStrip", "Mandala", "MandalaActivations", "MyMagnetixButton",
  "Navigation", "OfferSummary", "PdfButton", "PricingComparison", "ProgressBar", "ProgressRing", "ReadingReportButton", "ReadingTool",
  "RichText", "Row", "Section", "Skills", "SocialLinks", "Spacer", "Stats", "Tabs", "Testimonial", "Text", "Variables", "Video",
] as const;

const KNOWN = new Set<string>(KNOWN_PUCK_BLOCK_TYPES);

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Block types in the given Puck trees that this build doesn't know, sorted
 * and de-duplicated. A block is any object with a string `type` and an
 * object `props` (Puck's ComponentData shape); the walk goes through every
 * prop at any depth — slots, zones, blocks nested inside array items — so a
 * nested unknown block is found as reliably as a top-level one. Actions,
 * backgrounds and other `type`-tagged settings have no `props` and are not
 * blocks.
 */
export function findUnknownBlockTypes(...trees: unknown[]): string[] {
  const unknown = new Set<string>();
  const seen = new Set<object>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) return value.forEach(visit);
    const node = value as Record<string, unknown>;
    if (typeof node.type === "string" && isPlainObject(node.props) && !KNOWN.has(node.type)) unknown.add(node.type);
    Object.values(node).forEach(visit);
  };
  trees.forEach(visit);
  return [...unknown].sort();
}

/**
 * Unknown block types anywhere in a stored page: draft and published content
 * (decoded from `puck-json-v1`, or the legacy map shape) and both Popup maps.
 * An undecodable field contributes nothing here — unreadable content has its
 * own refusal (the builder won't open it; saves never decode it).
 */
export function findUnknownBlockTypesInPage(doc: {
  puckDraftData?: unknown;
  puckPublishedData?: unknown;
  puckDraftPopups?: unknown;
  puckPublishedPopups?: unknown;
}): string[] {
  const trees: unknown[] = [];
  for (const raw of [doc.puckDraftData, doc.puckPublishedData]) {
    if (raw == null) continue;
    const decoded = decodeStoredPuckData(raw);
    if (decoded.ok) trees.push(decoded.data);
  }
  for (const raw of [doc.puckDraftPopups, doc.puckPublishedPopups]) {
    if (raw == null) continue;
    trees.push(Object.values(normalizePopupMap(raw)).map((popup) => popup.content));
  }
  return findUnknownBlockTypes(...trees);
}

/** The plain-language reason a save / publish is refused. */
export function unknownBlocksSaveError(types: readonly string[]): string {
  return `This page includes newer content (${types.join(", ")}) that this version of the builder can't safely save. Nothing was changed — open the page in the current builder.`;
}
