"use client";

import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ColorInput } from "@/components/ui/color-input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleGroupTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type {
  StyleConfig,
  StyleCompatibility,
  TypographyConfig,
  SpacingConfig,
  SpacingSides,
  BorderConfig,
  RadiusConfig,
  BoxShadowConfig,
  TextShadowConfig,
  ResponsiveConfig,
  DeviceVisibilityConfig,
  PuckAlignment,
  FontFamilyKey,
} from "@/types/pages-funnels-puck";
import { DEFAULT_STYLE_CONFIG } from "@/lib/pages-funnels/puck/style";

/**
 * The shared System A field editor (master spec §24.2/§24.3) — a single
 * component owning its own rich internal layout, rather than Puck
 * `object`/`resolveFields` composition, following the exact pattern
 * Phase 2D proved for Background (`background-field.tsx`'s
 * `BackgroundFieldEditor`): this UI's collapsible groups, linked/unlinked
 * side controls, and per-group compatibility gating need one cohesive
 * component managing its own layout the same way the gradient stop editor
 * did.
 *
 * The actual `CustomField<StyleConfig>` OBJECT (wrapping this component in
 * a `{type:"custom", label, render}` shape per component's compatibility)
 * is built in config.tsx itself, NOT here — deliberately. An earlier
 * version of this file exported a `createStyleField(compatibility)`
 * factory FUNCTION that config.tsx called directly at module scope; that
 * broke `next build` for the server config's docs harness route with
 * "Attempted to call createStyleField() from the server but
 * createStyleField is on the client": config.tsx is imported by BOTH the
 * client and server Puck configs (server-config.tsx has no "use client"
 * — it must stay server-import-safe), and directly CALLING a function
 * exported from a "use client" module at module-eval time crosses that
 * boundary in a way React's compiler forbids, even though simply
 * RENDERING a client component via JSX from server code (which is what
 * `backgroundField` in config.tsx already safely does with
 * `BackgroundFieldEditor`) is completely fine. Exporting only this
 * component — never a function config.tsx has to CALL — keeps that same
 * safe pattern intact for Styles too.
 *
 * `compatibility` is the literal, in-code component-compatibility matrix
 * (master spec §24, "define which shared style groups apply to which
 * components") — it only gates which GROUPS this instance's editor shows;
 * `style.ts`'s resolvers apply every group unconditionally, so nothing
 * here can disagree with what actually renders.
 *
 * NOTE on right-sidebar organization (master spec §24.2, General/Styles/
 * Animations): this component is what surfaces as "Styles" in each
 * component's Settings — see config.tsx's own doc comment for why the
 * literal three-tab split isn't attempted at the top-level Puck Fields
 * list (slot fields can't safely nest inside an `object` field, and
 * Puck's Fields panel has no other native section-header primitive this
 * task could safely reach for). This field's own internal collapsible
 * groups are what actually solves the "not one giant list" problem.
 */
const FONT_FAMILY_OPTIONS: { label: string; value: FontFamilyKey }[] = [
  { label: "System", value: "system" },
  { label: "Serif", value: "serif" },
  { label: "Rounded", value: "rounded" },
  { label: "Mono", value: "mono" },
];

const FONT_WEIGHT_OPTIONS: { label: string; value: string }[] = [
  { label: "300", value: "300" },
  { label: "400", value: "400" },
  { label: "500", value: "500" },
  { label: "600", value: "600" },
  { label: "700", value: "700" },
  { label: "800", value: "800" },
];

const FONT_STYLE_OPTIONS = [
  { label: "Normal", value: "normal" },
  { label: "Italic", value: "italic" },
] as const;

const TEXT_TRANSFORM_OPTIONS = [
  { label: "None", value: "none" },
  { label: "UPPER", value: "uppercase" },
  { label: "lower", value: "lowercase" },
  { label: "Cap", value: "capitalize" },
] as const;

const TEXT_ALIGN_OPTIONS: { label: string; value: PuckAlignment }[] = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
];

const BORDER_STYLE_OPTIONS = [
  { label: "None", value: "none" },
  { label: "Solid", value: "solid" },
  { label: "Dashed", value: "dashed" },
  { label: "Dotted", value: "dotted" },
] as const;

