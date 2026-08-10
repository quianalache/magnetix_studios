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
 */

const CARD_BG = ["bg-card", "bg-secondary", "bg-accent/20", "bg-muted"] as const;

const SYSTEM_LABEL: Record<ChartDesignSystem, string> = {
  humanDesign: "Human Design",
  astrology: "Astrology",
  mandala: "Mandala",
};

export function EnergeticDecoderChartDesignsTab() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [designs, setDesigns] = useState<ChartDesign[] | null>(null);
  const [filter, setFilter] = useState<"all" | ChartDesignSystem>("all");
  const [open, setOpen] = useState(false);
  const [newSystem, setNewSystem] = useState<ChartDesignSystem>("humanDesign");
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

  const shown = designs?.filter((d) => filter === "all" || d.system === filter) ?? [];

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
                    {(["humanDesign", "astrology", "mandala"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setNewSystem(s)}
                        className={cn("rounded-md px-3 py-1.5 text-sm font-medium", newSystem === s ? "bg-background shadow-sm" : "text-muted-foreground")}
                      >
                        {SYSTEM_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
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

        <div className="mb-4 inline-flex rounded-lg bg-muted/30 p-1">
          {(["all", "humanDesign", "astrology", "mandala"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", filter === f ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {f === "all" ? "All" : SYSTEM_LABEL[f]}
            </button>
          ))}
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
  backgroundColor: string;
  wheelAccentColor: string;
  houseSystem: ChartDesign["houseSystem"];
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
    backgroundColor: design.backgroundColor,
    wheelAccentColor: design.wheelAccentColor,
    houseSystem: design.houseSystem,
  };
}

/** Which of EditableFields actually apply to a given system — same real-vs-not distinction as chart-design.ts's field comments. The full-chart-layout fields (personalityActivationColor…planetBoxBorderRadius) are HD-only and show up here even though the BodyGraph itself doesn't read them — they drive human-design-full-chart.tsx. */
const SYSTEM_FIELDS: Record<ChartDesignSystem, (keyof EditableFields)[]> = {
  humanDesign: [
    "chartDefinedColor",
    "channelsColor",
    "gatesColor",
    "personalityActivationColor",
    "designActivationColor",
    "arrowColor",
    "arrowStyle",
    "planetBoxColor",
    "planetBoxMode",
    "planetBoxBorderRadius",
    "backgroundColor",
  ],
  astrology: ["wheelAccentColor", "backgroundColor", "houseSystem"],
  mandala: ["chartDefinedColor", "backgroundColor"],
};

const FIELD_LABEL: Record<keyof EditableFields, string> = {
  chartDefinedColor: "Defined centers",
  channelsColor: "Defined channels",
  gatesColor: "Gate accent",
  personalityActivationColor: "Personality activation",
  designActivationColor: "Design activation",
  arrowColor: "Variable arrows",
  arrowStyle: "Arrow style",
  planetBoxColor: "Planet box background (unused)",
  planetBoxMode: "Planet box style",
  planetBoxBorderRadius: "Planet box corner radius",
  backgroundColor: "Background",
  wheelAccentColor: "Wheel / planets",
  houseSystem: "House system",
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
          <p className="text-[11px] text-muted-foreground">{SYSTEM_LABEL[design.system]}</p>
        </div>
        {design.isDefault ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            <Star className="h-2.5 w-2.5 fill-current" />
            Default
          </span>
        ) : null}
      </div>

      <CardPreview design={design} fields={fields} sampleHd={sampleHd} sampleAstro={sampleAstro} />

      <div className="space-y-2">
        {relevant.map((key) =>
          key === "houseSystem" ? (
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
          ) : (
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
          ),
        )}
      </div>

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
    return (
      <HumanDesignChart
        profile={sampleHd}
        className="mx-auto w-full max-w-[220px]"
        definedColor={fields.chartDefinedColor}
        channelsColor={fields.channelsColor}
        gatesColor={fields.gatesColor}
        backgroundColor={fields.backgroundColor}
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
