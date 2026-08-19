import type {
  CommunityTheme,
  CommunityThemeColors,
  CommunityThemePresetKey,
} from "@/types/community";

/**
 * Client-safe Branding preset table — the 8 named presets from the approved
 * mock-up plus "Custom". Each preset defines BOTH a light and a dark color
 * set (Part 7): hand-tuned so each mode has real contrast (dark isn't just
 * light with the background flipped), while keeping the same brand hue
 * recognizable across both.
 */
export const COMMUNITY_THEME_PRESETS: {
  key: Exclude<CommunityThemePresetKey, "custom">;
  label: string;
  light: CommunityThemeColors;
  dark: CommunityThemeColors;
}[] = [
  {
    key: "magnetix-purple",
    label: "Magnetix Purple",
    light: {
      primary: "#7C3AED",
      primaryAction: "#6D28D9",
      accent: "#A78BFA",
      background: "#FAFAFA",
      surface: "#FFFFFF",
      text: "#202124",
    },
    dark: {
      primary: "#8B5CF6",
      primaryAction: "#7C3AED",
      accent: "#C4B5FD",
      background: "#18181B",
      surface: "#27272A",
      text: "#F4F4F5",
    },
  },
  {
    key: "ocean-blue",
    label: "Ocean Blue",
    light: {
      primary: "#2563EB",
      primaryAction: "#1D4ED8",
      accent: "#60A5FA",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      text: "#1E293B",
    },
    dark: {
      primary: "#3B82F6",
      primaryAction: "#2563EB",
      accent: "#93C5FD",
      background: "#0F172A",
      surface: "#1E293B",
      text: "#F1F5F9",
    },
  },
  {
    key: "forest-green",
    label: "Forest Green",
    light: {
      primary: "#16A34A",
      primaryAction: "#15803D",
      accent: "#4ADE80",
      background: "#F7FAF8",
      surface: "#FFFFFF",
      text: "#1E2A22",
    },
    dark: {
      primary: "#22C55E",
      primaryAction: "#16A34A",
      accent: "#86EFAC",
      background: "#14231A",
      surface: "#1E3226",
      text: "#ECFDF3",
    },
  },
  {
    key: "sunset-orange",
    label: "Sunset Orange",
    light: {
      primary: "#EA580C",
      primaryAction: "#C2410C",
      accent: "#FB923C",
      background: "#FFFAF7",
      surface: "#FFFFFF",
      text: "#2A1D14",
    },
    dark: {
      primary: "#F97316",
      primaryAction: "#EA580C",
      accent: "#FDBA74",
      background: "#271A10",
      surface: "#3A2618",
      text: "#FFF1E6",
    },
  },
  {
    key: "rose-pink",
    label: "Rose Pink",
    light: {
      primary: "#E11D48",
      primaryAction: "#BE123C",
      accent: "#FB7185",
      background: "#FFF7F8",
      surface: "#FFFFFF",
      text: "#2A151A",
    },
    dark: {
      primary: "#F43F5E",
      primaryAction: "#E11D48",
      accent: "#FDA4AF",
      background: "#260F16",
      surface: "#391722",
      text: "#FFE4EA",
    },
  },
  {
    key: "royal-blue",
    label: "Royal Blue",
    light: {
      primary: "#4338CA",
      primaryAction: "#3730A3",
      accent: "#818CF8",
      background: "#F8F8FF",
      surface: "#FFFFFF",
      text: "#1E1B3A",
    },
    dark: {
      primary: "#6366F1",
      primaryAction: "#4F46E5",
      accent: "#A5B4FC",
      background: "#17152B",
      surface: "#211E3F",
      text: "#EEF0FF",
    },
  },
  {
    key: "slate-gray",
    label: "Slate Gray",
    light: {
      primary: "#475569",
      primaryAction: "#334155",
      accent: "#94A3B8",
      background: "#F8FAFC",
      surface: "#FFFFFF",
      text: "#1E293B",
    },
    dark: {
      primary: "#64748B",
      primaryAction: "#475569",
      accent: "#CBD5E1",
      background: "#0F172A",
      surface: "#1E293B",
      text: "#F1F5F9",
    },
  },
  {
    key: "deep-teal",
    label: "Deep Teal",
    light: {
      primary: "#0D9488",
      primaryAction: "#0F766E",
      accent: "#2DD4BF",
      background: "#F6FBFA",
      surface: "#FFFFFF",
      text: "#16302D",
    },
    dark: {
      primary: "#14B8A6",
      primaryAction: "#0D9488",
      accent: "#5EEAD4",
      background: "#0F2523",
      surface: "#16342F",
      text: "#E7FBF7",
    },
  },
];

export function findThemePreset(key: CommunityThemePresetKey) {
  return COMMUNITY_THEME_PRESETS.find((p) => p.key === key) ?? null;
}

/** The community-wide default when nothing has been configured yet — same
 *  values a brand-new community effectively already renders with today
 *  (existing neutral community styling), used both as the Branding UI's
 *  starting point and as "Reset to Default". */
export function defaultCommunityTheme(): CommunityTheme {
  const preset = COMMUNITY_THEME_PRESETS[0];
  return { preset: preset.key, light: { ...preset.light }, dark: { ...preset.dark } };
}

/** Normalizes a possibly-absent/partial theme (older community, or a
 *  malformed save) into a complete, safe-to-render `CommunityTheme` —
 *  the ONE place that decides what "not configured yet" falls back to. */
export function normalizeCommunityTheme(theme: CommunityTheme | undefined | null): CommunityTheme {
  if (!theme || !theme.light || !theme.dark) return defaultCommunityTheme();
  return theme;
}
