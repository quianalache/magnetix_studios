/**
 * Page Settings (Wave 3) — the PUBLISHABLE, public-facing settings of a
 * Pages & Funnels page: SEO title + description, social preview image,
 * noindex, and the tenant's structured tracking IDs (Meta Pixel, GA4, GTM).
 *
 * Owner decision (Wave 3, "Option B — live on Publish"): these follow the
 * page's draft / published model. They are stored INSIDE the Puck tree, at
 * `root.props.pageSettings`, so the existing machinery carries them with no
 * second settings system: Save Draft / autosave write the draft tree, Publish
 * copies the draft tree to the published tree, Revert copies it back, and the
 * public page reads only the published tree. Page NAME is different — it is
 * internal management metadata on the page doc and changes immediately.
 *
 * Legacy pages (and pages created before Wave 3) have no
 * `root.props.pageSettings`; their SEO lived in the flat `page.seo` field.
 * `resolvePageSettings` falls back to that field, so existing metadata keeps
 * working with no migration write — the first time someone saves Page
 * Settings, the values move into the tree.
 *
 * Pure + client-safe.
 */

export interface PageTrackingIds {
  metaPixelId: string;
  ga4Id: string;
  gtmId: string;
}

export interface PageSettings {
  seoTitle: string;
  seoDescription: string;
  /** Public https image URL (an upload or a Media Library public copy). */
  socialImage: string;
  noindex: boolean;
  tracking: PageTrackingIds;
}

export const PAGE_SETTINGS_LIMITS = {
  name: 60,
  seoTitle: 120,
  seoDescription: 320,
  url: 2048,
} as const;

/** Guidance only (shown as a counter) — never enforced or truncated. */
export const SEO_RECOMMENDED = { title: 60, description: 160 } as const;

export const EMPTY_TRACKING: PageTrackingIds = { metaPixelId: "", ga4Id: "", gtmId: "" };

export const EMPTY_PAGE_SETTINGS: PageSettings = {
  seoTitle: "",
  seoDescription: "",
  socialImage: "",
  noindex: false,
  tracking: EMPTY_TRACKING,
};

// Formats are deliberately forgiving about case/whitespace (normalized) but
// strict about shape, since these IDs are written into script tags.
const META_PIXEL = /^\d{6,20}$/;
const GA4 = /^G-[A-Z0-9]{4,16}$/;
const GTM = /^GTM-[A-Z0-9]{4,12}$/;

export const normalizeMetaPixelId = (v: string) => v.replace(/\s+/g, "");
export const normalizeGa4Id = (v: string) => v.replace(/\s+/g, "").toUpperCase();
export const normalizeGtmId = (v: string) => v.replace(/\s+/g, "").toUpperCase();

