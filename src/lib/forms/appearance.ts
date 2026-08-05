import type { CSSProperties } from "react";
import {
  defaultFormAppearance,
  FONT_FAMILY_STACKS,
  normalizeFontSizePx,
  type FormAppearance,
  type FormSettings,
} from "@/types/forms";

/**
 * Resolve the appearance for a public form render. URL search params take
 * precedence (so an embed snippet can override per-deployment), then the
 * form's saved settings, then the hard-coded defaults.
 *
 * Recognised params:
 *   ?theme=light|dark
 *   ?accent=%237c3aed         (hex, # may be omitted; URL-encoded)
 *   ?embed=1                  (forces hideChrome on, transparent body)
 *   ?chrome=0                 (alias for embed=1's chrome behaviour)
 */
export function resolveAppearance(
  searchParams: Record<string, string | string[] | undefined>,
  settings: FormSettings | undefined,
): FormAppearance & { embed: boolean } {
  const fromSettings = settings?.appearance ?? defaultFormAppearance();

  const themeParam = pickString(searchParams.theme);
  const accentParam = pickString(searchParams.accent);
  const embedParam = pickString(searchParams.embed);
  const chromeParam = pickString(searchParams.chrome);
  const titleParam = pickString(searchParams.title);

  const embed = embedParam === "1" || chromeParam === "0";

  return {
    theme:
      themeParam === "dark"
        ? "dark"
        : themeParam === "light"
          ? "light"
          : fromSettings.theme,
    accent: normaliseHex(accentParam) ?? fromSettings.accent,
    backgroundColor: fromSettings.backgroundColor ?? null,
    fontSize: normalizeFontSizePx(fromSettings.fontSize),
    cornerRadius: fromSettings.cornerRadius ?? 10,
    buttonStyle: fromSettings.buttonStyle ?? "fill",
    fontFamily: fromSettings.fontFamily ?? "system",
    borderColor: fromSettings.borderColor ?? null,
    fieldSpacing: fromSettings.fieldSpacing ?? "comfortable",
    hideChrome: embed || fromSettings.hideChrome,
    hideTitle:
      titleParam === "0" ? true : titleParam === "1" ? false : fromSettings.hideTitle,
    // Saved-settings only — see the FormAppearance.customCss doc comment
    // for why this deliberately has no URL-param override.
    customCss: fromSettings.customCss ?? "",
    embed,
  };
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

/** Accept "7c3aed", "#7c3aed", "%237c3aed". Returns null on bad input. */
function normaliseHex(input: string | undefined): string | null {
  if (!input) return null;
  const hex = input.replace(/^#/, "").trim();
  if (!/^[0-9a-f]{6}$/i.test(hex) && !/^[0-9a-f]{3}$/i.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

/**
 * Build the inline-style overrides for the wrapper div. Sets the shadcn
 * CSS variables (`--card`, `--background`, etc.) so descendants pick up
 * the chosen theme regardless of next-themes setting `.dark` on `<html>`.
 *
 * --primary is overridden with the accent so `bg-primary` on the submit
 * button picks up the user's colour.
 *
 * `backgroundColor` overrides `--card` + `--background` together (the form
 * renders as one flat card, no separate page-behind-the-card surface, so
 * both tokens should read the same custom colour) — deliberately separate
 * from `accent`/primary, matching GHL's own docs: primary only drives
 * interactive states, background is its own control. Text colour is NOT
 * auto-adjusted for contrast against a custom background — it stays
 * whatever the light/dark theme's fixed foreground is, same scoped-override
 * approach `borderColor` already uses (only touches border/input, not
 * text). A poorly chosen combo (e.g. a near-black custom background on the
 * light theme, whose text is also dark) can end up low-contrast; adding an
 * independent text-colour control is the natural next step if that comes
 * up, not part of this fix.
 *
 * `fontSize` sets the actual CSS font-size on this wrapper (not a custom
 * property) — every text element inside that doesn't set its own size
 * inherits it directly; the handful that do (title, labels, inputs) use
 * `em`-relative Tailwind classes instead of fixed `rem` ones specifically
 * so they scale off this instead of the page root.
 *
 * `--radius` is the one base token the whole app derives every `rounded-*`
 * size from (`--radius-lg: var(--radius)`, `--radius-2xl: var(--radius) *
 * 1.8`, etc. — see globals.css) — overriding it here rescales the form
 * card, inputs, and buttons together from one slider, no per-component
 * changes needed. `--font-sans` replaces the app's own font for
 * everything inside the wrapper; "system" resolves to the same stack the
 * embed iframe already forced before this shipped.
 */
export function appearanceStyle(a: FormAppearance): CSSProperties {
  const fontSize = `${normalizeFontSizePx(a.fontSize)}px`;
  const radius = `${a.cornerRadius ?? 10}px`;
  const fontFamily = FONT_FAMILY_STACKS[a.fontFamily ?? "system"];
  const borderOverride = a.borderColor
    ? { "--border": a.borderColor, "--input": a.borderColor }
    : {};
  const backgroundOverride = a.backgroundColor
    ? { "--card": a.backgroundColor, "--background": a.backgroundColor }
    : {};
  if (a.theme === "dark") {
    return {
      fontSize,
      "--radius": radius,
      "--font-sans": fontFamily,
      "--background": "oklch(0.145 0 0)",
      "--foreground": "oklch(0.985 0 0)",
      "--card": "oklch(0.205 0 0)",
      "--card-foreground": "oklch(0.985 0 0)",
      "--muted": "oklch(0.269 0 0)",
      "--muted-foreground": "oklch(0.708 0 0)",
      "--border": "oklch(1 0 0 / 10%)",
      "--input": "oklch(1 0 0 / 15%)",
      "--ring": a.accent,
      "--primary": a.accent,
      "--primary-foreground": "oklch(0.985 0 0)",
      ...borderOverride,
      ...backgroundOverride,
    } as unknown as CSSProperties;
  }
  return {
    fontSize,
    "--radius": radius,
    "--font-sans": fontFamily,
    "--background": "oklch(1 0 0)",
    "--foreground": "oklch(0.145 0 0)",
    "--card": "oklch(1 0 0)",
    "--card-foreground": "oklch(0.145 0 0)",
    "--muted": "oklch(0.97 0 0)",
    "--muted-foreground": "oklch(0.556 0 0)",
    "--border": "oklch(0.922 0 0)",
    "--input": "oklch(0.922 0 0)",
    "--ring": a.accent,
    "--primary": a.accent,
    "--primary-foreground": "oklch(0.985 0 0)",
    ...borderOverride,
    ...backgroundOverride,
  } as unknown as CSSProperties;
}
