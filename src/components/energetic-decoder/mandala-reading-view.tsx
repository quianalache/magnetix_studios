"use client";

import { useMemo, useState } from "react";
import {
  Users,
  Compass,
  CircleDot,
  Grid2x2,
  Hash,
  Sparkles,
  Sun,
  CloudRain,
  Utensils,
  Eye,
  Flame,
  Glasses,
  Grid3x3,
  Info,
} from "lucide-react";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { HD_BODY_LABELS } from "@/lib/energetics/human-design-data";
import type { HumanDesignReadingContent } from "@/types/energetic-decoder";
import type { ChartDesign } from "@/types/chart-design";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";
import { SkillLayerList } from "@/components/energetic-decoder/reading-summary";
import { cn } from "@/lib/utils";

/**
 * The Mandala reading workspace — approved mockup (2026-08-17). Replaces
 * the old `<HumanDesignSummary chartStyle="mandala">` call for the
 * Mandala tab specifically (see human-design-reading-workspace.tsx) with
 * a dedicated composition: Mandala + legend + activations on top, then
 * the person's core Human Design info, their 64 gates, Skills &
 * Attributes, and a compact "Understanding Your Mandala" reference
 * section near the bottom.
 *
 * Deliberately does NOT touch `HumanDesignSummary`/`MandalaChart` in a
 * way that changes their existing output — `HumanDesignSummary` itself
 * (still used by the public report page and the public decoder form) is
 * untouched; `MandalaChart` only gained two new OPTIONAL props
 * (showPersonality/showDesign, both default true — see its own header
 * comment), so every other caller renders identically to before. Skills
 * & Attributes reuses the exact same `SkillLayerList` + `profile.skills`
 * data `HumanDesignSummary` already renders (exported from reading-
 * summary.tsx for this reuse, not reimplemented).
 *
 * No new calculation anywhere in this file — every value comes straight
 * off the real HumanDesignProfile the rest of the app already computes
 * (activations, variables, skills) or off the sub-account's own Mandala
 * Chart Design (colors). The 64-gate grid iterates gates 1-64 directly
 * (display order), not GATE_WHEEL_ORDER (that's the Mandala's own real
 * zodiac-anchored angular order, a different, unrelated ordering).
 */

const HD_ICONS = {
  type: Users,
  strategy: Compass,
  authority: CircleDot,
  definition: Grid2x2,
  profile: Hash,
  incarnationCross: Sparkles,
  signature: Sun,
  notSelfTheme: CloudRain,
  digestion: Utensils,
  sense: Eye,
  motivation: Flame,
  perspective: Glasses,
  environment: Grid3x3,
};

function HdTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border bg-card p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value || "—"}</p>
      </div>
    </div>
  );
}

/** "Your Human Design" — core identity fields + the 5 real, calculated Variables the mockup surfaces (Digestion/Sense/Motivation/Perspective/Environment; Design Sense exists in the data too but wasn't asked for here). Real bug-avoidance: `profile.variables` is undefined on readings saved before 2026-08-10's local Variable calculation — each tile just reads "—" rather than fabricating a value, same convention HumanDesignSummary's own Variables block already uses. */
function HumanDesignCard({ profile }: { profile: HumanDesignProfile }) {
  const v = profile.variables;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-3 text-sm font-semibold">Your Human Design</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        <HdTile icon={HD_ICONS.type} label="Type" value={profile.type} />
        <HdTile icon={HD_ICONS.strategy} label="Strategy" value={profile.strategy} />
        <HdTile icon={HD_ICONS.authority} label="Inner Authority" value={profile.authority} />
        <HdTile icon={HD_ICONS.definition} label="Definition" value={profile.definitionLabel} />
        <HdTile icon={HD_ICONS.profile} label="Profile" value={profile.profile} />
        <HdTile icon={HD_ICONS.incarnationCross} label="Incarnation Cross" value={profile.incarnationCross} />
        <HdTile icon={HD_ICONS.signature} label="Signature" value={profile.signature} />
        <HdTile icon={HD_ICONS.notSelfTheme} label="Not-Self Theme" value={profile.notSelfTheme} />
        <HdTile icon={HD_ICONS.digestion} label="Digestion" value={v?.digestion.value} />
        <HdTile icon={HD_ICONS.sense} label="Sense" value={v?.sense.value} />
        <HdTile icon={HD_ICONS.motivation} label="Motivation" value={v?.motivation.value} />
        <HdTile icon={HD_ICONS.perspective} label="Perspective" value={v?.perspective.value} />
        <HdTile icon={HD_ICONS.environment} label="Environment" value={v?.environment.value} />
      </div>
      {!v && (
        <p className="mt-3 text-[11px] italic text-muted-foreground">
          Digestion/Sense/Motivation/Perspective/Environment aren&apos;t calculated for this reading (generated before local Variable calculation shipped).
        </p>
      )}
    </div>
  );
}

