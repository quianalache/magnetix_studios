import type { ComponentConfig, CustomField, Fields } from "@puckeditor/core";
import {
  AtAGlanceBlock,
  CentersBlock,
  ChannelsBlock,
  GatesBlock,
  HumanDesignChartBlock,
  SkillsBlock,
  VariablesBlock,
} from "@/components/energetic-decoder/reading-blocks/human-design-blocks";
import {
  AstrologyAspectsBlock,
  AstrologyChartBlock,
  AstrologyHousesBlock,
  AstrologyKeyFactsBlock,
  AstrologyPlacementsBlock,
  GeneKeysBlock,
  MandalaActivationsBlock,
  MandalaBlock,
} from "@/components/energetic-decoder/reading-blocks/chart-blocks";
import { FeaturedOfferBlock, MyMagnetixCta, PdfButton, ReadingReportButton } from "@/components/energetic-decoder/reading-blocks/next-step-blocks";
import { CheckboxListField, FeaturedOfferPickerField } from "@/components/pages-funnels/puck/reading-block-fields";
import {
  AT_A_GLANCE_FACTS,
  AT_A_GLANCE_FACT_LABEL,
  SKILL_LAYERS,
  SKILL_LAYER_LABEL,
  parseList,
  type CardsOrList,
  type CentersShow,
  type ChipsOrCards,
  type GatesDisplay,
  type WheelSize,
} from "@/lib/energetic-decoder/reading-block-settings";
import { FEATURED_OFFER_LAYOUTS, FEATURED_OFFER_LAYOUT_LABEL, normalizeFeaturedOfferPresentation } from "@/lib/energetic-decoder/embeds";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";
import type { ReadingBlockContext } from "@/types/reading-blocks";

/**
 * Reading blocks for the New Builder (2026-10-21) — available on Reading
 * Result Pages. Each block reads the Reading from `puck.metadata.
 * readingContext` (the real Reading on a published page, a sample chart in
 * the builder) and offers only a few domain choices. Spacing, backgrounds
 * and columns stay with Pages & Funnels; colors with the Chart Design;
 * wording with the Reading's saved Content Set.
 */

export const READING_BLOCK_NAMES = [
  "HumanDesignChart",
  "AtAGlance",
  "Centers",
  "Channels",
  "Gates",
  "Variables",
  "Skills",
  "Mandala",
  "MandalaActivations",
  "AstrologyChart",
  "AstrologyKeyFacts",
  "AstrologyHouses",
  "AstrologyPlacements",
  "AstrologyAspects",
  "GeneKeys",
] as const;

export const NEXT_STEP_BLOCK_NAMES = ["FeaturedOffer", "MyMagnetixButton", "PdfButton", "ReadingReportButton"] as const;

/** Every Reading-aware component name — Reading Result Pages only. */
export const ALL_READING_COMPONENT_NAMES: string[] = [...READING_BLOCK_NAMES, ...NEXT_STEP_BLOCK_NAMES];

const heading: Fields[string] = { type: "text", label: "Heading" };
const showHide = (label: string) => ({
  type: "radio" as const,
  label,
  options: [
    { label: "Show", value: true },
    { label: "Hide", value: false },
  ],
});
const cardsOrList = {
  type: "radio" as const,
  label: "Layout",
  options: [
    { label: "Cards", value: "cards" },
    { label: "List", value: "list" },
  ],
};
const wheelSize = {
  type: "radio" as const,
  label: "Size",
  options: [
    { label: "Medium", value: "medium" },
    { label: "Large", value: "large" },
  ],
};

const factsField: CustomField<string> = {
  type: "custom",
  label: "Facts to show",
  render: ({ value, onChange }) => (
    <CheckboxListField label="Facts to show" value={value} onChange={onChange} options={AT_A_GLANCE_FACTS.map((f) => ({ value: f, label: AT_A_GLANCE_FACT_LABEL[f] }))} />
  ),
};

const layersField: CustomField<string> = {
  type: "custom",
  label: "Layers",
  render: ({ value, onChange }) => (
    <CheckboxListField label="Layers" value={value} onChange={onChange} options={SKILL_LAYERS.map((l) => ({ value: l, label: SKILL_LAYER_LABEL[l] }))} />
  ),
};

const offerField: CustomField<string> = {
  type: "custom",
  label: "Offer",
  render: ({ value, onChange }) => <FeaturedOfferPickerField value={value} onChange={onChange} />,
};

/**
 * Renders a Reading block, or — in the builder only — a clear placeholder
 * while the sample loads or when the page isn't a Reading Result Page. On a
 * published page with no Reading it renders nothing at all.
 */
