"use client";

import { ACTIVATED_TEXT, DESIGN_FILL, PERSONALITY_FILL } from "@/lib/energetics/human-design-chart-constants";
import { useMemo, useState } from "react";
import {
  CircleDot,
  CloudRain,
  Compass,
  Eye,
  Flame,
  Glasses,
  Grid2x2,
  Grid3x3,
  Hash,
  ScanEye,
  Sparkles,
  Sun,
  Users,
  Utensils,
} from "lucide-react";
import { HumanDesignFullChart } from "@/components/energetic-decoder/human-design-full-chart";
import { BlockSection, CARD } from "@/components/energetic-decoder/reading-blocks/block-section";
import { CENTERS, CENTER_LABELS, HD_BODY_LABELS } from "@/lib/energetics/human-design-data";
import { AUTHORITY_CONTENT, CENTER_CONTENT, LINE_CONTENT, TYPE_CONTENT } from "@/lib/energetics/human-design-content-data";
import {
  AT_A_GLANCE_FACT_LABEL,
  GATE_FILTER_LABEL,
  SKILL_LAYER_LABEL,
  type AtAGlanceFact,
  type CardsOrList,
  type CentersShow,
  type ChipsOrCards,
  type GateFilter,
  type GatesDisplay,
  type SkillLayer,
} from "@/lib/energetic-decoder/reading-block-settings";
import { cn } from "@/lib/utils";
import type { HumanDesignProfile, LocalSkillEntry } from "@/lib/energetics/human-design";
import type { HumanDesignReadingContent } from "@/types/energetic-decoder";
import type { ReadingBlockContext } from "@/types/reading-blocks";

/**
 * Human Design Reading blocks (2026-10-21). Every word of interpretation is
 * the Reading's own saved text (its Content Set, snapshotted when it was
 * created) — the built-in defaults are only a fallback for Readings saved
 * before that snapshot existed. Colors come from the Chart Design.
 */

type Profile = HumanDesignProfile & { content?: HumanDesignReadingContent };

const ICONS: Record<AtAGlanceFact, React.ComponentType<{ className?: string }>> = {
  type: Users,
  strategy: Compass,
  authority: CircleDot,
  profile: Hash,
  definition: Grid2x2,
  incarnationCross: Sparkles,
  signature: Sun,
  notSelfTheme: CloudRain,
};

/** The Reading's Chart Design colours, falling back to the chart's own
 *  defaults (and the Reading Tool's accent for "both"). */
function hdColors(ctx: ReadingBlockContext) {
  const d = ctx.designs.hdDesign;
  return {
    personality: d?.personalityActivationColor || PERSONALITY_FILL,
    design: d?.designActivationColor || DESIGN_FILL,
    both: d?.chartDefinedColor || ctx.accent,
  };
}

function profileLineNames(profile: Profile): string | null {
  if (!profile.profile) return null;
  const [a, b] = profile.profile.split("/");
  const name = (n: string | undefined) => (n ? profile.content?.lines?.[n] || LINE_CONTENT[Number(n)]?.name : undefined);
  const names = [name(a), name(b)].filter(Boolean);
  return names.length ? names.join(" / ") : null;
}

function factValue(profile: Profile, fact: AtAGlanceFact): { value: string | null; description: string | null } {
  const c = profile.content;
  switch (fact) {
    case "type":
      return { value: profile.type, description: c?.typeDescription || TYPE_CONTENT[profile.type]?.description || null };
    case "strategy":
      return { value: c?.typeStrategy || profile.strategy, description: null };
    case "authority":
      return { value: profile.authority, description: c?.authorityDescription || AUTHORITY_CONTENT[profile.authority]?.description || null };
    case "profile":
      return { value: profile.profile, description: profileLineNames(profile) };
    case "definition":
      return { value: profile.definitionLabel, description: null };
    case "incarnationCross":
      return { value: profile.incarnationCross, description: profile.skills?.framingLine ?? null };
    case "signature":
      return { value: profile.signature, description: null };
    case "notSelfTheme":
      return { value: profile.notSelfTheme, description: null };
  }
}

