"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { ColorInput } from "@/components/ui/color-input";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { BRAND_COLOR_ROLE_LABEL, getTenantBrandColors, normalizeHex, type ResolvedBrandColor } from "@/lib/brand/brand-colors";
import { cn } from "@/lib/utils";

/**
 * Shared color controls for Data & Metrics blocks (Chart, Progress Bar,
 * Progress Ring — owner color UX correction 2026-11-01). One visual
 * language everywhere: a swatch, a human name when there is one, the hex,
 * and the shared ColorInput with the workspace's Brand colors as quick picks.
 * No system palette is presented as a customer choice.
 */

/** The open workspace's saved Brand colors (live; this sub-account only). */
export function useBrandColors(): ResolvedBrandColor[] {
  const sub = useOptionalSubAccount();
  return useMemo(() => getTenantBrandColors(sub?.subAccount), [sub?.subAccount]);
}

/** ColorInput quick picks: the workspace's Brand colors, by name. Nothing else. */
export function brandQuickPicks(brand: readonly ResolvedBrandColor[]) {
  return brand.map((c) => ({ label: c.name || `${BRAND_COLOR_ROLE_LABEL[c.role]} brand color`, value: c.hex }));
}

export function Hint({ tone = "muted", children }: { tone?: "muted" | "warning"; children: React.ReactNode }) {
  return (
    <p className={`text-caption mt-1.5 ${tone === "warning" ? "text-status-warning-fg" : "text-muted-foreground"}`}>
      {children}
    </p>
  );
}

/**
 * ColorInput with a local draft: the hex box can be typed into one character
 * at a time, and only a complete 6-digit color is saved.
 */
export function ChartColorPicker({ value, onCommit, presets }: { value: string; onCommit: (hex: string) => void; presets: { label: string; value: string }[] }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <ColorInput
      value={draft}
      onChange={(v) => {
        setDraft(v);
        const hex = /^#?[0-9a-f]{6}$/i.test(v.trim()) ? normalizeHex(v) : null;
        if (hex && hex !== value) onCommit(hex);
      }}
      presets={presets}
    />
  );
}

/** One editable color: [swatch → ColorInput] Label   #HEX. Used for One color, Shades base, Line color, Custom, Progress. */
export function ColorPickRow({
  label,
  hex,
  onCommit,
  brand,
  testId,
  hexText,
}: {
  label: string;
  hex: string;
  /** Shown instead of the hex when the color isn't a single hex (e.g. "Text color"). */
  hexText?: string;
  onCommit: (hex: string) => void;
  brand: readonly ResolvedBrandColor[];
  testId?: string;
}) {
  const named = brand.find((c) => c.hex === hex)?.name;
  return (
    <div className="flex items-center gap-2.5" data-color-row={testId ?? ""}>
      <ChartColorPicker value={hex} onCommit={onCommit} presets={brandQuickPicks(brand)} />
      <span className="text-body-sm min-w-0 flex-1 truncate">
        {label}
        {named ? <span className="text-muted-foreground"> · {named}</span> : null}
      </span>
      <span className={cn("text-caption text-muted-foreground", !hexText && "font-mono")}>{hexText ?? hex}</span>
    </div>
  );
}

/** A Brand color shown by name: [swatch] Forest / Primary · #2F5D50. */
function BrandColorLabel({ color }: { color: ResolvedBrandColor }) {
  return (
    <>
      <span className="border-border size-5 shrink-0 rounded-full border" style={{ background: color.hex }} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="text-body-sm block truncate font-medium">{color.name || color.hex}</span>
        <span className="text-caption text-muted-foreground block">
          {BRAND_COLOR_ROLE_LABEL[color.role]}
          {color.name ? ` · ${color.hex}` : ""}
        </span>
      </span>
    </>
  );
}

/** Read-only list of the saved Brand colors (Chart "Brand colors"). */
export function BrandColorList({ brand }: { brand: readonly ResolvedBrandColor[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5" aria-label="Brand colors" data-brand-color-list="">
      {brand.map((c) => (
        <li key={c.id} className="flex items-center gap-2.5" data-brand-color-id={c.id}>
          <BrandColorLabel color={c} />
        </li>
      ))}
    </ul>
  );
}

/** Pick ONE saved Brand color (Progress Bar / Ring). */
export function BrandColorPicker({
  brand,
  selectedId,
  onSelect,
}: {
  brand: readonly ResolvedBrandColor[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Brand color" className="mt-2 flex flex-col gap-1" data-progress-brand-picker="">
      {brand.map((c) => {
        const on = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left",
              on ? "border-primary bg-muted/50" : "border-border hover:bg-muted/40",
            )}
            data-brand-color-id={c.id}
          >
            <BrandColorLabel color={c} />
            {on ? <Check size={16} className="text-primary shrink-0" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** "No brand colors saved yet" + a link to Settings → Branding (new tab), optionally "or choose Custom". */
export function NoBrandColorsNotice({ shownInstead, onUseCustom }: { shownInstead?: string; onUseCustom?: () => void }) {
  const sub = useOptionalSubAccount();
  const brandingHref = sub ? sub.saPath("/dashboard/settings?section=branding") : null;
  return (
    <div className="border-border bg-muted/40 text-caption mt-2 rounded-lg border px-3 py-2" data-no-brand-colors="">
      <p className="font-medium">No brand colors saved yet.</p>
      <p className="text-muted-foreground">
        {shownInstead ? `${shownInstead} ` : null}
        {brandingHref ? (
          <a href={brandingHref} target="_blank" rel="noreferrer" className="text-link font-medium underline-offset-2 hover:underline">
            Add brand colors in Settings → Branding
          </a>
        ) : (
          "Add brand colors in Settings → Branding"
        )}
        {onUseCustom ? (
          <>
            {" or "}
            <button type="button" onClick={onUseCustom} className="text-link font-medium underline-offset-2 hover:underline">
              choose Custom
            </button>
            .
          </>
        ) : (
          "."
        )}
      </p>
    </div>
  );
}

/** Small "Add brand colors" prompt for when Custom is the only choice. */
export function AddBrandColorsLink() {
  const sub = useOptionalSubAccount();
  if (!sub) return null;
  return (
    <Hint>
      <a
        href={sub.saPath("/dashboard/settings?section=branding")}
        target="_blank"
        rel="noreferrer"
        className="text-link font-medium underline-offset-2 hover:underline"
      >
        Add brand colors in Settings → Branding
      </a>{" "}
      to reuse them here.
    </Hint>
  );
}
