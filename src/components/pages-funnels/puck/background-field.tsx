"use client";

import { Plus, Trash2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ColorInput } from "@/components/ui/color-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  BackgroundConfig,
  BackgroundSource,
  ColorMode,
  GradientConfig,
  GradientStop,
} from "@/types/pages-funnels-puck";
import {
  DEFAULT_BACKGROUND,
  DEFAULT_GRADIENT,
  GRADIENT_TYPE_OPTIONS,
  MAX_GRADIENT_STOPS,
  MIN_GRADIENT_STOPS,
  gradientCssValue,
} from "@/lib/pages-funnels/puck/background";
import { newPuckNodeId } from "@/lib/pages-funnels/puck/ids";

/**
 * Production Background field editor — Phase 2D task §3/§4/§5/§7/§8. A
 * Puck `custom` field (a real, first-class, stable field type — `type:
 * "custom"` on `CustomField<Value>`, confirmed in the installed 0.23.0
 * package's types) rather than composed `object`/`resolveFields` fields
 * (Phase 2C's approach): the Phase 2C model only ever needed a flat
 * 3-choice enum with 0–1 conditional sub-groups, which `resolveFields`
 * handled fine; this phase's model (source tabs, solid-vs-gradient,
 * 3 gradient types, up to 10 add/remove/reposition color stops, blur)
 * needs one cohesive piece of UI managing its own internal layout, which a
 * single custom field's `render` function is the correct, supported tool
 * for. Puck still owns the field's actual state (this component only ever
 * calls the `onChange` it's handed — there is no separate state store).
 *
 * Used identically by Section, Row, and Column (config.tsx's shared
 * `backgroundField` export) — one field definition, not three.
 */