export function StyleFieldEditor({
  value,
  onChange,
  compatibility,
}: {
  value: StyleConfig | undefined;
  onChange: (value: StyleConfig) => void;
  compatibility: StyleCompatibility;
}) {
  const cfg = value ?? DEFAULT_STYLE_CONFIG;

  function patch(partial: Partial<StyleConfig>) {
    onChange({ ...cfg, ...partial });
  }

  const showBorderGroup = compatibility.border || compatibility.radius;
  const showShadowGroup = compatibility.boxShadow || compatibility.textShadow;

  return (
    <div className="space-y-1 px-1 pb-2">
      {compatibility.typography && (
        <Group label="Typography" defaultOpen>
          <TypographyEditor
            typography={cfg.typography}
            onChange={(typography) => patch({ typography })}
          />
        </Group>
      )}

      {compatibility.spacing && (
        <Group label="Spacing">
          <SpacingEditor
            spacing={cfg.spacing}
            onChange={(spacing) => patch({ spacing })}
          />
        </Group>
      )}

      {showBorderGroup && (
        <Group label="Border & Radius">
          {compatibility.border && (
            <BorderEditor
              border={cfg.border}
              onChange={(border) => patch({ border })}
            />
          )}
          {compatibility.radius && (
            <RadiusEditor
              radius={cfg.radius}
              onChange={(radius) => patch({ radius })}
            />
          )}
        </Group>
      )}

      {showShadowGroup && (
        <Group label="Shadow">
          {compatibility.boxShadow && (
            <BoxShadowEditor
              shadow={cfg.boxShadow}
              onChange={(boxShadow) => patch({ boxShadow })}
            />
          )}
          {compatibility.textShadow && (
            <TextShadowEditor
              shadow={cfg.textShadow}
              onChange={(textShadow) => patch({ textShadow })}
            />
          )}
        </Group>
      )}

      {compatibility.responsive && (
        <Group label="Responsive">
          <ResponsiveEditor
            responsive={cfg.responsive}
            onChange={(responsive) => patch({ responsive })}
          />
        </Group>
      )}

      {compatibility.visibility && (
        <Group label="Visibility">
          <VisibilityEditor
            visibility={cfg.visibility}
            onChange={(visibility) => patch({ visibility })}
          />
        </Group>
      )}
    </div>
  );
}

function Group({
  label,
  defaultOpen,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="border-border/60 border-b last:border-b-0"
    >
      <CollapsibleGroupTrigger>{label}</CollapsibleGroupTrigger>
      <CollapsibleContent>
        <div className="space-y-3 pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Compact labeled row — shared layout for every small control in this file. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-muted-foreground text-xs font-medium">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function NumberField({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
  suffix,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={value ?? ""}
        placeholder={placeholder ?? "Default"}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? undefined : Number(raw));
        }}
        className="h-8 w-20 text-xs"
      />
      {suffix && (
        <span className="text-muted-foreground text-xs">{suffix}</span>
      )}
    </div>
  );
}

/** Plain native `<select>` — no dedicated Select component exists in this
 *  repo's ui/ yet (checked before building this file); styled to match
 *  Input's density rather than introducing a new dependency for one field. */
function NativeSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  options: { label: string; value: T }[];
  placeholder?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
      className="border-input bg-background h-8 rounded-md border px-2 text-xs"
    >
      <option value="">{placeholder ?? "Default"}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---------- Typography ----------

