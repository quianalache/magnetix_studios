import type { CSSProperties } from "react";
import {
  defaultFormAppearance,
  FONT_FAMILY_STACKS,
  normalizeFontSizePx,
  normalizeShadow,
  SHADOW_CSS,
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
    backgroundImage: fromSettings.backgroundImage ?? null,
    headerImage: fromSettings.headerImage ?? null,
    textColor: fromSettings.textColor ?? null,
    shadow: normalizeShadow(fromSettings.shadow),
    fontSize: normalizeFontSizePx(fromSettings.fontSize),
    cornerRadius: fromSettings.cornerRadius ?? 10,
    buttonStyle: fromSettings.buttonStyle ?? "fill",
    fontFamily: fromSettings.fontFamily ?? "system",
    borderColor: fromSettings.borderColor ?? null,
    input: fromSettings.input ?? {},
    label: fromSettings.label ?? {},
    placeholder: fromSettings.placeholder ?? {},
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
 * interactive states, background is its own control. `textColor` is the
 * companion override for `--foreground`/`--card-foreground` (title +
 * labels) — kept as a genuinely separate field from `backgroundColor`
 * rather than auto-contrasted, so the operator has to deliberately pick a
 * combo that works, same as GHL leaves it to the operator.
 *
 * `backgroundImage` sets a literal CSS `background-image` (cover/center)
 * on top of whatever `backgroundColor`/theme default is set — the color
 * shows through as a fallback while the image loads or if it fails.
 *
 * `shadow` maps to a real `box-shadow` value (see `SHADOW_CSS`) instead of
 * a Tailwind `shadow-*` class, since it needs to be swappable per form
 * instead of hardcoded on the card's className.
 *
 * Per-input/-label/-placeholder overrides (focus colour, input padding,
 * label weight, etc.) are NOT computed here — most apply as direct
 * `style` props on the individual `<Input>`/`<Label>` elements in
 * `public-form.tsx`, colocated with where those elements actually
 * render. Focus colour is the one exception forced back into this
 * wrapper-level CSS-variable approach: `:focus-visible` is a pseudo-class
 * React's inline `style` prop can't target at all, so overriding `--ring`
 * here (already what `accent` drives) is the only way to make it
 * independently swappable.
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
  const textOverride = a.textColor
    ? { "--foreground": a.textColor, "--card-foreground": a.textColor }
    : {};
  const focusOverride = a.input?.focusColor ? { "--ring": a.input.focusColor } : {};
  const placeholderOverride = a.placeholder?.color
    ? { "--ls-placeholder-color": a.placeholder.color }
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
      ...textOverride,
      ...focusOverride,
      ...placeholderOverride,
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
    ...textOverride,
    ...focusOverride,
    ...placeholderOverride,
  } as unknown as CSSProperties;
}

/**
 * Direct `style` for the form CARD element specifically (the `rounded-2xl
 * border bg-card ...` div, not the page-level wrapper `appearanceStyle`
 * targets) — shadow and background image both need to render on the card
 * itself, not the surrounding page, and neither has an existing
 * CSS-variable indirection to piggyback on the way `bg-card`/`rounded-2xl`
 * do off `--card`/`--radius`.
 */
export function cardStyle(a: FormAppearance): CSSProperties {
  return {
    boxShadow: SHADOW_CSS[normalizeShadow(a.shadow)],
    ...(a.backgroundImage
      ? {
          backgroundImage: `url(${JSON.stringify(a.backgroundImage)})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {}),
  };
}

/** Font-weight CSS values for `label.fontWeight` — matches Tailwind's own font-{weight} scale. */
export const LABEL_FONT_WEIGHT_CSS: Record<
  NonNullable<NonNullable<FormAppearance["label"]>["fontWeight"]>,
  number
> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

/**
 * Direct `style` overrides for one `<Input>`/`<Textarea>` element — text
 * colour, padding, corner radius, border colour, shadow. Everything here
 * is a plain CSS property (not a custom-property cascade) since it needs
 * to win over the shadcn component's own hardcoded Tailwind classes
 * regardless of class order, and none of it needs pseudo-class support
 * (unlike focus colour, which `appearanceStyle`'s `--ring` override
 * handles instead — see that function's doc comment).
 */
export function inputElementStyle(a: FormAppearance): CSSProperties {
  const input = a.input ?? {};
  return {
    color: input.textColor ?? undefined,
    padding: input.padding != null ? `${input.padding}px` : undefined,
    borderRadius: input.cornerRadius != null ? `${input.cornerRadius}px` : undefined,
    borderColor: input.borderColor ?? undefined,
    boxShadow: input.shadow ? SHADOW_CSS[input.shadow] : undefined,
  };
}

/** Direct `style` overrides for one `<Label>` element — colour + weight. */
export function labelElementStyle(a: FormAppearance): CSSProperties {
  const label = a.label ?? {};
  return {
    color: label.color ?? undefined,
    fontWeight: label.fontWeight ? LABEL_FONT_WEIGHT_CSS[label.fontWeight] : undefined,
  };
}