export const isMetaPixelId = (v: string) => META_PIXEL.test(v);
export const isGa4Id = (v: string) => GA4.test(v);
export const isGtmId = (v: string) => GTM.test(v);

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function isPublicImageUrl(v: string): boolean {
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

/** Lenient read of a stored value — anything malformed becomes empty. */
export function normalizePageSettings(raw: unknown): PageSettings {
  if (!isObject(raw)) return EMPTY_PAGE_SETTINGS;
  const t = isObject(raw.tracking) ? raw.tracking : {};
  return {
    seoTitle: str(raw.seoTitle),
    seoDescription: str(raw.seoDescription),
    socialImage: str(raw.socialImage),
    noindex: raw.noindex === true,
    tracking: {
      metaPixelId: str(t.metaPixelId),
      ga4Id: str(t.ga4Id),
      gtmId: str(t.gtmId),
    },
  };
}

type PuckLike = { root?: { props?: Record<string, unknown> } | null } | null | undefined;
type LegacySeo = { title?: string; description?: string; ogImage?: string } | null | undefined;

/** Whether a Puck tree carries Wave 3 Page Settings (vs. falling back to legacy `seo`). */
export function hasStoredPageSettings(data: PuckLike): boolean {
  return isObject(data?.root?.props?.pageSettings);
}

/**
 * The page settings carried by one Puck tree (draft OR published), falling
 * back to the legacy flat `seo` field for a tree that predates Wave 3.
 */
export function resolvePageSettings(data: PuckLike, legacySeo?: LegacySeo): PageSettings {
  if (hasStoredPageSettings(data)) return normalizePageSettings(data!.root!.props!.pageSettings);
  return {
    ...EMPTY_PAGE_SETTINGS,
    seoTitle: str(legacySeo?.title),
    seoDescription: str(legacySeo?.description),
    socialImage: str(legacySeo?.ogImage),
  };
}

/** A copy of the tree with these settings stored on its root. */
export function withPageSettings<T extends { root?: unknown }>(data: T, settings: PageSettings): T {
  const root = isObject(data.root) ? data.root : {};
  const props = isObject((root as { props?: unknown }).props) ? (root as { props: Record<string, unknown> }).props : {};
  return { ...data, root: { ...root, props: { ...props, pageSettings: settings } } };
}

/**
 * Strict save-time check of a stored `root.props.pageSettings`. Absent is
 * fine (legacy). Returns the first problem as a user-facing message.
 */
export function pageSettingsProblem(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (!isObject(raw)) return "Page Settings couldn't be read. Reload the page and try again.";
  const s = normalizePageSettings(raw);
  if (raw.seoTitle !== undefined && typeof raw.seoTitle !== "string") return "SEO title must be text.";
  if (s.seoTitle.length > PAGE_SETTINGS_LIMITS.seoTitle) return `SEO title must be ${PAGE_SETTINGS_LIMITS.seoTitle} characters or fewer.`;
  if (s.seoDescription.length > PAGE_SETTINGS_LIMITS.seoDescription) return `SEO description must be ${PAGE_SETTINGS_LIMITS.seoDescription} characters or fewer.`;
  if (s.socialImage && (s.socialImage.length > PAGE_SETTINGS_LIMITS.url || !isPublicImageUrl(s.socialImage))) {
    return "The social preview image must be a public https image.";
  }
  if (raw.noindex !== undefined && typeof raw.noindex !== "boolean") return "Page Settings couldn't be read. Reload the page and try again.";
  if (s.tracking.metaPixelId && !isMetaPixelId(s.tracking.metaPixelId)) return "Meta Pixel ID should be the numeric ID from Meta Events Manager.";
  if (s.tracking.ga4Id && !isGa4Id(s.tracking.ga4Id)) return "GA4 Measurement ID should look like G-XXXXXXXXXX.";
  if (s.tracking.gtmId && !isGtmId(s.tracking.gtmId)) return "GTM Container ID should look like GTM-XXXXXXX.";
  return null;
}

/** Same check, read from a whole Puck tree. */
export function findPageSettingsProblem(data: PuckLike): string | null {
  return pageSettingsProblem(data?.root?.props?.pageSettings);
}

/**
 * Tracking IDs that are safe to write into a script tag — re-validated at
 * render (safe render), so a stored value that slipped past save never
 * reaches the page. Empty / malformed IDs are dropped.
 */
export function safeTrackingIds(tracking: PageTrackingIds): Partial<PageTrackingIds> {
  const out: Partial<PageTrackingIds> = {};
  if (isMetaPixelId(tracking.metaPixelId)) out.metaPixelId = tracking.metaPixelId;
  if (isGa4Id(tracking.ga4Id)) out.ga4Id = tracking.ga4Id;
  if (isGtmId(tracking.gtmId)) out.gtmId = tracking.gtmId;
  return out;
}

/** Validation of a page NAME (immediate management metadata). */
export function pageNameProblem(name: unknown): string | null {
  if (typeof name !== "string") return "Enter a page name.";
  const trimmed = name.trim();
  if (!trimmed) return "Enter a page name.";
  if (trimmed.length > PAGE_SETTINGS_LIMITS.name) return `Page name must be ${PAGE_SETTINGS_LIMITS.name} characters or fewer.`;
  return null;
}

export interface PublicPageMetadataInput {
  settings: PageSettings;
  pageName: string;
  /** Reading Result Pages are always noindex (one person's Reading). */
  forceNoindex?: boolean;
}

export interface PublicPageMetadata {
  title: string;
  description: string | null;
  image: string | null;
  noindex: boolean;
}

/** What the public document head shows for these settings. */
export function publicPageMetadata({ settings, pageName, forceNoindex }: PublicPageMetadataInput): PublicPageMetadata {
  const title = settings.seoTitle.trim() || pageName.trim();
  const description = settings.seoDescription.trim() || null;
  const image = isPublicImageUrl(settings.socialImage) ? settings.socialImage : null;
  return { title, description, image, noindex: !!forceNoindex || settings.noindex };
}