function TypographyEditor({
  typography,
  onChange,
}: {
  typography: TypographyConfig;
  onChange: (t: TypographyConfig) => void;
}) {
  function patch(partial: Partial<TypographyConfig>) {
    onChange({ ...typography, ...partial });
  }
  return (
    <>
      <Row label="Font Family">
        <NativeSelect
          value={typography.fontFamily}
          onChange={(fontFamily) => patch({ fontFamily })}
          options={FONT_FAMILY_OPTIONS}
        />
      </Row>
      <Row label="Font Size">
        <NumberField
          value={typography.fontSize}
          onChange={(fontSize) => patch({ fontSize })}
          min={8}
          max={160}
          suffix="px"
        />
      </Row>
      <Row label="Font Weight">
        <NativeSelect
          value={
            typography.fontWeight ? String(typography.fontWeight) : undefined
          }
          onChange={(v) =>
            patch({
              fontWeight: v
                ? (Number(v) as TypographyConfig["fontWeight"])
                : undefined,
            })
          }
          options={FONT_WEIGHT_OPTIONS}
        />
      </Row>
      <Row label="Font Style">
        <SegmentedControl
          value={typography.fontStyle ?? "normal"}
          onChange={(fontStyle) =>
            patch({ fontStyle: fontStyle === "normal" ? undefined : fontStyle })
          }
          options={[...FONT_STYLE_OPTIONS]}
        />
      </Row>
      <Row label="Line Height">
        <NumberField
          value={typography.lineHeight}
          onChange={(lineHeight) => patch({ lineHeight })}
          min={0.8}
          max={3}
          step={0.1}
        />
      </Row>
      <Row label="Letter Spacing">
        <NumberField
          value={typography.letterSpacing}
          onChange={(letterSpacing) => patch({ letterSpacing })}
          min={-4}
          max={16}
          step={0.5}
          suffix="px"
        />
      </Row>
      <Row label="Alignment">
        <SegmentedControl
          value={typography.textAlign ?? ("" as PuckAlignment)}
          onChange={(textAlign) => patch({ textAlign })}
          options={TEXT_ALIGN_OPTIONS}
        />
      </Row>
      <Row label="Color">
        <ColorInput
          value={typography.color || "#111111"}
          onChange={(color) => patch({ color })}
        />
      </Row>
      <Row label="Opacity">
        <div className="flex w-32 items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            value={typography.opacity ?? 100}
            onChange={(e) => patch({ opacity: Number(e.target.value) })}
            className="accent-primary w-full"
          />
          <span className="text-muted-foreground w-8 text-right text-xs">
            {typography.opacity ?? 100}%
          </span>
        </div>
      </Row>
      <Row label="Transform">
        <SegmentedControl
          value={typography.textTransform ?? "none"}
          onChange={(textTransform) =>
            patch({
              textTransform:
                textTransform === "none" ? undefined : textTransform,
            })
          }
          options={[...TEXT_TRANSFORM_OPTIONS]}
        />
      </Row>
      <Row label="Link Color">
        <ColorInput
          value={typography.linkColor || "#111111"}
          onChange={(linkColor) => patch({ linkColor })}
        />
      </Row>
      <Row label="Icon Color">
        <ColorInput
          value={typography.iconColor || "#111111"}
          onChange={(iconColor) => patch({ iconColor })}
        />
      </Row>
    </>
  );
}

// ---------- Spacing ----------

function SidesEditor({
  sides,
  linked,
  onChange,
  onLinkedChange,
}: {
  sides: SpacingSides;
  linked: boolean;
  onChange: (sides: SpacingSides) => void;
  onLinkedChange: (linked: boolean) => void;
}) {
  function setSide(key: keyof SpacingSides, val: number | undefined) {
    if (linked) {
      onChange({ top: val, right: val, bottom: val, left: val });
    } else {
      onChange({ ...sides, [key]: val });
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[11px]">Linked sides</span>
        <Switch checked={linked} onCheckedChange={onLinkedChange} />
      </div>
      {linked ? (
        <NumberField
          value={sides.top}
          onChange={(v) => setSide("top", v)}
          suffix="px"
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <LabeledSideField
            label="Top"
            value={sides.top}
            onChange={(v) => setSide("top", v)}
          />
          <LabeledSideField
            label="Right"
            value={sides.right}
            onChange={(v) => setSide("right", v)}
          />
          <LabeledSideField
            label="Bottom"
            value={sides.bottom}
            onChange={(v) => setSide("bottom", v)}
          />
          <LabeledSideField
            label="Left"
            value={sides.left}
            onChange={(v) => setSide("left", v)}
          />
        </div>
      )}
    </div>
  );
}

function LabeledSideField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <NumberField value={value} onChange={onChange} suffix="px" />
    </div>
  );
}

