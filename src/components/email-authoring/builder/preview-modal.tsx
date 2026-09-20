"use client";

import { useEffect, useState } from "react";
import { Laptop, Loader2, Smartphone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Preview — the top-controls "final verification" action (task instruction
 * 8), NOT the primary editing surface. `getHtml` is scope-provided (tenant
 * fetches POST /api/broadcasts/render; Agency fetches its catch-all render
 * handler; Templates render client-side via renderEmailHtml directly) so
 * this component stays ignorant of which surface it's running in — same
 * "thin adapter" pattern as the rest of the builder's scope boundary.
 */

export function PreviewModal({
  open,
  onClose,
  getHtml,
}: {
  open: boolean;
  onClose: () => void;
  getHtml: () => Promise<string>;
}) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHtml()
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Preview failed to load"
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, getHtml]);

  if (!open) return null;

  return (
    <div className="bg-background/95 fixed inset-0 z-50 flex flex-col backdrop-blur-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="bg-muted/40 flex items-center gap-1 rounded-lg border p-1">
          <button
            type="button"
            onClick={() => setViewport("desktop")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              viewport === "desktop"
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <Laptop className="h-4 w-4" /> Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport("mobile")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              viewport === "mobile"
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <Smartphone className="h-4 w-4" /> Mobile
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Close preview"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-1 items-start justify-center overflow-auto p-6">
        {loading && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
          </div>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
        {!loading && !error && html !== null && (
          <iframe
            title="Email preview"
            srcDoc={html}
            className={cn(
              "h-full min-h-[600px] rounded-lg border bg-white shadow-sm transition-all",
              viewport === "desktop" ? "w-full max-w-[640px]" : "w-[375px]"
            )}
          />
        )}
      </div>
    </div>
  );
}
