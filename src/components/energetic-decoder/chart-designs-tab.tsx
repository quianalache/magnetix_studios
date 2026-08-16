"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Palette, Star, Trash2, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  defaultEnergeticDecoderTheme,
  type EnergeticDecoderTheme,
} from "@/types/energetic-decoder";
import type { ChartDesign, ChartDesignSystem } from "@/types/chart-design";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import type { CenterKey } from "@/lib/energetics/human-design-data";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";
import { MandalaChart } from "@/components/energetic-decoder/mandala-chart";

/**
 * Chart Designs — full rebuild 2026-08-09, per her explicit "I'm not
 * worried about how long it takes. Do the entire build please." Real
 * parity with the actual richness her Bodygraph account has, honestly
 * scoped to what this app's own chart renderers actually support (see
 * chart-design.ts's header comment for exactly what was and wasn't
 * cloned, and why).
 *
 * Two things this version adds that the v1 shipped without:
 *  1. Mandala as a real 3rd system (was a placeholder "not built yet"
 *     banner in v1 — the Mandala chart itself shipped the same day,
 *     mandala-chart.tsx, so it belongs here now).
 *  2. A live color preview per card, rendered against one fixed real
 *     sample chart (see the /chart-designs/preview route) using the
 *     exact same chart components every real report uses — not a static
 *     swatch. Reacts to unsaved edits before Save is even clicked, so
 *     "you say design, but design what" (her repeated feedback pattern
 *     this session) has an actual answer on screen.
 *
 * Card backgrounds rotate through the same MomentumOS-scoped tokens Growth
 * uses (bg-card/bg-secondary/bg-accent/bg-muted) instead of one uniform
 * card color — her direct ask (2026-08-09): "the growth tab... we had the
 * different colors for the different cards... more visually appealing."
 *
 * Decision Brief Decision 5 (owner-resolved 2026-08-15) — Mandala follows
 * the Bodygraph model: a Human Design chart STYLE, not a peer top-level
 * system. Bodygraph itself was re-checked before this change (its person-
 * page system dropdown offers Human Design / Astrology / Success Codex,
 * with Mandala one of Human Design's own chart-style options; the
 * Report Builder here already independently reached the same hierarchy —
 * `report-editor.tsx`'s CHART_PIECES labels its options "Human Design —
 * Full Chart" / "Human Design — Mandala" / "Astrology — Natal Wheel").
 * This tab was the one real holdout, presenting Human Design / Astrology
 * / Mandala as 3 flat peer filter chips and a 3-way system picker.
 *
 * Deliberately UI-only: `ChartDesignSystem` stays `"humanDesign" |
 * "astrology" | "mandala"`, `chart-design-service.ts`/the API routes are
 * untouched, and every existing `system: "mandala"` Firestore doc is
 * still valid as-is — Bodygraph's own Chart Design editor keeps an
 * independently stylable settings tree for Mandala too (confirmed in the
 * Bodygraph audit, Section 5: "its own left-nav item... not a shared/
 * derived style"), which is exactly what `SYSTEM_FIELDS.mandala` already
 * is here. Only the user-facing grouping/labeling changes: the filter
 * bar and the New Chart Design dialog now present Human Design as one
 * top-level choice with Traditional/Mandala as its two styles, Astrology
 * as the other top-level choice — never 3 flat peers — and every card
 * labels itself "Human Design — Traditional"/"Human Design — Mandala"/
 * "Astrology" instead of a bare system name. No migration, no renamed
 * enum values, no deleted or altered designs.
 */

const CARD_BG = ["bg-card", "bg-secondary", "bg-accent/20", "bg-muted"] as const;

/** Kept for internal/type-level use — the visible card/picker labels below use {@link designLabel} instead, which reflects the Human Design → Traditional/Mandala hierarchy (Decision 5). */
const SYSTEM_LABEL: Record<ChartDesignSystem, string> = {
  humanDesign: "Human Design",
  astrology: "Astrology",
  mandala: "Mandala",
};

/** User-facing label reflecting the corrected hierarchy — Mandala reads as a Human Design style, never a bare peer name. */
function designLabel(system: ChartDesignSystem): string {
  if (system === "mandala") return "Human Design — Mandala";
  if (system === "humanDesign") return "Human Design — Traditional";
  return "Astrology";
}