function SpacingEditor({
  spacing,
  onChange,
}: {
  spacing: SpacingConfig;
  onChange: (s: SpacingConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs font-medium">
          Margin
        </Label>
        <SidesEditor
          sides={spacing.margin}
          linked={spacing.marginLinked}
          onChange={(margin) => onChange({ ...spacing, margin })}
          onLinkedChange={(marginLinked) =>
            onChange({ ...spacing, marginLinked })
          }
        />
      </div>
      <div className="space-y-1">
        <Label className="text-muted-foreground text-xs font-medium">
          Padding
        </Label>
        <SidesEditor
          sides={spacing.padding}
          linked={spacing.paddingLinked}
          onChange={(padding) => onChange({ ...spacing, padding })}
          onLinkedChange={(paddingLinked) =>
            onChange({ ...spacing, paddingLinked })
          }
        />
      </div>
    </div>
  );
}

// ---------- Border ----------

function BorderEditor({
  border,
  onChange,
}: {
  border: BorderConfig;
  onChange: (b: BorderConfig) => void;
}) {
  return (
    <div className="space-y-2">
      <Row label="Style">
        <SegmentedControl
          value={border.style}
          onChange={(style) => onChange({ ...border, style })}
          options={[...BORDER_STYLE_OPTIONS]}
        />
      </Row>
      {border.style !== "none" && (
        <>
          <Row label="Color">
            <ColorInput
              value={border.color || "#e5e5e5"}
              onChange={(color) => onChange({ ...border, color })}
            />
          </Row>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs font-medium">
              Width
            </Label>
            <SidesEditor
              sides={border.width}
              linked={border.widthLinked}
              onChange={(width) => onChange({ ...border, width })}
              onLinkedChange={(widthLinked) =>
                onChange({ ...border, widthLinked })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Radius ----------

function RadiusEditor({
  radius,
  onChange,
}: {
  radius: RadiusConfig;
  onChange: (r: RadiusConfig) => void;
}) {
  const c = radius.corners;
  function setCorner(
    key: keyof RadiusConfig["corners"],
    val: number | undefined
  ) {
    if (radius.linked) {
      onChange({
        ...radius,
        corners: {
          topLeft: val,
          topRight: val,
          bottomRight: val,
          bottomLeft: val,
        },
      });
    } else {
      onChange({ ...radius, corners: { ...c, [key]: val } });
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-xs font-medium">
          Radius
        </Label>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground text-[11px]">Linked</span>
          <Switch
            checked={radius.linked}
            onCheckedChange={(linked) =>
              onChange({ ...radius, linked: !!linked })
            }
          />
        </div>
      </div>
      {radius.linked ? (
        <NumberField
          value={c.topLeft}
          onChange={(v) => setCorner("topLeft", v)}
          suffix="px"
        />
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <LabeledSideField
            label="Top Left"
            value={c.topLeft}
            onChange={(v) => setCorner("topLeft", v)}
          />
          <LabeledSideField
            label="Top Right"
            value={c.topRight}
            onChange={(v) => setCorner("topRight", v)}
          />
          <LabeledSideField
            label="Bottom Right"
            value={c.bottomRight}
            onChange={(v) => setCorner("bottomRight", v)}
          />
          <LabeledSideField
            label="Bottom Left"
            value={c.bottomLeft}
            onChange={(v) => setCorner("bottomLeft", v)}
          />
        </div>
      )}
    </div>
  );
}

// ---------- Shadow ----------

function BoxShadowEditor({
  shadow,
  onChange,
}: {
  shadow: BoxShadowConfig;
  onChange: (s: BoxShadowConfig) => void;
}) {
  return (
    <div className="space-y-2">
      <Row label="Box Shadow">
        <Switch
          checked={shadow.enabled}
          onCheckedChange={(enabled) =>
            onChange({ ...shadow, enabled: !!enabled })
          }
        />
      </Row>
      {shadow.enabled && (
        <div className="grid grid-cols-2 gap-1.5">
          <LabeledSideField
            label="X"
            value={shadow.x}
            onChange={(v) => onChange({ ...shadow, x: v ?? 0 })}
          />
          <LabeledSideField
            label="Y"
            value={shadow.y}
            onChange={(v) => onChange({ ...shadow, y: v ?? 0 })}
          />
          <LabeledSideField
            label="Blur"
            value={shadow.blur}
            onChange={(v) => onChange({ ...shadow, blur: v ?? 0 })}
          />
          <LabeledSideField
            label="Spread"
            value={shadow.spread}
            onChange={(v) => onChange({ ...shadow, spread: v ?? 0 })}
          />
          <div className="col-span-2">
            <Row label="Color">
              <ColorInput
                value={shadow.color}
                onChange={(color) => onChange({ ...shadow, color })}
              />
            </Row>
          </div>
        </div>
      )}
    </div>
  );
}

function TextShadowEditor({
  shadow,
  onChange,
}: {
  shadow: TextShadowConfig;
  onChange: (s: TextShadowConfig) => void;
}) {
  return (
    <div className="space-y-2">
      <Row label="Text Shadow">
        <Switch
          checked={shadow.enabled}
          onCheckedChange={(enabled) =>
            onChange({ ...shadow, enabled: !!enabled })
          }
        />
      </Row>
      {shadow.enabled && (
        <div className="grid grid-cols-2 gap-1.5">
          <LabeledSideField
            label="X"
            value={shadow.x}
            onChange={(v) => onChange({ ...shadow, x: v ?? 0 })}
          />
          <LabeledSideField
            label="Y"
            value={shadow.y}
            onChange={(v) => onChange({ ...shadow, y: v ?? 0 })}
          />
          <LabeledSideField
            label="Blur"
            value={shadow.blur}
            onChange={(v) => onChange({ ...shadow, blur: v ?? 0 })}
          />
          <div>
            <Row label="Color">
              <ColorInput
                value={shadow.color}
                onChange={(color) => onChange({ ...shadow, color })}
              />
            </Row>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Responsive ----------

function ResponsiveEditor({
  responsive,
  onChange,
}: {
  responsive: ResponsiveConfig;
  onChange: (r: ResponsiveConfig) => void;
}) {
  return (
    <div className="space-y-3">
      <ResponsiveBreakpointEditor
        label="Tablet Overrides"
        override={responsive.tablet}
        onChange={(tablet) => onChange({ ...responsive, tablet })}
      />
      <ResponsiveBreakpointEditor
        label="Mobile Overrides"
        override={responsive.mobile}
        onChange={(mobile) => onChange({ ...responsive, mobile })}
      />
    </div>
  );
}

function ResponsiveBreakpointEditor({
  label,
  override,
  onChange,
}: {
  label: string;
  override: ResponsiveConfig["tablet"];
  onChange: (o: ResponsiveConfig["tablet"]) => void;
}) {
  const v = override ?? {};
  return (
    <div className="border-border space-y-1.5 rounded-md border p-2">
      <Label className="text-muted-foreground text-[11px] font-medium">
        {label}
      </Label>
      <Row label="Font Size">
        <NumberField
          value={v.typography?.fontSize}
          onChange={(fontSize) =>
            onChange({ ...v, typography: { ...v.typography, fontSize } })
          }
          suffix="px"
        />
      </Row>
      <Row label="Alignment">
        <SegmentedControl
          value={v.typography?.textAlign ?? ("" as PuckAlignment)}
          onChange={(textAlign) =>
            onChange({ ...v, typography: { ...v.typography, textAlign } })
          }
          options={TEXT_ALIGN_OPTIONS}
        />
      </Row>
      <Row label="Padding">
        <NumberField
          value={v.spacing?.padding?.top}
          onChange={(top) =>
            onChange({
              ...v,
              spacing: {
                ...v.spacing,
                padding: { top, right: top, bottom: top, left: top },
              },
            })
          }
          suffix="px"
        />
      </Row>
    </div>
  );
}

// ---------- Visibility ----------

function VisibilityEditor({
  visibility,
  onChange,
}: {
  visibility: DeviceVisibilityConfig;
  onChange: (v: DeviceVisibilityConfig) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Row label="Desktop">
        <Switch
          checked={visibility.desktop}
          onCheckedChange={(desktop) =>
            onChange({ ...visibility, desktop: !!desktop })
          }
        />
      </Row>
      <Row label="Tablet">
        <Switch
          checked={visibility.tablet}
          onCheckedChange={(tablet) =>
            onChange({ ...visibility, tablet: !!tablet })
          }
        />
      </Row>
      <Row label="Mobile">
        <Switch
          checked={visibility.mobile}
          onCheckedChange={(mobile) =>
            onChange({ ...visibility, mobile: !!mobile })
          }
        />
      </Row>
      <p className={cn("text-muted-foreground text-[11px]")}>
        Hidden on a device only affects that device&apos;s rendered page — the
        element stays in Layers and stays editable here regardless of which
        device is currently hidden.
      </p>
    </div>
  );
}