// ── Human Design Chart ─────────────────────────────────────────────────

export function HumanDesignChartBlock({ ctx, heading }: { ctx: ReadingBlockContext; heading?: string }) {
  const profile = ctx.reading.humanDesign;
  if (!profile) return null;
  return (
    <BlockSection kind="hd-chart" heading={heading}>
      {/* Design | BodyGraph | Personality, with the Variable arrows — three
          columns from tablet up, the compact M1 layout on phones. */}
      <HumanDesignFullChart profile={profile} design={ctx.designs.hdDesign} narrowLayout="compact" className="border" />
    </BlockSection>
  );
}

// ── At a Glance ────────────────────────────────────────────────────────

export function AtAGlanceBlock({
  ctx,
  heading,
  facts,
  layout = "cards",
  descriptions = true,
}: {
  ctx: ReadingBlockContext;
  heading?: string;
  facts: AtAGlanceFact[];
  layout?: CardsOrList;
  descriptions?: boolean;
}) {
  const profile = ctx.reading.humanDesign;
  if (!profile || facts.length === 0) return null;
  const rows = facts.map((f) => ({ fact: f, ...factValue(profile, f) })).filter((r) => r.value);
  if (rows.length === 0) return null;

  if (layout === "list") {
    return (
      <BlockSection kind="at-a-glance" heading={heading}>
        <dl className={cn(CARD, "divide-y p-0 sm:p-0")}>
          {rows.map((r) => (
            <div key={r.fact} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4 sm:px-5">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:pt-0.5">{AT_A_GLANCE_FACT_LABEL[r.fact]}</dt>
              <dd className="min-w-0">
                <p className="text-sm font-semibold text-pretty break-words text-foreground">{r.value}</p>
                {descriptions && r.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{r.description}</p>}
              </dd>
            </div>
          ))}
        </dl>
      </BlockSection>
    );
  }

  return (
    <BlockSection kind="at-a-glance" heading={heading}>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const Icon = ICONS[r.fact];
          const wide = r.fact === "incarnationCross" || (descriptions && !!r.description && (r.fact === "type" || r.fact === "authority"));
          return (
            <div key={r.fact} className={cn("flex items-start gap-3 rounded-2xl border bg-card p-4", wide && "min-[480px]:col-span-2 lg:col-span-1")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{AT_A_GLANCE_FACT_LABEL[r.fact]}</p>
                {/* Values wrap — never truncated or hover-only. */}
                <p className="text-sm font-semibold text-pretty break-words text-foreground">{r.value}</p>
                {descriptions && r.description && <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{r.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </BlockSection>
  );
}

// ── Centers ────────────────────────────────────────────────────────────

export function CentersBlock({
  ctx,
  heading,
  layout = "cards",
  show = "all",
  descriptions = true,
}: {
  ctx: ReadingBlockContext;
  heading?: string;
  layout?: CardsOrList;
  show?: CentersShow;
  descriptions?: boolean;
}) {
  const profile = ctx.reading.humanDesign as Profile | null;
  if (!profile) return null;
  const defined = new Set(profile.definedCenters);
  let centers = [...CENTERS];
  if (show === "definedFirst") centers = [...centers.filter((c) => defined.has(c)), ...centers.filter((c) => !defined.has(c))];
  if (show === "definedOnly") centers = centers.filter((c) => defined.has(c));
  if (centers.length === 0) {
    // A Reflector has no defined Centers — say so rather than vanish.
    return (
      <BlockSection kind="centers" heading={heading}>
        <p className={cn(CARD, "text-sm text-muted-foreground")}>All nine of your Centers are open.</p>
      </BlockSection>
    );
  }
  const item = (c: (typeof CENTERS)[number]) => {
    const isDefined = defined.has(c);
    const content = profile.content?.centers[c];
    const text = isDefined
      ? content?.definedText || CENTER_CONTENT[c].definedText
      : content?.undefinedText || CENTER_CONTENT[c].undefinedText;
    return { c, isDefined, text };
  };
  return (
    <BlockSection kind="centers" heading={heading}>
      <div className={layout === "list" ? cn(CARD, "divide-y p-0 sm:p-0") : "grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3"}>
        {centers.map(item).map(({ c, isDefined, text }) => (
          <div key={c} className={layout === "list" ? "px-4 py-3 sm:px-5" : cn("rounded-2xl border p-4", isDefined ? "border-primary/40 bg-primary/5" : "bg-card")}>
            <p className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
              <span>{CENTER_LABELS[c]}</span>
              <span className={cn("inline-flex items-center gap-1.5 text-micro font-medium", isDefined ? "text-primary" : "text-muted-foreground")}>
                <span className={cn("h-2 w-2 rounded-full", isDefined ? "bg-primary" : "border border-muted-foreground/50")} />
                {isDefined ? "Defined" : "Open"}
              </span>
            </p>
            {descriptions && text && <p className="mt-1.5 text-body-sm leading-relaxed text-muted-foreground">{text}</p>}
          </div>
        ))}
      </div>
    </BlockSection>
  );
}

// ── Channels ───────────────────────────────────────────────────────────

export function ChannelsBlock({
  ctx,
  heading,
  layout = "cards",
}: {
  ctx: ReadingBlockContext;
  heading?: string;
  layout?: ChipsOrCards;
}) {
  const profile = ctx.reading.humanDesign;
  if (!profile) return null;
  const channels = profile.definedChannels;
  const talents = new Map((profile.skills?.signatureTalents ?? []).map((t) => [t.meta ?? "", t]));
  if (channels.length === 0) {
    return (
      <BlockSection kind="channels" heading={heading}>
        <p className={cn(CARD, "text-sm text-muted-foreground")}>No Channels are defined in this chart — every Center stays open to the energy around you.</p>
      </BlockSection>
    );
  }
  if (layout === "chips") {
    return (
      <BlockSection kind="channels" heading={heading}>
        <div className="flex flex-wrap gap-2">
          {channels.map((ch) => (
            <span key={ch.key} className="rounded-full border bg-card px-3 py-1.5 text-sm font-medium text-foreground">
              {ch.gates[0]}–{ch.gates[1]}
              {ch.name ? <span className="text-muted-foreground"> · {ch.name}</span> : null}
            </span>
          ))}
        </div>
      </BlockSection>
    );
  }
  return (
    <BlockSection kind="channels" heading={heading}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {channels.map((ch) => {
          const talent = talents.get(`Gates ${ch.key}`) ?? null;
          return (
            <div key={ch.key} className="rounded-2xl border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">
                Channel {ch.gates[0]}–{ch.gates[1]}
                {ch.name ? ` · ${ch.name}` : ""}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Connects {CENTER_LABELS[ch.centers[0]]} and {CENTER_LABELS[ch.centers[1]]}
              </p>
              {talent?.description && <p className="mt-1.5 text-body-sm leading-relaxed text-muted-foreground">{talent.description}</p>}
            </div>
          );
        })}
      </div>
    </BlockSection>
  );
}

// ── Gates ──────────────────────────────────────────────────────────────

const GATE_FILTERS: GateFilter[] = ["all", "personality", "design", "both", "inactive"];

export function GatesBlock({
  ctx,
  heading,
  display = "grid",
  showFilters = true,
}: {
  ctx: ReadingBlockContext;
  heading?: string;
  display?: GatesDisplay;
  showFilters?: boolean;
}) {
  const profile = ctx.reading.humanDesign as Profile | null;
  const [filter, setFilter] = useState<GateFilter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const colors = hdColors(ctx);
  const byGate = useMemo(() => {
    const m = new Map<number, { side: "Personality" | "Design"; body: string; line: number }[]>();
    if (!profile) return m;
    for (const [side, list] of [["Personality", profile.personality], ["Design", profile.design]] as const) {
      for (const a of list) {
        const arr = m.get(a.gate) ?? [];
        arr.push({ side, body: a.body, line: a.line });
        m.set(a.gate, arr);
      }
    }
    return m;
  }, [profile]);
  if (!profile) return null;

  const stateOf = (g: number): GateFilter => {
    const acts = byGate.get(g) ?? [];
    const p = acts.some((a) => a.side === "Personality");
    const d = acts.some((a) => a.side === "Design");
    return p && d ? "both" : p ? "personality" : d ? "design" : "inactive";
  };
  const gates = Array.from({ length: 64 }, (_, i) => i + 1);
  const counts = gates.reduce((acc, g) => ({ ...acc, [stateOf(g)]: acc[stateOf(g)] + 1 }), { all: 64, personality: 0, design: 0, both: 0, inactive: 0 } as Record<GateFilter, number>);
  const colorFor = (s: GateFilter) => (s === "personality" ? colors.personality : s === "design" ? colors.design : s === "both" ? colors.both : undefined);
  const bodyLabel = (body: string) => HD_BODY_LABELS.find((b) => b.body === body);
  const lineName = (line: number) => profile.content?.lines?.[String(line)] || LINE_CONTENT[line]?.name || null;

  const detail = (g: number) => {
    const acts = byGate.get(g) ?? [];
    return (
      <div className="rounded-xl border bg-muted/30 p-3 text-sm" data-gate-detail={g}>
        <p className="font-semibold text-foreground">Gate {g}</p>
        {acts.length === 0 ? (
          <p className="mt-1 text-muted-foreground">Not activated in this chart — you take in this energy from others.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {acts.map((a, i) => {
              const b = bodyLabel(a.body);
              const ln = lineName(a.line);
              return (
                <li key={i} className="text-muted-foreground">
                  <span className="font-medium" style={{ color: a.side === "Personality" ? colors.personality : colors.design }}>
                    {a.side}
                  </span>{" "}
                  · {b ? `${b.symbol} ${b.label}` : a.body} · Line {a.line}
                  {ln ? ` — ${ln}` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  const filters = showFilters && (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter gates">
      {GATE_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={filter === f}
          onClick={() => setFilter(f)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filter === f ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {GATE_FILTER_LABEL[f]} ({counts[f]})
        </button>
      ))}
    </div>
  );

  const legend = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors.personality }} />Personality (conscious)</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors.design }} />Design (unconscious)</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colors.both }} />Both</span>
    </div>
  );

  if (display === "activeList") {
    const active = gates.filter((g) => stateOf(g) !== "inactive" && (filter === "all" || filter === stateOf(g)));
    return (
      <BlockSection kind="gates" heading={heading}>
        <div className={cn(CARD, "space-y-3")}>
          {filters}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(filter === "inactive" ? gates.filter((g) => stateOf(g) === "inactive") : active).map((g) => (
              <div key={g}>{detail(g)}</div>
            ))}
          </div>
          {legend}
        </div>
      </BlockSection>
    );
  }

  return (
    <BlockSection kind="gates" heading={heading}>
      <div className={cn(CARD, "space-y-3")}>
        {filters}
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-16">
          {gates.map((g) => {
            const state = stateOf(g);
            const visible = filter === "all" || filter === state;
            const color = colorFor(state);
            return (
              <button
                key={g}
                type="button"
                onClick={() => setOpen(open === g ? null : g)}
                aria-expanded={open === g}
                aria-label={`Gate ${g}, ${GATE_FILTER_LABEL[state === "inactive" ? "inactive" : state]}`}
                className={cn(
                  "flex h-9 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-opacity",
                  !visible && "opacity-20",
                  !color && "bg-card text-muted-foreground",
                  open === g && "ring-2 ring-primary ring-offset-1",
                )}
                style={color ? { backgroundColor: color, borderColor: color, color: ACTIVATED_TEXT } : undefined}
              >
                {g}
              </button>
            );
          })}
        </div>
        {open !== null ? detail(open) : <p className="text-xs text-muted-foreground">Tap a gate to see which planet activates it and its line.</p>}
        {legend}
      </div>
    </BlockSection>
  );
}

// ── Variables ──────────────────────────────────────────────────────────

const VARIABLE_FIELDS = [
  { key: "digestion", label: "Digestion", icon: Utensils, arrow: "digestion" },
  { key: "environment", label: "Environment", icon: Grid3x3, arrow: "environment" },
  { key: "perspective", label: "Perspective", icon: Glasses, arrow: "perspective" },
  { key: "motivation", label: "Motivation", icon: Flame, arrow: "motivation" },
  { key: "sense", label: "Sense", icon: Eye, arrow: null },
  { key: "designSense", label: "Design Sense", icon: ScanEye, arrow: null },
] as const;

export function VariablesBlock({
  ctx,
  heading,
  layout = "cards",
  descriptions = true,
}: {
  ctx: ReadingBlockContext;
  heading?: string;
  layout?: CardsOrList;
  descriptions?: boolean;
}) {
  const profile = ctx.reading.humanDesign;
  if (!profile) return null;
  const v = profile.variables;
  const arrows = profile.variableArrows;
  if (!v) {
    return (
      <BlockSection kind="variables" heading={heading}>
        <p className={cn(CARD, "text-sm text-muted-foreground")}>The Variables weren’t calculated for this Reading.</p>
      </BlockSection>
    );
  }
  return (
    <BlockSection kind="variables" heading={heading}>
      <div className={layout === "list" ? cn(CARD, "divide-y p-0 sm:p-0") : "grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3"}>
        {VARIABLE_FIELDS.map((f) => {
          const field = v[f.key as keyof typeof v] as { value: string; description: string } | undefined;
          if (!field?.value) return null;
          const arrow = f.arrow ? arrows?.[f.arrow] : null;
          const Icon = f.icon;
          return (
            <div key={f.key} className={layout === "list" ? "flex items-start gap-3 px-4 py-3 sm:px-5" : "flex items-start gap-3 rounded-2xl border bg-card p-4"}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  {f.label}
                  {arrow ? <span> · arrow {arrow.arrow === "Left" ? "left ←" : "right →"}</span> : null}
                </p>
                <p className="text-sm font-semibold text-pretty break-words text-foreground">{field.value}</p>
                {descriptions && field.description && <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{field.description}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </BlockSection>
  );
}

// ── Skills & Attributes ────────────────────────────────────────────────

function SkillList({ title, entries }: { title: string; entries: LocalSkillEntry[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {entries.map((e, i) => (
          <div key={`${e.headline}-${i}`} className="rounded-xl border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">
              {e.headline}
              {e.meta && <span className="font-normal text-muted-foreground"> · {e.meta}</span>}
            </p>
            {e.description && <p className="mt-1 text-body-sm leading-relaxed text-muted-foreground">{e.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkillsBlock({
  ctx,
  heading,
  layers,
}: {
  ctx: ReadingBlockContext;
  heading?: string;
  layers: SkillLayer[];
}) {
  const skills = ctx.reading.humanDesign?.skills;
  if (!skills) return null;
  // Each layer shows only when this chart has entries for it. A Reflector
  // (no defined Centers or Channels) still gets Natural Gifts — the section
  // never disappears just because Core Strengths is empty.
  const shown = layers.filter((l) => skills[l].length > 0);
  if (shown.length === 0) return null;
  return (
    <BlockSection kind="skills" heading={heading}>
      <div className={cn(CARD, "space-y-4")}>
        {skills.framingLine && <p className="text-sm italic leading-relaxed text-muted-foreground">{skills.framingLine}</p>}
        {shown.map((l) => (
          <SkillList key={l} title={SKILL_LAYER_LABEL[l]} entries={skills[l]} />
        ))}
      </div>
    </BlockSection>
  );
}