function Frame({ id, metadata, children }: { id: string; metadata: unknown; children: (ctx: ReadingBlockContext) => React.ReactNode }) {
  const meta = metadata as PuckPageMetadata | undefined;
  const ctx = meta?.readingContext;
  if (ctx) return <div id={id}>{children(ctx)}</div>;
  const builder = meta?.readingBuilder;
  if (!builder) return null;
  const text =
    builder.status === "loading"
      ? "Loading the sample Reading…"
      : builder.message || "Reading blocks show a Reading on a Reading Result Page.";
  return (
    <div id={id} className="border-border bg-muted text-muted-foreground flex min-h-24 items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center text-sm">
      {text}
    </div>
  );
}

type Comp = ComponentConfig<Record<string, unknown>>;

function readingComponent(
  label: string,
  fields: Fields,
  defaultProps: Record<string, unknown>,
  render: (ctx: ReadingBlockContext, props: Record<string, unknown>) => React.ReactNode,
): Comp {
  return {
    label,
    fields: fields as Comp["fields"],
    defaultProps,
    render: (props) => {
      const { id, puck, ...rest } = props as Record<string, unknown> & { id: string; puck: { metadata: unknown } };
      return (
        <Frame id={id} metadata={puck.metadata}>
          {(ctx) => render(ctx, rest)}
        </Frame>
      );
    },
  };
}

const s = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const b = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

