/**
 * Whether a click on a link should ask "leave without saving?" first —
 * pure, so the rule is covered by the checks. Only plain left-clicks that
 * would navigate this tab away to a different page count; new-tab clicks,
 * downloads, in-page anchors and same-page links never prompt.
 */
export function isGuardedNavigationClick(opts: {
  dirty: boolean;
  href: string | null;
  currentUrl: string;
  target: string | null;
  download: boolean;
  button: number;
  modifierKey: boolean;
}): boolean {
  if (!opts.dirty || !opts.href) return false;
  if (opts.button !== 0 || opts.modifierKey || opts.download) return false;
  if (opts.target && opts.target !== "_self") return false;
  if (opts.href.startsWith("#") || opts.href.startsWith("mailto:") || opts.href.startsWith("tel:")) return false;
  let next: URL;
  let current: URL;
  try {
    current = new URL(opts.currentUrl);
    next = new URL(opts.href, current);
  } catch {
    return false;
  }
  return !(next.origin === current.origin && next.pathname === current.pathname && next.search === current.search);
}
