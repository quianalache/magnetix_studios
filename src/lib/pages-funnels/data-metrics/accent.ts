/**
 * Accent colours for Data & Metrics blocks, chosen from named choices (never
 * a free hex), mapped to Magnetix palette tokens that are defined on :root,
 * so they resolve on published pages as well as in the builder.
 */
export type MetricAccent = "default" | "plum" | "violet" | "pink" | "aqua" | "gold" | "green";

export const METRIC_ACCENT_OPTIONS: { label: string; value: MetricAccent }[] = [
  { label: "Page text color", value: "default" },
  { label: "Plum", value: "plum" },
  { label: "Violet", value: "violet" },
  { label: "Pink", value: "pink" },
  { label: "Aqua", value: "aqua" },
  { label: "Gold", value: "gold" },
  { label: "Green", value: "green" },
];

const ACCENT_VAR: Record<Exclude<MetricAccent, "default">, string> = {
  plum: "var(--color-plum-900)",
  violet: "var(--color-violet-ds-600)",
  pink: "var(--color-pink-ds-600)",
  aqua: "var(--color-aqua-600)",
  gold: "var(--color-gold-600)",
  green: "var(--ds-chart-6)",
};

/** Hex of each named accent (the token values) — for showing an older block's current color in the sidebar. */
export const ACCENT_HEX: Record<Exclude<MetricAccent, "default">, string> = {
  plum: "#3D1652",
  violet: "#6D28D9",
  pink: "#C42A7B",
  aqua: "#0B8A96",
  gold: "#B7791F",
  green: "#16A34A",
};

/** The colour for an accent; "default" follows the surrounding text colour. */
export function accentColor(accent: unknown): string {
  return typeof accent === "string" && accent in ACCENT_VAR
    ? ACCENT_VAR[accent as keyof typeof ACCENT_VAR]
    : "currentColor";
}

/** A soft track/background derived from the accent. */
export function accentTrack(accent: unknown): string {
  return `color-mix(in srgb, ${accentColor(accent)} 14%, transparent)`;
}
