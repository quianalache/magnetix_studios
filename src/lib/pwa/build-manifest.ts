import "server-only";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { getPwaIconVersion } from "@/lib/pwa/icons-server";
import { ICON_STATIC_FALLBACKS } from "@/lib/pwa/icon-variants";
import { LANDING_VARIANT } from "@/config/landing";

/**
 * Shared PWA manifest body, factored out so each install context gets its
 * own STABLE, independently-cacheable URL instead of one shared URL whose
 * content depended on the request's Referer header.
 *
 * That Referer approach was tried first and reverted: this route sets
 * `Cache-Control: public, max-age=300` (so a brand rename doesn't cost a
 * Firestore read on every load) and neither browsers nor Vercel's edge
 * cache key a cached response on Referer without an explicit `Vary`, so a
 * manifest fetched for one context was served back to the OTHER context
 * for up to 5 minutes on the same edge PoP — confirmed live via
 * `x-vercel-cache: HIT` on a request whose Referer should have produced a
 * different `start_url`. A distinct URL per context sidesteps the problem
 * entirely: each is cached correctly under its own key, no Vary needed.
 *
 * Identity is per deployment mode:
 *   - "custom" (buyer): app name/description merge the agency doc over
 *     CUSTOM_BRAND (resolveCustomBrand).
 *   - "leadstack" (demo/template): fixed LeadStack identity.
 *
 * Icons are shared logic in both modes: an owner-uploaded icon (Agency →
 * Settings → Mobile app icon) serves from /api/pwa/icon/* with the upload
 * timestamp as cache-buster; otherwise the mode's static defaults apply —
 * green "my CRM" for buyers, the chevron set for the demo (both via the
 * variant-aware ICON_STATIC_FALLBACKS).
 */
export async function buildManifest(startUrl: string) {
  const isCustom = LANDING_VARIANT === "custom";
  const [brand, iconVersion] = await Promise.all([
    isCustom ? resolveCustomBrand() : Promise.resolve(null),
    getPwaIconVersion(),
  ]);

  const name = brand?.name ?? "LeadStack";
  const description =
    brand?.shortDescription ??
    "The all-in-one CRM for teams that actually close.";

  const icons = iconVersion
    ? [
        {
          src: `/api/pwa/icon/192?v=${iconVersion}`,
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: `/api/pwa/icon/512?v=${iconVersion}`,
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: `/api/pwa/icon/maskable?v=${iconVersion}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ]
    : [
        {
          src: ICON_STATIC_FALLBACKS["192"],
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: ICON_STATIC_FALLBACKS["512"],
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: ICON_STATIC_FALLBACKS.maskable,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ];

  return {
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description,
    id: "/",
    start_url: startUrl,
    scope: "/",
    display: "standalone" as const,
    background_color: "#18181b",
    theme_color: "#18181b",
    icons,
    // Long-press-the-app-icon shortcuts. Static URLs by spec, so they use
    // the legacy flat routes, which redirect into the user's
    // first-membership sub-account. Staff-only shortcuts — only relevant
    // for the /dashboard manifest, but harmless to include on both since a
    // MyMagnetix Person with no staff access simply gets redirected by
    // those routes' own auth checks if they're ever invoked.
    shortcuts: [
      {
        name: "Conversations",
        url: "/conversations",
        icons: [
          { src: ICON_STATIC_FALLBACKS["192"], sizes: "192x192", type: "image/png" },
        ],
      },
      {
        name: "Contacts",
        url: "/contacts",
        icons: [
          { src: ICON_STATIC_FALLBACKS["192"], sizes: "192x192", type: "image/png" },
        ],
      },
      {
        name: "Pipeline",
        url: "/pipeline",
        icons: [
          { src: ICON_STATIC_FALLBACKS["192"], sizes: "192x192", type: "image/png" },
        ],
      },
    ],
  };
}