function LegendSwatch({ color, label, description }: { color: string; label: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/**
 * Mandala legend — real bug avoided here: the two color swatches below
 * read from `mandalaDesign.personalityActivationColor`/
 * `designActivationColor` (the SAME Chart Design fields MandalaChart
 * itself renders with), not a hardcoded "orange"/"purple" — changing
 * Chart Design changes these swatches automatically, same as the chart.
 * Labels never name a specific color, only what each ring/swatch means.
 */
function MandalaLegend({ mandalaDesign }: { mandalaDesign: ChartDesign }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legend</p>
      <div className="space-y-3">
        <LegendSwatch color={mandalaDesign.mandalaZodiacColor} label="Zodiac Ring" description="The outer ring places the 64 gates within the 12 zodiac signs, showing the relationship between Human Design and astrological positioning." />
        <LegendSwatch color={mandalaDesign.mandalaGateRingColor} label="64 Gates & I Ching" description="The middle ring shows the 64 Human Design gates. Each gate corresponds to one of the 64 hexagrams of the I Ching." />
        <LegendSwatch color={mandalaDesign.personalityActivationColor} label="Personality (Conscious)" description="Planets calculated at birth. The conscious side of the design." />
        <LegendSwatch color={mandalaDesign.designActivationColor} label="Design (Unconscious)" description="Planets calculated ~88 days before birth. The unconscious side of the design." />
        <LegendSwatch color={mandalaDesign.chartDefinedColor} label="Both Activated" description="A gate activated by both Personality and Design appears as a blend of the two colors in the Mandala." />
      </div>
    </div>
  );
}

/** "Your Activations" — the same real gate.line data ActivationColumn (human-design-full-chart.tsx) shows, just both sides in one compact list instead of two separate columns (more useful at this panel's narrower width). Uses the same HD_BODY_LABELS order/order-of-truth as every other activation list in the app. */
function ActivationsCard({ profile, mandalaDesign }: { profile: HumanDesignProfile; mandalaDesign: ChartDesign }) {
  const byPersonality = new Map<string, (typeof profile.personality)[number]>(profile.personality.map((a) => [a.body, a]));
  const byDesign = new Map<string, (typeof profile.design)[number]>(profile.design.map((a) => [a.body, a]));
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Activations</p>
        <Info className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mb-1.5 flex items-center justify-end gap-4 text-[10px] font-semibold uppercase tracking-wide">
        <span style={{ color: mandalaDesign.personalityActivationColor }}>Personality</span>
        <span style={{ color: mandalaDesign.designActivationColor }}>Design</span>
      </div>
      <div className="divide-y">
        {HD_BODY_LABELS.map(({ body, label, symbol }) => {
          const p = byPersonality.get(body);
          const d = byDesign.get(body);
          return (
            <div key={body} className="flex items-center justify-between gap-2 py-1.5 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                <span aria-hidden="true">{symbol}</span>
                <span className="truncate">{label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-4 font-semibold tabular-nums">
                <span style={{ color: mandalaDesign.personalityActivationColor }}>{p ? `${p.gate}.${p.line}` : "—"}</span>
                <span style={{ color: mandalaDesign.designActivationColor }}>{d ? `${d.gate}.${d.line}` : "—"}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * "Show in Mandala" — real, functional layer toggles (see MandalaChart's
 * own header comment for why this is safe/additive: two new optional
 * props, both default true, zero behavior change for every other
 * caller). No literal "Both" checkbox: a gate showing both colors is
 * just what happens automatically once a gate has real activations on
 * both sides and both toggles below are on — a 3rd checkbox here
 * wouldn't control anything independent, so it isn't faked as one.
 */
function VisibilityCard({
  showPersonality,
  showDesign,
  onChangePersonality,
  onChangeDesign,
  mandalaDesign,
}: {
  showPersonality: boolean;
  showDesign: boolean;
  onChangePersonality: (v: boolean) => void;
  onChangeDesign: (v: boolean) => void;
  mandalaDesign: ChartDesign;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show in Mandala</p>
      <label className="flex items-center gap-2 py-1 text-sm">
        <input type="checkbox" checked={showPersonality} onChange={(e) => onChangePersonality(e.target.checked)} className="h-3.5 w-3.5 rounded border-muted-foreground/40" style={{ accentColor: mandalaDesign.personalityActivationColor }} />
        Personality (Conscious)
      </label>
      <label className="flex items-center gap-2 py-1 text-sm">
        <input type="checkbox" checked={showDesign} onChange={(e) => onChangeDesign(e.target.checked)} className="h-3.5 w-3.5 rounded border-muted-foreground/40" style={{ accentColor: mandalaDesign.designActivationColor }} />
        Design (Unconscious)
      </label>
    </div>
  );
}

type GateFilter = "all" | "personality" | "design" | "both" | "inactive";

/** "Your Gates" — real activation state per gate (1-64, display order — not the Mandala's own zodiac-anchored GATE_WHEEL_ORDER), filterable by the same real Personality/Design/Both/Not Activated states MandalaChart itself distinguishes. Colors come from the sub-account's own Mandala Chart Design, never a hardcoded palette. */
function GatesGridCard({ profile, mandalaDesign }: { profile: HumanDesignProfile; mandalaDesign: ChartDesign }) {
  const [filter, setFilter] = useState<GateFilter>("all");
  const personalitySet = new Set(profile.personality.map((a) => a.gate));
  const designSet = new Set(profile.design.map((a) => a.gate));

  const gates = useMemo(() => Array.from({ length: 64 }, (_, i) => i + 1), []);
  const stateOf = (g: number): GateFilter => {
    const p = personalitySet.has(g);
    const d = designSet.has(g);
    if (p && d) return "both";
    if (p) return "personality";
    if (d) return "design";
    return "inactive";
  };
  const counts = gates.reduce(
    (acc, g) => {
      acc[stateOf(g)]++;
      return acc;
    },
    { all: 64, personality: 0, design: 0, both: 0, inactive: 0 } as Record<GateFilter, number>,
  );

  const tabs: { key: GateFilter; label: string }[] = [
    { key: "all", label: "All Gates" },
    { key: "personality", label: "Personality" },
    { key: "design", label: "Design" },
    { key: "both", label: "Both" },
    { key: "inactive", label: "Not Activated" },
  ];

  const colorFor = (state: GateFilter): string | undefined => {
    if (state === "personality") return mandalaDesign.personalityActivationColor;
    if (state === "design") return mandalaDesign.designActivationColor;
    if (state === "both") return mandalaDesign.chartDefinedColor;
    return undefined;
  };

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Your Gates</p>
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                filter === t.key ? "border-primary bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              {t.label} ({counts[t.key]})
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-16">
        {gates.map((g) => {
          const state = stateOf(g);
          const visible = filter === "all" || filter === state;
          const color = colorFor(state);
          return (
            <div
              key={g}
              className={cn(
                "flex h-8 items-center justify-center rounded-md border text-xs font-semibold tabular-nums",
                !visible && "opacity-20",
                !color && "text-muted-foreground",
              )}
              style={color ? { backgroundColor: color, borderColor: color, color: "#ffffff" } : undefined}
              title={`Gate ${g} — ${state === "inactive" ? "Not Activated" : state === "both" ? "Both" : state === "personality" ? "Personality" : "Design"}`}
            >
              {g}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: mandalaDesign.personalityActivationColor }} />
          Personality (Conscious)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: mandalaDesign.designActivationColor }} />
          Design (Unconscious)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: mandalaDesign.chartDefinedColor }} />
          Both Activated
        </span>
      </div>
    </div>
  );
}

function SkillsCard({ profile }: { profile: HumanDesignProfile & { content?: HumanDesignReadingContent } }) {
  if (!profile.skills) return null;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-2.5 text-sm font-semibold">Skills &amp; Attributes</p>
      {profile.skills.framingLine && (
        <p className="mb-2 text-[11px] italic leading-relaxed text-muted-foreground">{profile.skills.framingLine}</p>
      )}
      <SkillLayerList title="Core Strengths" entries={profile.skills.coreStrengths} />
      <SkillLayerList title="Signature Talents" entries={profile.skills.signatureTalents} />
      <SkillLayerList title="Natural Gifts" entries={profile.skills.naturalGifts} />
    </div>
  );
}

const UNDERSTANDING_CARDS = [
  {
    title: "Zodiac Ring",
    body: "The outer ring places the 64 Human Design gates within the 12 zodiac signs, showing the relationship between Human Design and astrological positioning.",
  },
  {
    title: "64 Gates & I Ching Hexagrams",
    body: "Each of the 64 Human Design gates corresponds to one of the 64 hexagrams of the I Ching. Every activated gate shows a 6-line stack marking which of that hexagram's lines is active for this reading.",
  },
  {
    title: "Planetary Activations",
    body: "Planetary positions activate specific gates in your chart. The Mandala visually shows exactly where those activations fall around the wheel.",
  },
  {
    title: "Personality & Design",
    body: "Personality is the conscious side of your design, calculated at the moment of birth. Design is the unconscious side, calculated from planetary positions roughly 88 days before birth. Magnetix distinguishes the two visually using the colors configured in your selected Chart Design.",
  },
  {
    title: "Both Activated",
    body: "When a gate is activated by both Personality and Design, its wedge in the Mandala appears as a blend of both colors — a real, distinct third state, not a coincidence of the other two.",
  },
];

function UnderstandingMandalaCard() {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="mb-3 text-sm font-semibold">Understanding Your Mandala</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {UNDERSTANDING_CARDS.map((c) => (
          <div key={c.title} className="rounded-xl border bg-muted/20 p-3">
            <p className="mb-1 text-xs font-semibold text-foreground">{c.title}</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MandalaReadingView({
  profile,
  mandalaDesign,
  hdDesign,
}: {
  profile: HumanDesignProfile & { content?: HumanDesignReadingContent };
  mandalaDesign: ChartDesign;
  hdDesign?: ChartDesign | null;
}) {
  const [showPersonality, setShowPersonality] = useState(true);
  const [showDesign, setShowDesign] = useState(true);

  return (
    <div className="space-y-6">
      {/*
       * Real bug caught rendering this for real (not assumed correct
       * from the JSX alone): a container query can't query the same
       * element it's declared on — @container has to live on an
       * ancestor of whatever uses @5xl:, the same split human-design-
       * full-chart.tsx's own @container/hdfc + @5xl/hdfc: already uses.
       * Putting both on one div silently never matched, so this stayed
       * single-column at every width until caught here.
       */}
      <div className="@container/mandalaview">
        <div className="grid grid-cols-1 gap-6 @5xl/mandalaview:grid-cols-[260px_minmax(0,1fr)_280px] @5xl/mandalaview:items-start">
        <div className="space-y-4">
          <div>
            <p className="text-lg font-bold text-foreground">Your Mandala</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              See how your planetary activations are distributed across the 64 Human Design gates and the zodiac.
            </p>
          </div>
          <MandalaLegend mandalaDesign={mandalaDesign} />
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <MandalaChart
            profile={profile}
            className="mx-auto w-full max-w-[600px]"
            gateColor={mandalaDesign.chartDefinedColor}
            backgroundColor={mandalaDesign.backgroundColor}
            personalityColor={mandalaDesign.personalityActivationColor}
            designColor={mandalaDesign.designActivationColor}
            zodiacColor={mandalaDesign.mandalaZodiacColor}
            gateRingColor={mandalaDesign.mandalaGateRingColor}
            quadrantColor={mandalaDesign.mandalaQuadrantColor}
            hdDesign={hdDesign}
            showPersonality={showPersonality}
            showDesign={showDesign}
          />
        </div>

        <div className="space-y-4">
          <ActivationsCard profile={profile} mandalaDesign={mandalaDesign} />
          <VisibilityCard
            showPersonality={showPersonality}
            showDesign={showDesign}
            onChangePersonality={setShowPersonality}
            onChangeDesign={setShowDesign}
            mandalaDesign={mandalaDesign}
          />
        </div>
        </div>
      </div>

      <HumanDesignCard profile={profile} />
      <GatesGridCard profile={profile} mandalaDesign={mandalaDesign} />
      <SkillsCard profile={profile} />
      <UnderstandingMandalaCard />

      <p className="text-center text-[11px] text-muted-foreground">
        The Mandala is a visualization tool for understanding planetary activations across the Human Design system. Use it together with the rest of your chart for a complete holistic interpretation.
      </p>
    </div>
  );
}
