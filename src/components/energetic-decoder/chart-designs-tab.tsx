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

/**
 * Chart Designs — list-first (2026-08-09), replacing the old single global
 * color picker (theme-card.tsx). Modeled on bodygraph.com's Chart Design
 * list per her direct instruction: "you have your chart design page, which
 * then gives you a list of the different chart designs, and you can create
 * a new one." See src/types/chart-design.ts for the write-through/scope
 * notes — only the DEFAULT design per system is actually applied anywhere
 * today; additional saved presets are real and listed but not yet
 * selectable per-reading (no plumbing for that exists yet).
 *
 * Card backgrounds rotate through the same MomentumOS-scoped tokens Growth
 * uses (bg-card/bg-secondary/bg-accent/bg-muted) instead of one uniform
 * card color — her direct ask (2026-08-09): "the growth tab... we had the
 * different colors for the different cards... more visually appealing."
 * This page already renders inside `.momentum-scope` (see page.tsx), so
 * these are real, already-established tokens, not new ones.
 */

const CARD_BG = ["bg-card", "bg-secondary", "bg-accent/20", "bg-muted"] as const;

export function EnergeticDecoderChartDesignsTab() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [designs, setDesigns] = useState<ChartDesign[] | null>(null);
  const [filter, setFilter] = useState<"all" | ChartDesignSystem>("all");
  const [open, setOpen] = useState(false);
  const [newSystem, setNewSystem] = useState<ChartDesignSystem>("humanDesign");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs`)
      .then((r) => r.json())
      .then((d) => setDesigns(d.designs ?? []))
      .catch(() => toast.error("Couldn't load chart designs."));
  }
  useEffect(load, [subAccountId]);

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
                    <button
                      type="button"
                      onClick={() => setNewSystem("humanDesign")}
                      className={cn("rounded-md px-3 py-1.5 text-sm font-medium", newSystem === "humanDesign" ? "bg-background shadow-sm" : "text-muted-foreground")}
                    >
                      Human Design
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSystem("astrology")}
                      className={cn("rounded-md px-3 py-1.5 text-sm font-medium", newSystem === "astrology" ? "bg-background shadow-sm" : "text-muted-foreground")}
                    >
                      Astrology
                    </button>
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
          {(["all", "humanDesign", "astrology"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", filter === f ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {f === "all" ? "All" : f === "humanDesign" ? "Human Design" : "Astrology"}
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
                onSetDefault={() => setDefault(d.id)}
                onDelete={() => remove(d.id)}
                onSaved={load}
              />
            ))}
          </div>
        )}

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-dashed p-3.5 text-xs text-muted-foreground">
          <span className="mt-0.5 rounded-full bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wide">Not built yet</span>
          <span>
            Mandala Chart — Bodygraph&apos;s decorative 64-gate wheel overlay. That&apos;s genuinely new chart geometry, not a missing
            color option here, so it isn&apos;t a 3rd system in this list yet.
          </span>
        </div>
      </div>
    </div>
  );
}

function ChartDesignCard({
  design,
  bg,
  subAccountId,
  isAdmin,
  onSetDefault,
  onDelete,
  onSaved,
}: {
  design: ChartDesign;
  bg: (typeof CARD_BG)[number];
  subAccountId: string;
  isAdmin: boolean;
  onSetDefault: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [color, setColor] = useState(design.chartDefinedColor);
  const [houseSystem, setHouseSystem] = useState(design.houseSystem);
  const [saving, setSaving] = useState(false);
  const dirty = design.system === "humanDesign" ? color !== design.chartDefinedColor : houseSystem !== design.houseSystem;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-designs/${design.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          design.system === "humanDesign" ? { chartDefinedColor: color } : { houseSystem },
        ),
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
          <p className="text-[11px] text-muted-foreground">{design.system === "humanDesign" ? "Human Design" : "Astrology"}</p>
        </div>
        {design.isDefault ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            <Star className="h-2.5 w-2.5 fill-current" />
            Default
          </span>
        ) : null}
      </div>

      {design.system === "humanDesign" ? (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!isAdmin}
            className="h-8 w-8 shrink-0 cursor-pointer rounded-md border disabled:cursor-not-allowed"
            aria-label="Defined-center color"
          />
          <Input value={color} onChange={(e) => setColor(e.target.value)} disabled={!isAdmin} className="h-8 text-xs" />
        </div>
      ) : (
        <select
          value={houseSystem}
          onChange={(e) => setHouseSystem(e.target.value as ChartDesign["houseSystem"])}
          disabled={!isAdmin}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed"
        >
          <option value="placidus">Placidus houses</option>
          <option value="whole">Whole Sign houses</option>
          <option value="equal">Equal houses</option>
        </select>
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
