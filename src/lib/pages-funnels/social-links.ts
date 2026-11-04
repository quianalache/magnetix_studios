import type { NavColorSetting } from "@/lib/pages-funnels/navigation";

/**
 * Social Links block (Wave 3) — creator profile links (Instagram, YouTube…).
 * Not share buttons (out of scope). Pure + client-safe; icons are mapped
 * centrally in `components/pages-funnels/puck/social-icons.tsx`.
 */

export const SOCIAL_NETWORKS = [
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "linkedin",
  "x",
  "pinterest",
  "threads",
  "website",
  "email",
] as const;
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const SOCIAL_NETWORK_LABEL: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  pinterest: "Pinterest",
  threads: "Threads",
  website: "Website",
  email: "Email",
};

export interface SocialLinkItem {
  id: string;
  network: SocialNetwork;
  /** https URL, or an email address for `email`. */
  url: string;
  /** Accessible name; blank = "{Network}". */
  label: string;
}

export interface SocialLinksStyle {
  size: number;
  gap: number;
  alignment: "left" | "center" | "right";
  shape: "plain" | "circle" | "rounded";
  color: NavColorSetting;
  hoverColor: NavColorSetting;
}

export const SOCIAL_LIMITS = { items: 12, url: 2048, label: 80, sizeMin: 16, sizeMax: 64, gapMax: 48 } as const;

export const DEFAULT_SOCIAL_STYLE: SocialLinksStyle = {
  size: 24,
  gap: 12,
  alignment: "center",
  shape: "plain",
  color: { source: "default" },
  hoverColor: { source: "default" },
};

export const DEFAULT_SOCIAL_ITEMS: SocialLinkItem[] = [
  { id: "social-instagram", network: "instagram", url: "", label: "" },
  { id: "social-youtube", network: "youtube", url: "", label: "" },
  { id: "social-tiktok", network: "tiktok", url: "", label: "" },
];

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

/**
 * The href for one link, or null when it can't be linked safely (empty,
 * not https, not an email for `email`). Safe render: a bad link is simply
 * not shown on the live page.
 */
export function socialHref(item: Pick<SocialLinkItem, "network" | "url">): string | null {
  const raw = (item.url ?? "").trim();
  if (!raw) return null;
  if (item.network === "email") {
    const address = raw.replace(/^mailto:/i, "");
    return EMAIL.test(address) ? `mailto:${address}` : null;
  }
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Accessible name for one link — never icon-only. */
export function socialAccessibleName(item: Pick<SocialLinkItem, "network" | "label">): string {
  return item.label.trim() || SOCIAL_NETWORK_LABEL[item.network] || "Social link";
}

/** Lenient read of stored items (render path). */
export function normalizeSocialItems(raw: unknown): SocialLinkItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, SOCIAL_LIMITS.items).flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const v = value as Record<string, unknown>;
    const network = SOCIAL_NETWORKS.includes(v.network as SocialNetwork) ? (v.network as SocialNetwork) : "website";
    return [{
      id: typeof v.id === "string" && v.id ? v.id : `social-${index}`,
      network,
      url: typeof v.url === "string" ? v.url : "",
      label: typeof v.label === "string" ? v.label : "",
    }];
  });
}

export function normalizeSocialStyle(raw: unknown): SocialLinksStyle {
  const v = raw && typeof raw === "object" ? (raw as Partial<SocialLinksStyle>) : {};
  const num = (n: unknown, d: number, min: number, max: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d);
  return {
    size: num(v.size, DEFAULT_SOCIAL_STYLE.size, SOCIAL_LIMITS.sizeMin, SOCIAL_LIMITS.sizeMax),
    gap: num(v.gap, DEFAULT_SOCIAL_STYLE.gap, 0, SOCIAL_LIMITS.gapMax),
    alignment: v.alignment === "left" || v.alignment === "right" ? v.alignment : "center",
    shape: v.shape === "circle" || v.shape === "rounded" ? v.shape : "plain",
    color: v.color && typeof v.color === "object" ? v.color : DEFAULT_SOCIAL_STYLE.color,
    hoverColor: v.hoverColor && typeof v.hoverColor === "object" ? v.hoverColor : DEFAULT_SOCIAL_STYLE.hoverColor,
  };
}

/** Strict save-time check of a Social Links block's props. */
export function socialLinksProblem(props: Record<string, unknown>): string | null {
  const items = props.items;
  if (items !== undefined && !Array.isArray(items)) return "Social links couldn't be read.";
  if (Array.isArray(items)) {
    if (items.length > SOCIAL_LIMITS.items) return `Social Links can hold up to ${SOCIAL_LIMITS.items} links.`;
    for (const raw of items) {
      if (!raw || typeof raw !== "object") return "A social link couldn't be read.";
      const item = raw as Record<string, unknown>;
      if (!SOCIAL_NETWORKS.includes(item.network as SocialNetwork)) return "A social link's network isn't supported.";
      if (typeof item.url !== "string" || item.url.length > SOCIAL_LIMITS.url) return "A social link's address is too long.";
      if (item.label !== undefined && (typeof item.label !== "string" || item.label.length > SOCIAL_LIMITS.label)) return `A social link's label must be ${SOCIAL_LIMITS.label} characters or fewer.`;
      if (/^\s*(javascript|data|vbscript):/i.test(item.url)) return "A social link must be an https link or an email address.";
    }
  }
  return null;
}