/** Top-level filter — Human Design and Astrology as peers, Mandala folded into Human Design (Decision 5). */
type TopFilter = "all" | "humanDesign" | "astrology";
/** Secondary filter, only meaningful/shown while `topFilter === "humanDesign"`. */
type HdStyleFilter = "all" | "humanDesign" | "mandala";

export function EnergeticDecoderChartDesignsTab() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [designs, setDesigns] = useState<ChartDesign[] | null>(null);
  const [topFilter, setTopFilter] = useState<TopFilter>("all");
  const [hdStyleFilter, setHdStyleFilter] = useState<HdStyleFilter>("all");
  const [open, setOpen] = useState(false);
  /** Top-level choice in the New Chart Design dialog — Human Design or Astrology, never Mandala directly. */
  const [newTop, setNewTop] = useState<"humanDesign" | "astrology">("humanDesign");
  /** Which Human Design style the new design actually is — only relevant/shown while `newTop === "humanDesign"`. */
  const [newHdStyle, setNewHdStyle] = useState<"humanDesign" | "mandala">("humanDesign");
  const newSystem: ChartDesignSystem = newTop === "astrology" ? "astrology" : newHdStyle;
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [sampleHd, setSampleHd] = useState<HumanDesignProfile | null>(null);
  const [sampleAstro, setSampleAstro] = useState<AstrologyChart | null>(null);

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs`)
      .then((r) => r.json())
      .then((d) => setDesigns(d.designs ?? []))
      .catch(() => toast.error("Couldn't load chart designs."));
  }
  useEffect(load, [subAccountId]);

  // One fixed real sample chart, shared by every card's live preview — see
  // the preview route's own header comment for why it's one shared demo
  // rather than a per-reading calculation.
  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs/preview`)
      .then((r) => r.json())
      .then((d) => {
        setSampleHd(d.humanDesign ?? null);
        setSampleAstro(d.astrology ?? null);
      })
      .catch(() => {
        setSampleHd(null);
        setSampleAstro(null);
      });
  }, [subAccountId]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system: newSystem, name: newName.trim() || "Untitled design" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Chart design created.");
      setOpen(false);
      setNewName("");
      load();
    } catch {
      toast.error("Couldn't create chart design.");
    } finally {
      setCreating(false);
    }
  }

  async function setDefault(id: string) {
    setDesigns((prev) =>
      prev?.map((d) => {
        const target = prev.find((x) => x.id === id)!;
        return d.system === target.system ? { ...d, isDefault: d.id === id } : d;
      }) ?? null,
    );
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Default design updated.");
    } catch {
      toast.error("Couldn't set default.");
      load();
    }
  }

  async function remove(id: string) {
    setDesigns((prev) => prev?.filter((d) => d.id !== id) ?? null);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't delete — set another design as default first if this one is the default.");
      load();
    }
  }

  // Decision 5 — Human Design and Mandala storage docs both live under the
  // "Human Design" top filter; hdStyleFilter narrows further to just one
  // style. Astrology is unaffected, still its own peer. "all" ignores both.
  const shown =
    designs?.filter((d) => {
      if (topFilter === "astrology") return d.system === "astrology";
      if (topFilter === "humanDesign") {
        if (d.system !== "humanDesign" && d.system !== "mandala") return false;
        return hdStyleFilter === "all" || d.system === hdStyleFilter;
      }
      return true;
    }) ?? [];

  return (
    <div className="space-y-5">
      <BrandCard subAccountId={subAccountId} isAdmin={isAdmin} savedTheme={subAccount?.energeticDecoderTheme} />

      <div className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Chart Designs</h2>
            <p className="text-sm text-muted-foreground">
              Saved color presets per system. The one marked Default is what your public tool and reports actually use today.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-3.5 w-3.5" />
              Create new
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New chart design</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>System</Label>
                  <div className="inline-flex rounded-lg bg-muted/30 p-1">
                    {(["humanDesign", "astrology"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewTop(s)}
                        className={cn("rounded-md px-3 py-1.5 text-sm font-medium", newTop === s ? "bg-background shadow-sm" : "text-muted-foreground")}
                      >
                        {SYSTEM_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Decision 5 — Mandala is never a 3rd top-level choice; it's the style picker one level down, inside Human Design. */}
                {newTop === "humanDesign" && (
                  <div className="space-y-2">
                    <Label>Human Design style</Label>
                    <div className="inline-flex rounded-lg bg-muted/30 p-1">
                      {(["humanDesign", "mandala"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setNewHdStyle(s)}
                          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", newHdStyle === s ? "bg-background shadow-sm" : "text-muted-foreground")}
                        >
                          {s === "mandala" ? "Mandala" : "Traditional"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Client Portal Match" />
                </div>
                <Button onClick={create} disabled={creating} className="w-full">
                  {creating ? "Creating…" : "Create chart design"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-muted/30 p-1">
            {(["all", "humanDesign", "astrology"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setTopFilter(f);
                  if (f !== "humanDesign") setHdStyleFilter("all");
                }}
                className={cn("rounded-md px-3 py-1.5 text-sm font-medium", topFilter === f ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                {f === "all" ? "All" : SYSTEM_LABEL[f]}
              </button>
            ))}
          </div>
          {/* Decision 5 — the Mandala/Traditional split shows only once Human Design is the active top filter, never as a 4th peer chip alongside it. */}
          {topFilter === "humanDesign" && (
            <div className="inline-flex rounded-lg bg-muted/30 p-1">
              {(["all", "humanDesign", "mandala"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setHdStyleFilter(f)}
                  className={cn("rounded-md px-3 py-1.5 text-xs font-medium", hdStyleFilter === f ? "bg-background shadow-sm" : "text-muted-foreground")}
                >
                  {f === "all" ? "Both styles" : f === "mandala" ? "Mandala" : "Traditional"}
                </button>
              ))}
            </div>
          )}
        </div>

        {designs === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Palette className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No designs in this filter yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((d, i) => (
              <ChartDesignCard
                key={d.id}
                design={d}
                bg={CARD_BG[i % CARD_BG.length]}
                subAccountId={subAccountId}
                isAdmin={isAdmin}
                sampleHd={sampleHd}
                sampleAstro={sampleAstro}
                onSetDefault={() => setDefault(d.id)}
                onDelete={() => remove(d.id)}
                onSaved={load}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface EditableFields {
  chartDefinedColor: string;
  channelsColor: string;
  gatesColor: string;
  /** Not wired into human-design-chart.tsx yet — see chart-design.ts's header comment. Saved/reloaded correctly; the BodyGraph itself keeps its current hardcoded colors until the full chart layout exists. */
  personalityActivationColor: string;
  designActivationColor: string;
  arrowColor: string;
  arrowStyle: ChartDesign["arrowStyle"];
  /** Currently unused by human-design-full-chart.tsx — see chart-design.ts's header comment. Still saved/reloaded correctly, control kept here for backward compatibility. */
  planetBoxColor: string;
  planetBoxMode: ChartDesign["planetBoxMode"];
  planetBoxBorderRadius: number;
  centersMode: ChartDesign["centersMode"];
  headCenterColor: string;
  ajnaCenterColor: string;
  throatCenterColor: string;
  gCenterColor: string;
  heartCenterColor: string;
  spleenCenterColor: string;
  sacralCenterColor: string;
  solarPlexusCenterColor: string;
  rootCenterColor: string;
  backgroundColor: string;
  wheelAccentColor: string;
  houseSystem: ChartDesign["houseSystem"];
  mandalaZodiacColor: string;
  mandalaGateRingColor: string;
  mandalaQuadrantColor: string;
}

function fieldsFrom(design: ChartDesign): EditableFields {
  return {
    chartDefinedColor: design.chartDefinedColor,
    channelsColor: design.channelsColor,
    gatesColor: design.gatesColor,
    personalityActivationColor: design.personalityActivationColor,
    designActivationColor: design.designActivationColor,
    arrowColor: design.arrowColor,
    arrowStyle: design.arrowStyle,
    planetBoxColor: design.planetBoxColor,
    planetBoxMode: design.planetBoxMode,
    planetBoxBorderRadius: design.planetBoxBorderRadius,
    centersMode: design.centersMode,
    headCenterColor: design.headCenterColor,
    ajnaCenterColor: design.ajnaCenterColor,
    throatCenterColor: design.throatCenterColor,
    gCenterColor: design.gCenterColor,
    heartCenterColor: design.heartCenterColor,
    spleenCenterColor: design.spleenCenterColor,
    sacralCenterColor: design.sacralCenterColor,
    solarPlexusCenterColor: design.solarPlexusCenterColor,
    rootCenterColor: design.rootCenterColor,
    backgroundColor: design.backgroundColor,
    wheelAccentColor: design.wheelAccentColor,
    houseSystem: design.houseSystem,
    mandalaZodiacColor: design.mandalaZodiacColor,
    mandalaGateRingColor: design.mandalaGateRingColor,
    mandalaQuadrantColor: design.mandalaQuadrantColor,
  };
}

/** The 9 per-center color keys — rendered as their own conditional block (only when centersMode is "traditional"), not through the generic per-key loop below, matching Bodygraph's own real behavior of hiding these 9 fields until its "Enable Traditional Centers Colors" toggle is on. Still included in SYSTEM_FIELDS.humanDesign so save()'s body-building loop and the dirty check naturally cover them. */
const CENTER_COLOR_KEYS = [
  "headCenterColor",
  "ajnaCenterColor",
  "throatCenterColor",
  "gCenterColor",
  "heartCenterColor",
  "spleenCenterColor",
  "sacralCenterColor",
  "solarPlexusCenterColor",
  "rootCenterColor",
] as const satisfies readonly (keyof EditableFields)[];

const CENTER_COLOR_KEY_SET: ReadonlySet<string> = new Set(CENTER_COLOR_KEYS);

const CENTER_COLOR_FIELD_TO_KEY: Record<(typeof CENTER_COLOR_KEYS)[number], CenterKey> = {
  headCenterColor: "head",
  ajnaCenterColor: "ajna",
  throatCenterColor: "throat",
  gCenterColor: "g",
  heartCenterColor: "heart",
  spleenCenterColor: "spleen",
  sacralCenterColor: "sacral",
  solarPlexusCenterColor: "solarplexus",
  rootCenterColor: "root",
};

/**
 * Which of EditableFields actually apply to a given system — same
 * real-vs-not distinction as chart-design.ts's field comments.
 *
 * 2026-08-10 field audit — arrowColor and planetBoxColor deliberately
 * excluded from the humanDesign list below: confirmed neither is read
 * by any renderer any more (arrows use designActivationColor/
 * personalityActivationColor per side; Planet Boxes use the same two
 * fields or render unfilled) — an editable control that visibly does
 * nothing is worse than no control, so they're hidden from this UI. The
 * fields themselves stay on the model/service/API/EditableFields/
 * FIELD_LABEL below completely untouched — still saved, still backfilled,
 * still returned by the API — this is a display-only omission, not a
 * removal, per her explicit "keep both fields in the underlying model/
 * API for backward compatibility."
 *
 * The full-chart-layout fields still shown (personalityActivationColor,
 * designActivationColor, arrowStyle, planetBoxMode, planetBoxBorderRadius)
 * are HD-only and drive human-design-full-chart.tsx, not the BodyGraph
 * directly. centersMode and the 9 per-center colors DO drive the
 * BodyGraph directly (human-design-chart.tsx).
 */
const SYSTEM_FIELDS: Record<ChartDesignSystem, (keyof EditableFields)[]> = {
  humanDesign: [
    "chartDefinedColor",
    "channelsColor",
    "gatesColor",
    "personalityActivationColor",
    "designActivationColor",
    "arrowStyle",
    "planetBoxMode",
    "planetBoxBorderRadius",
    "centersMode",
    ...CENTER_COLOR_KEYS,
    "backgroundColor",
  ],
  astrology: ["wheelAccentColor", "backgroundColor", "houseSystem"],
  // Expanded 2026-08-15 (Phase 6) — the Mandala rebuild added real layers
  // (zodiac ring, gate ring, quadrants, Personality/Design distinction)
  // that had no design controls before because there was nothing to
  // control. personalityActivationColor/designActivationColor are the
  // exact same fields humanDesign already exposes (see chart-design.ts's
  // header note on why this reuses them instead of adding a duplicate
  // pair) — a sub-account's Personality/Design colors now mean the same
  // thing consistently across HD Traditional and Mandala, not two
  // separately-configured pairs that could drift apart.
  mandala: [
    "chartDefinedColor",
    "personalityActivationColor",
    "designActivationColor",
    "mandalaZodiacColor",
    "mandalaGateRingColor",
    "mandalaQuadrantColor",
    "backgroundColor",
  ],
};

const FIELD_LABEL: Record<keyof EditableFields, string> = {
  chartDefinedColor: "Defined centers",
  // Real scope, confirmed 2026-08-10 field audit: only the 6 "Community
  // square" junction channels (10-20/10-34/10-57/20-34/20-57/34-57) ever
  // read this — every other complete channel now renders in the Design/
  // Personality two-tone split instead. Renamed from "Defined channels"
  // so the label doesn't overpromise; not repurposed yet, per her
  // explicit instruction.
  channelsColor: "Junction Channel Color",
  gatesColor: "Gate accent",
  personalityActivationColor: "Personality activation",
  designActivationColor: "Design activation",
  arrowColor: "Variable arrows",
  arrowStyle: "Arrow style",
  planetBoxColor: "Planet box background (unused)",
  planetBoxMode: "Planet box style",
  planetBoxBorderRadius: "Planet box corner radius",
  centersMode: "Centers color mode",
  headCenterColor: "Head",
  ajnaCenterColor: "Ajna",
  throatCenterColor: "Throat",
  gCenterColor: "G / Identity",
  heartCenterColor: "Heart / Ego",
  spleenCenterColor: "Spleen",
  sacralCenterColor: "Sacral",
  solarPlexusCenterColor: "Solar Plexus",
  rootCenterColor: "Root",
  backgroundColor: "Background",
  wheelAccentColor: "Wheel / planets",
  houseSystem: "House system",
  mandalaZodiacColor: "Zodiac ring",
  mandalaGateRingColor: "Gate ring",
  mandalaQuadrantColor: "Quadrant dividers",
};

/**
 * chartDefinedColor means something different per system (HD: defined-
 * center fill; Mandala: activated-gate accent ring — see chart-design.ts's
 * own field comment) but FIELD_LABEL above is one flat label per field
 * key. Real, pre-existing mislabel found while expanding Mandala's
 * controls 2026-08-15 (Phase 6) — the Mandala card showed "Defined
 * centers" for a field that has nothing to do with centers. Fixed with
 * this one small override rather than restructuring FIELD_LABEL into a
 * per-system map for a single affected field.
 */
function labelFor(system: ChartDesignSystem, key: keyof EditableFields): string {
  if (key === "chartDefinedColor" && system === "mandala") return "Activated gates";
  return FIELD_LABEL[key];
}

/**
 * Named color presets — Phase 7 (2026-08-15), the one item from the
 * parity audit's Phase 7 scope ("richer named presets," "reusable saved
 * presets") that's genuinely bounded: no new data model, no new page,
 * just a one-click shortcut that fills in the exact same fields the
 * pickers below already edit. Clicking a preset only updates local
 * `fields` state — same "dirty until Save" flow as editing any field by
 * hand, so a practitioner sees the live preview update and can still
 * back out before it's persisted.
 *
 * Deliberately aesthetic, not "authoritative" — these are curated color
 * combinations, not a claim about a traditional/standard Human Design
 * center-color convention. That distinction matters after the Mandala
 * hexagram-glyph decision earlier this session (mandala-chart.tsx's
 * header comment): shipping a specific 9-color "this is what Head/Ajna/
 * Throat/etc. are supposed to be" convention from memory carries the
 * same unverified-domain-fact risk, so presets never touch the 9
 * traditional per-center colors — only the fields every system already
 * shares (defined/gate accent, Personality/Design activation, ring
 * colors, background).
 */
interface ChartDesignPreset {
  name: string;
  swatch: readonly [string, string, string];
  values: Partial<EditableFields>;
}

const PRESETS: Record<ChartDesignSystem, readonly ChartDesignPreset[]> = {
  humanDesign: [
    { name: "Magnetix Violet", swatch: ["#7c3aed", "#a78bfa", "#f4f4f5"], values: { chartDefinedColor: "#7c3aed", channelsColor: "#a78bfa", gatesColor: "#c4b5fd", personalityActivationColor: "#7c3aed", designActivationColor: "#f59e0b", backgroundColor: "#ffffff" } },
    { name: "Monochrome", swatch: ["#27272a", "#71717a", "#ffffff"], values: { chartDefinedColor: "#27272a", channelsColor: "#71717a", gatesColor: "#a1a1aa", personalityActivationColor: "#27272a", designActivationColor: "#a1a1aa", backgroundColor: "#ffffff" } },
    { name: "Warm Sunset", swatch: ["#c2410c", "#f59e0b", "#fff7ed"], values: { chartDefinedColor: "#c2410c", channelsColor: "#f59e0b", gatesColor: "#fb923c", personalityActivationColor: "#c2410c", designActivationColor: "#f59e0b", backgroundColor: "#fff7ed" } },
    { name: "Midnight", swatch: ["#818cf8", "#38bdf8", "#0f1115"], values: { chartDefinedColor: "#818cf8", channelsColor: "#38bdf8", gatesColor: "#c4b5fd", personalityActivationColor: "#818cf8", designActivationColor: "#38bdf8", backgroundColor: "#0f1115" } },
  ],
  mandala: [
    { name: "Magnetix Violet", swatch: ["#7c3aed", "#a78bfa", "#f4f4f5"], values: { chartDefinedColor: "#7c3aed", personalityActivationColor: "#7c3aed", designActivationColor: "#f59e0b", mandalaZodiacColor: "#8b5cf6", mandalaGateRingColor: "#a78bfa", mandalaQuadrantColor: "#71717a", backgroundColor: "#ffffff" } },
    { name: "Monochrome", swatch: ["#27272a", "#71717a", "#ffffff"], values: { chartDefinedColor: "#27272a", personalityActivationColor: "#27272a", designActivationColor: "#a1a1aa", mandalaZodiacColor: "#52525b", mandalaGateRingColor: "#a1a1aa", mandalaQuadrantColor: "#d4d4d8", backgroundColor: "#ffffff" } },
    { name: "Warm Sunset", swatch: ["#c2410c", "#f59e0b", "#fff7ed"], values: { chartDefinedColor: "#c2410c", personalityActivationColor: "#c2410c", designActivationColor: "#f59e0b", mandalaZodiacColor: "#ea580c", mandalaGateRingColor: "#fb923c", mandalaQuadrantColor: "#d6a373", backgroundColor: "#fff7ed" } },
    { name: "Midnight", swatch: ["#818cf8", "#38bdf8", "#0f1115"], values: { chartDefinedColor: "#818cf8", personalityActivationColor: "#818cf8", designActivationColor: "#38bdf8", mandalaZodiacColor: "#a78bfa", mandalaGateRingColor: "#4b5563", mandalaQuadrantColor: "#374151", backgroundColor: "#0f1115" } },
  ],
  astrology: [
    { name: "Magnetix Violet", swatch: ["#7c3aed", "#a78bfa", "#f4f4f5"], values: { wheelAccentColor: "#7c3aed", backgroundColor: "#ffffff" } },
    { name: "Monochrome", swatch: ["#27272a", "#71717a", "#ffffff"], values: { wheelAccentColor: "#27272a", backgroundColor: "#ffffff" } },
    { name: "Warm Sunset", swatch: ["#c2410c", "#f59e0b", "#fff7ed"], values: { wheelAccentColor: "#c2410c", backgroundColor: "#fff7ed" } },
    { name: "Midnight", swatch: ["#818cf8", "#38bdf8", "#0f1115"], values: { wheelAccentColor: "#818cf8", backgroundColor: "#0f1115" } },
  ],
};

function ChartDesignCard({
  design,
  bg,
  subAccountId,
  isAdmin,
  sampleHd,
  sampleAstro,
  onSetDefault,
  onDelete,
  onSaved,
}: {
  design: ChartDesign;
  bg: (typeof CARD_BG)[number];
  subAccountId: string;
  isAdmin: boolean;
  sampleHd: HumanDesignProfile | null;
  sampleAstro: AstrologyChart | null;
  onSetDefault: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<EditableFields>(() => fieldsFrom(design));
  const [saving, setSaving] = useState(false);
  const relevant = SYSTEM_FIELDS[design.system];
  const dirty = relevant.some((k) => fields[k] !== fieldsFrom(design)[k]);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, string | number> = {};
      for (const k of relevant) body[k] = fields[k];
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs/${design.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success("Saved.");
      onSaved();
    } catch {
      toast.error("Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("space-y-3 rounded-xl border-none p-4 shadow-sm", bg)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{design.name}</p>
          <p className="text-[11px] text-muted-foreground">{designLabel(design.system)}</p>
        </div>
        {design.isDefault ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            <Star className="h-2.5 w-2.5 fill-current" />
            Default
          </span>
        ) : null}
      </div>

      <CardPreview design={design} fields={fields} sampleHd={sampleHd} sampleAstro={sampleAstro} />

      {isAdmin && (
        <div className="flex flex-wrap gap-1.5">
          {PRESETS[design.system].map((preset) => (
            <button
              key={preset.name}
              type="button"
              onClick={() => setFields((f) => ({ ...f, ...preset.values }))}
              title={`Apply "${preset.name}" — review the preview, then Save`}
              className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            >
              <span className="flex -space-x-1">
                {preset.swatch.map((c, i) => (
                  <span key={i} className="h-3 w-3 rounded-full border border-background" style={{ backgroundColor: c }} />
                ))}
              </span>
              {preset.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {relevant.map((key) =>
          // The 9 per-center colors render as their own block below, only
          // when traditional mode is on — not through this generic loop.
          CENTER_COLOR_KEY_SET.has(key) ? null : key === "houseSystem" ? (
            <select
              key={key}
              value={fields.houseSystem}
              onChange={(e) => setFields((f) => ({ ...f, houseSystem: e.target.value as ChartDesign["houseSystem"] }))}
              disabled={!isAdmin}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed"
            >
              <option value="placidus">Placidus houses</option>
              <option value="whole">Whole Sign houses</option>
              <option value="equal">Equal houses</option>
            </select>
          ) : key === "arrowStyle" ? (
            <select
              key={key}
              value={fields.arrowStyle}
              onChange={(e) => setFields((f) => ({ ...f, arrowStyle: e.target.value as ChartDesign["arrowStyle"] }))}
              disabled={!isAdmin}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed"
            >
              <option value="solid">Solid arrows</option>
              <option value="outline">Outline arrows</option>
            </select>
          ) : key === "planetBoxMode" ? (
            <select
              key={key}
              value={fields.planetBoxMode}
              onChange={(e) => setFields((f) => ({ ...f, planetBoxMode: e.target.value as ChartDesign["planetBoxMode"] }))}
              disabled={!isAdmin}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed"
            >
              <option value="iconOnly">Icon only — glyph colored, row plain</option>
              <option value="fullBox">Full box — entire row colored</option>
            </select>
          ) : key === "planetBoxBorderRadius" ? (
            <div key={key} className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                value={fields.planetBoxBorderRadius}
                onChange={(e) => setFields((f) => ({ ...f, planetBoxBorderRadius: Number(e.target.value) || 0 }))}
                disabled={!isAdmin || fields.planetBoxMode !== "fullBox"}
                className="h-8 w-20 text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                {FIELD_LABEL[key]}
                {fields.planetBoxMode !== "fullBox" && " (fullBox only)"}
              </span>
            </div>
          ) : key === "centersMode" ? (
            <select
              key={key}
              value={fields.centersMode}
              onChange={(e) => setFields((f) => ({ ...f, centersMode: e.target.value as ChartDesign["centersMode"] }))}
              disabled={!isAdmin}
              className="h-8 w-full rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed"
            >
              <option value="uniform">Uniform — one color, every defined center</option>
              <option value="traditional">Traditional — each center its own color</option>
            </select>
          ) : (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={fields[key]}
                  onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                  disabled={!isAdmin}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded-md border disabled:cursor-not-allowed"
                  aria-label={labelFor(design.system, key)}
                />
                <Input
                  value={fields[key]}
                  onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                  disabled={!isAdmin}
                  className="h-8 text-xs"
                />
                <span className="w-28 shrink-0 text-[11px] text-muted-foreground">{labelFor(design.system, key)}</span>
              </div>
              {key === "channelsColor" && (
                <p className="pl-10 text-[10px] leading-snug text-muted-foreground/70">
                  Applies only to special junction channels that do not use the Design/Personality split.
                </p>
              )}
            </div>
          ),
        )}
      </div>

      {/* Only shown when traditional mode is on — matches Bodygraph's own real "Enable Traditional Centers Colors" toggle, confirmed via the live audit, which hides these 9 fields until then rather than always showing them. */}
      {design.system === "humanDesign" && fields.centersMode === "traditional" && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Per-center colors</p>
          {CENTER_COLOR_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <input
                type="color"
                value={fields[key]}
                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                disabled={!isAdmin}
                className="h-8 w-8 shrink-0 cursor-pointer rounded-md border disabled:cursor-not-allowed"
                aria-label={FIELD_LABEL[key]}
              />
              <Input
                value={fields[key]}
                onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                disabled={!isAdmin}
                className="h-8 text-xs"
              />
              <span className="w-28 shrink-0 text-[11px] text-muted-foreground">{FIELD_LABEL[key]}</span>
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex gap-1.5">
            {dirty && (
              <Button size="sm" className="h-7 px-2.5 text-xs" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            )}
            {!design.isDefault && (
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={onSetDefault}>
                Set default
              </Button>
            )}
          </div>
          {!design.isDefault && (
            <button type="button" onClick={onDelete} className="shrink-0 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Live preview against the fixed real sample chart, reflecting unsaved edits. Same chart components every real report uses — not a mock swatch. */
function CardPreview({
  design,
  fields,
  sampleHd,
  sampleAstro,
}: {
  design: ChartDesign;
  fields: EditableFields;
  sampleHd: HumanDesignProfile | null;
  sampleAstro: AstrologyChart | null;
}) {
  if (design.system === "humanDesign") {
    if (!sampleHd) return <div className="h-32 animate-pulse rounded-lg bg-muted/40" />;
    const centerColors: Partial<Record<CenterKey, string>> = {};
    for (const key of CENTER_COLOR_KEYS) centerColors[CENTER_COLOR_FIELD_TO_KEY[key]] = fields[key];
    return (
      <HumanDesignChart
        profile={sampleHd}
        className="mx-auto w-full max-w-[220px]"
        definedColor={fields.chartDefinedColor}
        channelsColor={fields.channelsColor}
        gatesColor={fields.gatesColor}
        backgroundColor={fields.backgroundColor}
        centersMode={fields.centersMode}
        centerColors={centerColors}
      />
    );
  }
  if (design.system === "mandala") {
    if (!sampleHd) return <div className="h-32 animate-pulse rounded-lg bg-muted/40" />;
    return (
      <MandalaChart
        profile={sampleHd}
        className="mx-auto w-full max-w-[220px]"
        gateColor={fields.chartDefinedColor}
        backgroundColor={fields.backgroundColor}
        personalityColor={fields.personalityActivationColor}
        designColor={fields.designActivationColor}
        zodiacColor={fields.mandalaZodiacColor}
        gateRingColor={fields.mandalaGateRingColor}
        quadrantColor={fields.mandalaQuadrantColor}
        // This 220px card thumbnail previews the Mandala's OWN ring
        // colors — showing a second, real, full-size embedded BodyGraph
        // at this scale would be illegible and isn't what this preview is
        // for (compare against the HD Traditional card above it, which
        // previews that system's own chart, not a Mandala-in-miniature).
        showCenterChart={false}
      />
    );
  }
  if (!sampleAstro) return <div className="h-32 animate-pulse rounded-lg bg-muted/40" />;
  return (
    <AstrologyWheelChart
      chart={sampleAstro}
      className="mx-auto w-full max-w-[220px]"
      wheelAccentColor={fields.wheelAccentColor}
      backgroundColor={fields.backgroundColor}
    />
  );
}

/** Accent + logo — the general brand fields from the old theme-card.tsx, kept here since Chart Designs is their closest real home now that chartDefinedColor moved to per-design entities. */
function BrandCard({
  subAccountId,
  isAdmin,
  savedTheme,
}: {
  subAccountId: string;
  isAdmin: boolean;
  savedTheme?: Partial<EnergeticDecoderTheme> | null;
}) {
  const saved = { ...defaultEnergeticDecoderTheme(), ...(savedTheme ?? {}) };
  const [accent, setAccent] = useState(saved.accent);
  const [logoUrl, setLogoUrl] = useState(saved.logoUrl ?? "");
  const [saving, setSaving] = useState(false);

  if (!isAdmin) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent, logoUrl, chartDefinedColor: saved.chartDefinedColor }),
      });
      if (!res.ok) throw new Error();
      toast.success("Brand saved.");
    } catch {
      toast.error("Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-card p-6">
      <h2 className="mb-1 text-base font-semibold">Brand</h2>
      <p className="mb-4 text-sm text-muted-foreground">Your accent color and logo on the public reading tool — your clients see your business, not ours.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ed-brand-accent">Accent color</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-md border" aria-label="Accent color" />
            <Input id="ed-brand-accent" value={accent} onChange={(e) => setAccent(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-brand-logo">Logo URL</Label>
          <Input id="ed-brand-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Save brand
        </Button>
      </div>
    </div>
  );
}