export const readingPuckComponents: Record<string, Comp> = {
  HumanDesignChart: readingComponent(
    "Human Design Chart",
    { heading },
    { heading: "Your Human Design Chart" },
    (ctx, p) => <HumanDesignChartBlock ctx={ctx} heading={s(p.heading)} />,
  ),
  AtAGlance: readingComponent(
    "At a Glance",
    { heading, facts: factsField, layout: cardsOrList, descriptions: showHide("Descriptions") },
    { heading: "At a Glance", facts: "type,strategy,authority,profile,definition,incarnationCross,signature,notSelfTheme", layout: "cards", descriptions: true },
    (ctx, p) => (
      <AtAGlanceBlock
        ctx={ctx}
        heading={s(p.heading)}
        facts={parseList(p.facts, AT_A_GLANCE_FACTS, AT_A_GLANCE_FACTS)}
        layout={s(p.layout, "cards") as CardsOrList}
        descriptions={b(p.descriptions, true)}
      />
    ),
  ),
  Centers: readingComponent(
    "Centers",
    {
      heading,
      layout: cardsOrList,
      show: {
        type: "select",
        label: "Which Centers",
        options: [
          { label: "All nine, defined first", value: "definedFirst" },
          { label: "All nine, chart order", value: "all" },
          { label: "Defined only", value: "definedOnly" },
        ],
      },
      descriptions: showHide("Descriptions"),
    },
    { heading: "Your Centers", layout: "cards", show: "definedFirst", descriptions: true },
    (ctx, p) => (
      <CentersBlock ctx={ctx} heading={s(p.heading)} layout={s(p.layout, "cards") as CardsOrList} show={s(p.show, "definedFirst") as CentersShow} descriptions={b(p.descriptions, true)} />
    ),
  ),
  Channels: readingComponent(
    "Channels",
    {
      heading,
      layout: {
        type: "radio",
        label: "Layout",
        options: [
          { label: "Cards", value: "cards" },
          { label: "Chips", value: "chips" },
        ],
      },
    },
    { heading: "Your Channels", layout: "cards" },
    (ctx, p) => <ChannelsBlock ctx={ctx} heading={s(p.heading)} layout={s(p.layout, "cards") as ChipsOrCards} />,
  ),
  Gates: readingComponent(
    "Gates",
    {
      heading,
      display: {
        type: "radio",
        label: "Display",
        options: [
          { label: "All 64", value: "grid" },
          { label: "Activated list", value: "activeList" },
        ],
      },
      showFilters: showHide("Filters"),
    },
    { heading: "Your Gates", display: "grid", showFilters: true },
    (ctx, p) => <GatesBlock ctx={ctx} heading={s(p.heading)} display={s(p.display, "grid") as GatesDisplay} showFilters={b(p.showFilters, true)} />,
  ),
  Variables: readingComponent(
    "Variables",
    { heading, layout: cardsOrList, descriptions: showHide("Descriptions") },
    { heading: "Your Variables", layout: "cards", descriptions: true },
    (ctx, p) => <VariablesBlock ctx={ctx} heading={s(p.heading)} layout={s(p.layout, "cards") as CardsOrList} descriptions={b(p.descriptions, true)} />,
  ),
  Skills: readingComponent(
    "Skills & Attributes",
    { heading, layers: layersField },
    { heading: "Skills & Attributes", layers: "coreStrengths,signatureTalents,naturalGifts" },
    (ctx, p) => <SkillsBlock ctx={ctx} heading={s(p.heading)} layers={parseList(p.layers, SKILL_LAYERS, SKILL_LAYERS)} />,
  ),
  Mandala: readingComponent(
    "Mandala",
    { heading, size: wheelSize },
    { heading: "Your Mandala", size: "large" },
    (ctx, p) => <MandalaBlock ctx={ctx} heading={s(p.heading)} size={s(p.size, "large") as WheelSize} />,
  ),
  MandalaActivations: readingComponent(
    "Mandala Activations",
    { heading },
    { heading: "Your Activations" },
    (ctx, p) => <MandalaActivationsBlock ctx={ctx} heading={s(p.heading)} />,
  ),
  AstrologyChart: readingComponent(
    "Astrology Chart",
    { heading, size: wheelSize },
    { heading: "Your Natal Chart", size: "large" },
    (ctx, p) => <AstrologyChartBlock ctx={ctx} heading={s(p.heading)} size={s(p.size, "large") as WheelSize} />,
  ),
  AstrologyKeyFacts: readingComponent(
    "Astrology Key Facts",
    { heading, angles: showHide("Descendant, MC & IC"), descriptions: showHide("Descriptions") },
    { heading: "Your Big Three", angles: true, descriptions: true },
    (ctx, p) => <AstrologyKeyFactsBlock ctx={ctx} heading={s(p.heading)} angles={b(p.angles, true)} descriptions={b(p.descriptions, true)} />,
  ),
  AstrologyHouses: readingComponent(
    "Houses",
    { heading, descriptions: showHide("Descriptions") },
    { heading: "Your Houses", descriptions: true },
    (ctx, p) => <AstrologyHousesBlock ctx={ctx} heading={s(p.heading)} descriptions={b(p.descriptions, true)} />,
  ),
  AstrologyPlacements: readingComponent(
    "Placements",
    { heading, descriptions: showHide("Descriptions") },
    { heading: "Your Placements", descriptions: true },
    (ctx, p) => <AstrologyPlacementsBlock ctx={ctx} heading={s(p.heading)} descriptions={b(p.descriptions, true)} />,
  ),
  AstrologyAspects: readingComponent(
    "Aspects",
    { heading, showGrid: showHide("Aspect grid"), descriptions: showHide("Descriptions") },
    { heading: "Your Aspects", showGrid: true, descriptions: true },
    (ctx, p) => <AstrologyAspectsBlock ctx={ctx} heading={s(p.heading)} showGrid={b(p.showGrid, true)} descriptions={b(p.descriptions, true)} />,
  ),
  GeneKeys: readingComponent(
    "Gene Keys",
    { heading },
    { heading: "Your Gene Keys" },
    (ctx, p) => <GeneKeysBlock ctx={ctx} heading={s(p.heading)} />,
  ),
  FeaturedOffer: readingComponent(
    "Featured Offer",
    {
      offerId: offerField,
      headline: { type: "text", label: "Headline (optional)" },
      body: { type: "textarea", label: "Short copy (optional)" },
      ctaLabel: { type: "text", label: "Button label" },
      imageUrl: { type: "text", label: "Image URL (optional)" },
      badge: { type: "text", label: "Badge (optional)" },
      layout: { type: "radio", label: "Layout", options: FEATURED_OFFER_LAYOUTS.map((l) => ({ label: FEATURED_OFFER_LAYOUT_LABEL[l], value: l })) },
    },
    { offerId: "", headline: "", body: "", ctaLabel: "Learn more", imageUrl: "", badge: "", layout: "card" },
    (ctx, p) => <FeaturedOfferBlock ctx={ctx} offerId={s(p.offerId)} presentation={normalizeFeaturedOfferPresentation(p)} />,
  ),
  MyMagnetixButton: readingComponent(
    "MyMagnetix Button",
    {
      label: { type: "text", label: "Button label" },
      helper: { type: "text", label: "Helper line" },
      align: {
        type: "radio",
        label: "Alignment",
        options: [
          { label: "Center", value: "center" },
          { label: "Left", value: "left" },
        ],
      },
    },
    { label: "Open your Reading in MyMagnetix", helper: "First time here? Check your email to finish setting up access.", align: "center" },
    (ctx, p) => <MyMagnetixCta ctx={ctx} label={s(p.label) || undefined} helper={s(p.helper)} align={s(p.align, "center") as "left" | "center"} />,
  ),
  PdfButton: readingComponent(
    "PDF Button",
    { label: { type: "text", label: "Button label" } },
    { label: "Download PDF" },
    (ctx, p) => <PdfButton ctx={ctx} label={s(p.label) || undefined} />,
  ),
  ReadingReportButton: readingComponent(
    "Reading Report Button",
    { label: { type: "text", label: "Button label" } },
    { label: "View your Reading Report" },
    (ctx, p) => <ReadingReportButton ctx={ctx} label={s(p.label) || undefined} />,
  ),
};
