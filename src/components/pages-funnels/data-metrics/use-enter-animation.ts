"use client";

import { useEffect, useRef, useState } from "react";
import { easeOutCubic } from "@/lib/pages-funnels/data-metrics/counter";

export type EnterAnimationMode = "onScroll" | "onLoad" | "none";

/**
 * Runs a single 0→1 animation for a Data & Metrics block, at most once.
 *
 * - Server render and first client render both use progress 1 (the final
 *   state), so hydration always matches and no-JS visitors see real values.
 * - Disabled in the builder (`enabled: false`) and for visitors who prefer
 *   reduced motion: the final state stays put.
 * - "onScroll" waits until the block is at least 30% in view; "onLoad" starts
 *   straight away.
 */
export function useEnterAnimation<T extends Element>({
  enabled,
  mode,
  durationMs,
}: {
  enabled: boolean;
  mode: EnterAnimationMode;
  durationMs: number;
}) {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(1);
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled || mode === "none" || ran.current) return;
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let observer: IntersectionObserver | null = null;
    const run = () => {
      ran.current = true;
      const started = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - started) / durationMs);
        setProgress(easeOutCubic(t));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    if (mode === "onLoad" || typeof IntersectionObserver === "undefined") {
      setProgress(0);
      run();
    } else {
      setProgress(0);
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            run();
          }
        },
        { threshold: 0.3 },
      );
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      // An interrupted run (unmount) never leaves a half-drawn value behind.
      if (!ran.current) setProgress(1);
    };
    // Run once per mount: settings edits in Preview don't replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { ref, progress };
}