export function BackgroundFieldEditor({
  value,
  onChange,
}: {
  value: BackgroundConfig | undefined;
  onChange: (value: BackgroundConfig) => void;
}) {
  const bg = value ?? DEFAULT_BACKGROUND;

  function patch(partial: Partial<BackgroundConfig>) {
    onChange({ ...bg, ...partial });
  }
  function patchColor(partial: Partial<BackgroundConfig["color"]>) {
    patch({ color: { ...bg.color, ...partial } });
  }
  function patchGradient(partial: Partial<GradientConfig>) {
    patchColor({ gradient: { ...bg.color.gradient, ...partial } });
  }
  function patchBlur(partial: Partial<BackgroundConfig["blur"]>) {
    patch({ blur: { ...bg.blur, ...partial } });
  }

  return (
    <div className="space-y-4 px-1 pb-2">
      {/* Source: Color | Image | Video (§8) — Image/Video are typed and
          selectable so the mental model is right, but their own field UI
          isn't built this phase, per the task's explicit scope limit. */}
      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs font-medium">
          Background
        </Label>
        <SegmentedControl<BackgroundSource>
          value={bg.source}
          onChange={(source) => patch({ source })}
          options={[
            { value: "none", label: "None" },
            { value: "color", label: "Color" },
            { value: "image", label: "Image" },
            { value: "video", label: "Video" },
          ]}
        />
      </div>

      {bg.source === "color" && (
        <div className="border-border space-y-3 rounded-lg border p-3">
          <SegmentedControl<ColorMode>
            value={bg.color.mode}
            onChange={(mode) => patchColor({ mode })}
            options={[
              { value: "solid", label: "Solid" },
              { value: "gradient", label: "Gradient" },
            ]}
          />

          {bg.color.mode === "solid" && (
            <ColorInput
              label="Color"
              value={bg.color.solid || "#ffffff"}
              onChange={(hex) => patchColor({ solid: hex })}
            />
          )}

          {bg.color.mode === "gradient" && (
            <GradientEditor
              gradient={bg.color.gradient || DEFAULT_GRADIENT}
              onChange={patchGradient}
            />
          )}
        </div>
      )}

      {(bg.source === "image" || bg.source === "video") && (
        <p className="border-border bg-muted text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
          {bg.source === "image" ? "Image" : "Video"} backgrounds aren&apos;t
          editable yet — this is reserved for a future phase. Choose Color for
          now.
        </p>
      )}

      {/* Blur (§7) — grouped with Background, optional, independent of
          source/mode so it can eventually apply to image/video too. */}
      <div className="border-border space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <Label
            htmlFor="background-blur-toggle"
            className="text-xs font-medium"
          >
            Background Blur
          </Label>
          <Switch
            id="background-blur-toggle"
            checked={bg.blur.enabled}
            onCheckedChange={(enabled) =>
              patchBlur({
                enabled: !!enabled,
                // Flipping the toggle on while intensity is still at its
                // 0 default produces literally no visible change — caught
                // via live QA, where "enable Background Blur" appeared to
                // do nothing until the slider was also dragged up by hand.
                // A sensible non-zero starting intensity makes the toggle
                // itself immediately show its effect; the slider still
                // lets the user dial it back down to 0 (or anywhere else)
                // afterward. Only applies the default going 0 -> on — an
                // already-chosen intensity is never overwritten.
                intensity: enabled && bg.blur.intensity === 0 ? 12 : bg.blur.intensity,
              })
            }
          />
        </div>
        {bg.blur.enabled && (
          <div className="space-y-1">
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>Intensity</span>
              <span>{bg.blur.intensity}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={40}
              value={bg.blur.intensity}
              onChange={(e) => patchBlur({ intensity: Number(e.target.value) })}
              className="accent-primary w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function GradientEditor({
  gradient,
  onChange,
}: {
  gradient: GradientConfig;
  onChange: (partial: Partial<GradientConfig>) => void;
}) {
  const sortedStops = [...gradient.stops].sort(
    (a, b) => a.position - b.position
  );

  function updateStop(id: string, partial: Partial<GradientStop>) {
    onChange({
      stops: gradient.stops.map((s) =>
        s.id === id ? { ...s, ...partial } : s
      ),
    });
  }

  function addStop() {
    if (gradient.stops.length >= MAX_GRADIENT_STOPS) return;
    // Insert at the midpoint of the widest gap, where "gap" is measured
    // between consecutive points in [0, ...existing positions, 100] — the
    // 0/100 rail edges are always candidate boundaries, not just existing
    // stops. This is what makes the empty-gradient and single-stop cases
    // behave sensibly without a special case: with 0 stops the only gap is
    // [0,100] -> 50 (first stop lands in the middle); with exactly 1 stop
    // at 50 the gaps are [0,50] and [50,100] (50 each) -> the first one
    // wins -> 25, correctly landing the new stop somewhere OTHER than on
    // top of the existing one. (An earlier version of this function
    // special-cased "fewer than 2 stops" to a hardcoded 50, which put a
    // second stop exactly on top of a first stop already at 50 — caught via
    // live QA: two sequential "Add Color Stop" clicks produced a
    // degenerate, invisible `linear-gradient(... 50%, ... 50%)`.)
    const positions = [0, ...sortedStops.map((s) => s.position), 100];
    let bestGapStart = 0;
    let bestGapSize = -1;
    for (let i = 0; i < positions.length - 1; i++) {
      const gap = positions[i + 1] - positions[i];
      if (gap > bestGapSize) {
        bestGapSize = gap;
        bestGapStart = positions[i];
      }
    }
    const newPosition = Math.round(bestGapStart + bestGapSize / 2);
    onChange({
      stops: [
        ...gradient.stops,
        { id: newPuckNodeId(), color: "#ffffff", position: newPosition },
      ],
    });
  }

  function removeStop(id: string) {
    if (gradient.stops.length <= MIN_GRADIENT_STOPS) return;
    onChange({ stops: gradient.stops.filter((s) => s.id !== id) });
  }

  // Preview bar is always rendered as a left-to-right linear gradient
  // (regardless of the actual selected type) purely so stop position
  // markers map directly onto a horizontal 0–100% rail — radial/angular
  // previews would need a 2D surface to place markers meaningfully, out
  // of scope for this editor; the live CANVAS (not this rail) is what
  // shows the true rendered type.
  const previewBarCss = gradientCssValue({
    ...gradient,
    type: "linear",
    angle: 90,
  });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs font-medium">
          Gradient Type
        </Label>
        <SegmentedControl
          value={gradient.type}
          onChange={(type) => onChange({ type })}
          options={GRADIENT_TYPE_OPTIONS}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-muted-foreground text-xs font-medium">
          Color Stops
        </Label>
        <div
          className="border-border relative h-6 rounded-full border"
          style={{ background: previewBarCss }}
        >
          {gradient.stops.map((s) => (
            <div
              key={s.id}
              title={`${s.color} at ${s.position}%`}
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${s.position}%`, backgroundColor: s.color }}
            />
          ))}
        </div>

        <div className="space-y-2">
          {sortedStops.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <ColorInput
                value={s.color}
                onChange={(hex) => updateStop(s.id, { color: hex })}
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={s.position}
                onChange={(e) =>
                  updateStop(s.id, {
                    position: clamp(Number(e.target.value), 0, 100),
                  })
                }
                className="h-8 w-20 text-xs"
              />
              <span className="text-muted-foreground text-xs">%</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="ml-auto shrink-0"
                disabled={gradient.stops.length <= MIN_GRADIENT_STOPS}
                onClick={() => removeStop(s.id)}
                title={
                  gradient.stops.length <= MIN_GRADIENT_STOPS
                    ? `A gradient needs at least ${MIN_GRADIENT_STOPS} colors`
                    : "Remove color stop"
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "w-full",
            gradient.stops.length >= MAX_GRADIENT_STOPS && "opacity-50"
          )}
          disabled={gradient.stops.length >= MAX_GRADIENT_STOPS}
          onClick={addStop}
        >
          <Plus className="h-3.5 w-3.5" /> Add Color Stop
          {gradient.stops.length >= MAX_GRADIENT_STOPS &&
            ` (max ${MAX_GRADIENT_STOPS})`}
        </Button>
      </div>

      {/* Radial has no CSS angle concept — matches GradientConfig's own
          doc comment; hidden rather than shown-but-inert. */}
      {(gradient.type === "linear" || gradient.type === "angular") && (
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <span>
              {gradient.type === "linear" ? "Direction" : "Start Angle"}
            </span>
            <span>{gradient.angle}°</span>
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={gradient.angle}
            onChange={(e) => onChange({ angle: Number(e.target.value) })}
            className="accent-primary w-full"
          />
        </div>
      )}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
