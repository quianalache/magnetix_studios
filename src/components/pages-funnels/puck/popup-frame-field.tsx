"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  POPUP_BORDER_PRESETS,
  POPUP_SHADOW_PRESETS,
  presetFor,
  withPanelMaxWidth,
  type FramePreset,
  type PopupFrameValue,
} from "@/lib/pages-funnels/popup-editor";
import type { PopupStyle } from "@/types/pages-funnels-popup";
import { ColorPickRow, useBrandColors } from "./color-controls";

/**
 * Popup Frame settings (Slice 4.5, approved mockup panel C) — the editor for
 * the Popup root's `frame` field, shown when the frame (not a content block)
 * is selected. Only settings the public Popup runtime actually draws are
 * offered: overlay color/opacity/blur, panel width + placement, panel
 * background/padding/border/radius/shadow, and close-on-overlay-click.
 * Trigger settings are deliberately absent until their runtime ships.
 */

/** Which groups are open — module scope so a Puck-driven remount of the fields panel keeps them. */
const openGroups: Record<string, boolean> = { general: true };

export function PopupFrameFieldEditor({ value, onChange }: { value: PopupFrameValue | undefined; onChange: (next: PopupFrameValue) => void }) {
  const brand = useBrandColors();
  // Puck renders the settings twice (sidebar + phone Fields tab): ids must be unique per copy.
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  if (!value) return null;
  const style = value.style;
  const set = <K extends keyof PopupStyle>(key: K, v: PopupStyle[K]) => onChange({ ...value, style: { ...style, [key]: v } });

  return (
    <div className="-mx-1 flex flex-col" data-popup-frame-settings="">
      <Group id="general" title="General">
        <Field label="Popup name" htmlFor={id("name")}>
          <DraftText id={id("name")} value={value.name} onCommit={(name) => onChange({ ...value, name })} />
        </Field>
      </Group>
      <Group id="overlay" title="Overlay">
        <ColorPickRow label="Overlay color" hex={style.overlayColor} onCommit={(hex) => set("overlayColor", hex)} brand={brand} testId="popup-overlay" />
        <Field label="Opacity" htmlFor={id("opacity")} suffix="%">
          <DraftNumber id={id("opacity")} value={Math.round(style.overlayOpacity * 100)} min={0} max={100} onCommit={(n) => set("overlayOpacity", n / 100)} />
        </Field>
        <Field label="Background blur" htmlFor={id("blur")} suffix="px">
          <DraftNumber id={id("blur")} value={style.blurPx} min={0} max={24} onCommit={(n) => set("blurPx", n)} />
        </Field>
      </Group>
      <Group id="panel" title="Size & placement">
        <Field label="Width" htmlFor={id("width")} suffix="px" hint="Narrower screens get the full width minus a small margin.">
          <DraftNumber id={id("width")} value={style.panelMaxWidth} min={280} max={1200} onCommit={(n) => onChange({ ...value, style: withPanelMaxWidth(style, n) })} />
        </Field>
        <Field label="Horizontal position">
          <ChoiceSelect
            label="Horizontal position"
            value={style.panelAlignment}
            options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
            onChange={(v) => set("panelAlignment", v as PopupStyle["panelAlignment"])}
          />
        </Field>
        <Field label="Vertical position">
          <ChoiceSelect
            label="Vertical position"
            value={style.panelPlacement}
            options={[{ value: "top", label: "Top" }, { value: "center", label: "Middle" }, { value: "bottom", label: "Bottom" }]}
            onChange={(v) => set("panelPlacement", v as PopupStyle["panelPlacement"])}
          />
        </Field>
      </Group>
      <Group id="appearance" title="Appearance">
        <ColorPickRow label="Background" hex={style.panelBackground} onCommit={(hex) => set("panelBackground", hex)} brand={brand} testId="popup-background" />
        <Field label="Padding" htmlFor={id("padding")} suffix="px">
          <DraftNumber id={id("padding")} value={style.panelPadding} min={0} max={96} onCommit={(n) => set("panelPadding", n)} />
        </Field>
        <Field label="Corner radius" htmlFor={id("radius")} suffix="px">
          <DraftNumber id={id("radius")} value={style.panelBorderRadius} min={0} max={64} onCommit={(n) => set("panelBorderRadius", n)} />
        </Field>
        <Field label="Border">
          <PresetSelect label="Border" presets={POPUP_BORDER_PRESETS} css={style.panelBorder} onChange={(css) => set("panelBorder", css)} />
        </Field>
        <Field label="Shadow">
          <PresetSelect label="Shadow" presets={POPUP_SHADOW_PRESETS} css={style.panelShadow} onChange={(css) => set("panelShadow", css)} />
        </Field>
      </Group>
      <Group id="close" title="Close">
        <div className="flex items-center justify-between gap-3">
          <Label id={id("overlay-close-label")} htmlFor={id("overlay-close")} className="text-body-sm font-normal">Close when the overlay is clicked</Label>
          {/* aria-labelledby names the switch button itself (base-ui puts `id` on its hidden input). */}
          <Switch
            id={id("overlay-close")}
            aria-labelledby={id("overlay-close-label")}
            checked={style.closeOnOverlayClick}
            onCheckedChange={(checked) => set("closeOnOverlayClick", checked)}
          />
        </div>
        <p className="text-caption text-muted-foreground mt-1.5">Visitors can always close the popup with its × button or the Esc key.</p>
      </Group>
    </div>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(openGroups[id] ?? false);
  const bodyId = useId();
  return (
    <section className="border-border border-b last:border-b-0" data-popup-frame-group={id}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            openGroups[id] = !open;
            setOpen(!open);
          }}
          className="text-foreground hover:bg-muted/50 flex w-full items-center justify-between rounded-md px-1 py-2.5 text-left text-sm font-semibold"
        >
          {title}
          <ChevronDown className={cn("text-muted-foreground size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </h3>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-3 px-1 pb-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, htmlFor, suffix, hint, children }: { label: string; htmlFor?: string; suffix?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="text-caption text-muted-foreground mb-1 block font-medium">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {suffix ? <span className="text-caption text-muted-foreground">{suffix}</span> : null}
      </div>
      {hint ? <p className="text-caption text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}

/** Text input that commits on every keystroke but keeps its own draft (no cursor jumps). */
function DraftText({ id, value, onCommit }: { id: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Input
      id={id}
      value={draft}
      maxLength={80}
      onChange={(e) => {
        setDraft(e.target.value);
        if (e.target.value.trim()) onCommit(e.target.value);
      }}
      onBlur={() => {
        if (!draft.trim()) setDraft(value);
      }}
    />
  );
}

/** Number input: typing is free, only a valid number inside [min, max] is saved. */
function DraftNumber({ id, value, min, max, onCommit }: { id: string; value: number; min: number; max: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n) && n >= min && n <= max && n !== value) onCommit(n);
  };
  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        commit(e.target.value);
      }}
      onBlur={() => {
        const n = Number(draft);
        const clamped = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : value;
        if (clamped !== value) onCommit(clamped);
        setDraft(String(clamped));
      }}
    />
  );
}

function ChoiceSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(String(v))} items={Object.fromEntries(options.map((o) => [o.value, o.label]))}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Border / shadow: named presets; an older custom value is kept and shown as "Custom" until changed. */
function PresetSelect({ label, presets, css, onChange }: { label: string; presets: FramePreset[]; css: string; onChange: (css: string) => void }) {
  const current = presetFor(presets, css);
  const options = [...presets.map((p) => ({ value: p.value, label: p.label })), ...(current === "custom" ? [{ value: "custom", label: "Custom" }] : [])];
  return (
    <ChoiceSelect
      label={label}
      value={current}
      options={options}
      onChange={(v) => {
        const preset = presets.find((p) => p.value === v);
        if (preset) onChange(preset.css);
      }}
    />
  );
}
