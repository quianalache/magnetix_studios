import type { NavItem, NavItemKey } from "@/types/community";

/**
 * Community Settings → Navigation — shared config logic used by both the
 * settings page (client) and the write path (server), so "what counts as a
 * valid navigation config" is defined exactly once. See `NavItem`'s own doc
 * comment in types/community.ts for the field shapes.
 */

/** Mandatory tabs — product logic, not mutable persisted state (Part 15).
 *  `normalizeNavigation` below forces these `visible: true` on every read
 *  AND every write, so no stored or in-flight payload (malformed, stale,
 *  or a direct API call) can ever actually hide one (Part 5). */
export const MANDATORY_NAV_KEYS: NavItemKey[] = ["community", "about"];

/** Short tab label — generous for anything meaningful, small enough that a
 *  renamed tab can't break the top-nav layout (Part 8 / Part 17). */
export const NAV_LABEL_MAX_CHARS = 30;

interface NavItemMeta {
  key: NavItemKey;
  defaultLabel: string;
  /** Verbatim copy from the approved Navigation mock-up. */
  description: string;
}

/** Order here IS the default order — the approved mock-up's row order. */
export const NAV_ITEM_META: NavItemMeta[] = [
  {
    key: "community",
    defaultLabel: "Community",
    description: "Start or join conversations, share updates, and connect with members.",
  },
  {
    key: "classroom",
    defaultLabel: "Classroom",
    description: "Create and manage courses, resources, and learning content.",
  },
  {
    key: "events",
    defaultLabel: "Events",
    description: "Plan, host, and view upcoming community events.",
  },
  {
    key: "leaderboards",
    defaultLabel: "Leaderboard",
    description: "Recognize engaged members and encourage participation through rankings.",
  },
  {
    key: "members",
    defaultLabel: "Members",
    description: "View and manage members and roles. This tab stays visible to admins even when disabled.",
  },
  {
    key: "about",
    defaultLabel: "About",
    description: "Introduce your community's purpose, values, and background.",
  },
];

const KNOWN_KEYS = new Set<NavItemKey>(NAV_ITEM_META.map((m) => m.key));

function defaultNavigation(): NavItem[] {
  return NAV_ITEM_META.map((m, i) => ({ key: m.key, label: m.defaultLabel, visible: true, order: i }));
}

/**
 * Turn whatever is currently stored — possibly `undefined`, empty,
 * malformed, from an older/partial shape, or a tampered direct-API payload
 * — into a complete, safe `NavItem[]` covering every known key exactly
 * once, sorted and re-sequenced by `order`. This is the ONE function both
 * the read path (rendering the real top nav / the Settings page) and the
 * write path (the PATCH route, before anything reaches Firestore) call, so
 * a malformed or malicious payload can never actually persist or render a
 * hidden mandatory tab, an unknown key, or a wildly long label.
 */
export function normalizeNavigation(raw: unknown): NavItem[] {
  const defaults = defaultNavigation();
  if (!Array.isArray(raw) || raw.length === 0) return defaults;

  const byKey = new Map<NavItemKey, NavItem>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const key = (entry as { key?: unknown }).key;
    if (typeof key !== "string" || !KNOWN_KEYS.has(key as NavItemKey)) continue;
    const meta = NAV_ITEM_META.find((m) => m.key === key)!;
    const rawLabel = (entry as { label?: unknown }).label;
    const label =
      typeof rawLabel === "string" && rawLabel.trim()
        ? rawLabel.trim().slice(0, NAV_LABEL_MAX_CHARS)
        : meta.defaultLabel;
    // Missing/malformed `visible` defaults to shown, never hidden — a
    // config that fails to specify visibility shouldn't silently vanish a
    // tab.
    const visible = (entry as { visible?: unknown }).visible !== false;
    const rawOrder = (entry as { order?: unknown }).order;
    const order = typeof rawOrder === "number" && Number.isFinite(rawOrder) ? rawOrder : 999;
    byKey.set(key as NavItemKey, { key: key as NavItemKey, label, visible, order });
  }

  // Any known key missing from the stored payload (legacy config saved
  // before a key existed, or a partially-malformed request) falls back to
  // its default rather than disappearing.
  const merged = defaults.map((d) => byKey.get(d.key) ?? d);

  for (const item of merged) {
    if (MANDATORY_NAV_KEYS.includes(item.key)) item.visible = true;
  }

  return merged.sort((a, b) => a.order - b.order).map((item, i) => ({ ...item, order: i }));
}

/**
 * The actual list the real top Community nav renders, in saved order.
 * Hidden optional tabs are dropped for everyone EXCEPT Members, which
 * stays visible to moderators even when hidden for ordinary members (Part
 * 6) — the underlying `/members` route has no role gate of its own and
 * nothing else in the UI links to it, so hiding its only entry point would
 * otherwise lock admins out of member management entirely, not just hide a
 * tab.
 */
export function getVisibleNavItems(nav: NavItem[], opts: { isModerator: boolean }): NavItem[] {
  return nav.filter((item) => {
    if (item.visible) return true;
    if (item.key === "members" && opts.isModerator) return true;
    return false;
  });
}
