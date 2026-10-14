import { useTheme } from "next-themes";

/**
 * Light-only CRM (design-system Phase 0, owner decision 2026-10-13).
 *
 * The internal CRM — every route under the (dashboard), (builder), (immersive)
 * and (agency-immersive) groups — is forced to light mode, and the dark-mode
 * control is hidden. Dark mode is a FUTURE design task: next-themes, the
 * `.dark` tokens and the ThemeToggle component stay in place, so turning it
 * back on is one line (drop `forcedTheme` in components/providers.tsx).
 * Routes outside the CRM (marketing site, tenant/public pages) are unchanged.
 */
export const CRM_FORCED_THEME = "light";

const CRM_ROUTE = /^\/(sa|agency|me|calendar|contacts|conversations|dashboard|forms|pipeline|reports|tasks|docs\/design-system)(\/|$)/;

export function isCrmRoute(pathname: string): boolean {
  return CRM_ROUTE.test(pathname);
}

/** True when the page is effectively dark (respects the CRM's forced light mode). */
export function useIsDarkTheme(): boolean {
  const { resolvedTheme, forcedTheme } = useTheme();
  return (forcedTheme ?? resolvedTheme) === "dark";
}
