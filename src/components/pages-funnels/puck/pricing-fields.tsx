"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { NavColorField } from "@/components/pages-funnels/puck/navigation-fields";
import { Hint } from "@/components/pages-funnels/puck/color-controls";
import { PRICING_LIMITS, normalizePricing, type CardAppearance, type PricingStyle } from "@/lib/pages-funnels/pricing";

/**
 * Pricing / Comparison card style (Wave 2C, Styles tab) — deliberately few
 * controls: card appearance, corner radius, gap, and one accent color (the
 * featured card, badges and check marks) from the existing Brand Colors
 * controls (Default / Brand color / Custom — no other palette).
 */
export function PricingStyleFieldEditor({ value, onChange }: { value: unknown; onChange: (v: PricingStyle) => void }) {
  const style = normalizePricing({ pricingStyle: value }).pricingStyle;
  const set = (patch: Partial<PricingStyle>) => onChange({ ...style, ...patch });
  const radiusId = `pricing-radius-${useId().replace(/:/g, "")}`;
  const gapId = `pricing-gap-${useId().replace(/:/g, "")}`;
  return (
    <div className="space-y-3" data-pricing-style-field="">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Cards</Label>
        <SegmentedControl<CardAppearance>
          value={style.appearance}
          onChange={(appearance) => set({ appearance })}
          options={[
            { value: "bordered", label: "Bordered" },
            { value: "shadow", label: "Shadow" },
            { value: "flat", label: "Flat" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={radiusId} className="text-xs font-semibold">Corner radius</Label>
          <Input id={radiusId} type="number" min={PRICING_LIMITS.radius[0]} max={PRICING_LIMITS.radius[1]} value={style.radius} onChange={(e) => set({ radius: Number(e.target.value) })} className="h-8 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={gapId} className="text-xs font-semibold">Gap</Label>
          <Input id={gapId} type="number" min={PRICING_LIMITS.gap[0]} max={PRICING_LIMITS.gap[1]} value={style.gap} onChange={(e) => set({ gap: Number(e.target.value) })} className="h-8 text-xs" />
        </div>
      </div>
      <NavColorField label="Accent" value={style.accent} onChange={(accent) => set({ accent })} defaultLabel="Default (page button color)" />
      <Hint>Used for the featured card, badges and check marks.</Hint>
    </div>
  );
}
