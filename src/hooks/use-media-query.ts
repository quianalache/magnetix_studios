"use client";

import { useEffect, useState } from "react";

/**
 * Minimal `matchMedia` hook — no existing shared version in the codebase
 * (checked before adding this; the two prior `matchMedia` call sites each
 * inlined their own one-off check). Added for the GIF picker's desktop-
 * popover-vs-mobile-sheet split (Phase D), but generic enough for any
 * future responsive-chrome need. SSR-safe: starts `false` and only reads
 * `window` in an effect, so it never mismatches on hydration — the correct
 * value lands one paint after mount, same tradeoff `install-banner.tsx`
 * already accepts for its own display-mode check.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Below Tailwind's `sm` breakpoint (640px) — the same width this codebase's
 *  `sm:` utility classes already treat as "mobile" everywhere else. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 639px)");
}
