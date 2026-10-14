/**
 * Workspace (sub-account) logo resolution — the ONE place surfaces ask for
 * "this workspace's logo" (2026-10-14). Today the logo is a URL saved in
 * Settings → Business profile → Branding (`subAccount.logoUrl`). When that
 * becomes a real upload, change it here and every consumer (booking page,
 * booking editor preview, …) follows. Client-safe, no I/O.
 */
export function resolveWorkspaceLogo(sub: { logoUrl?: string | null } | null | undefined): string | null {
  const url = typeof sub?.logoUrl === "string" ? sub.logoUrl.trim() : "";
  return url ? url : null;
}

/**
 * The logo a booking page shows:
 *  - Show logo OFF (`showLogo === false`) → none; the business-name lockup is used.
 *  - Otherwise the workspace logo. A page saved before 2026-10-14 may carry
 *    its own `logoUrl` override; it keeps working until the operator switches
 *    the page back to the workspace logo in Booking → Appearance.
 *  - No logo anywhere → null (the name + initial lockup).
 */
export function resolveBookingLogo(
  page: { showLogo?: boolean | null; logoUrl?: string | null },
  sub: { logoUrl?: string | null } | null | undefined,
): string | null {
  if (page.showLogo === false) return null;
  const own = typeof page.logoUrl === "string" ? page.logoUrl.trim() : "";
  return own || resolveWorkspaceLogo(sub);
}
