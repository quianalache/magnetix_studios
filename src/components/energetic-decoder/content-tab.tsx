"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ContentSetsLibrary } from "@/components/energetic-decoder/content-sets-library";
import { ContentSetEditor, type EditorSelection } from "@/components/energetic-decoder/content-set-editor";
import type { ContentSystem } from "@/lib/energetic-decoder/content-sets";

/**
 * Energetic Decoder → Content (Content Sets, 2026-10-07). Replaces the
 * single workbench that edited the one workspace library: that library is
 * now the built-in "Default" Content Set (same data, same saves), alongside
 * the workspace's own sets.
 *
 * URL-driven: `?tab=content` = the library; `&set=ID` opens the editor, with
 * `&system=…&category=…&entry=…` for the selection. Opening a set and
 * opening an entry push history (Back returns); within-step changes replace.
 */
export function EnergeticDecoderContentTab() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const setId = searchParams.get("set");

  function go(params: Record<string, string | null>, push: boolean) {
    const next = new URLSearchParams({ tab: "content" });
    for (const [k, v] of Object.entries(params)) if (v) next.set(k, v);
    const url = `${pathname}?${next.toString()}`;
    if (push) router.push(url, { scroll: false });
    else router.replace(url, { scroll: false });
  }

  if (!setId)
    return (
      <ContentSetsLibrary
        onOpenSet={(id) => {
          go({ set: id }, true);
          window.scrollTo({ top: 0 });
        }}
      />
    );

  const system = searchParams.get("system");
  const selection: EditorSelection = {
    system: system === "hd" || system === "astro" || system === "freq" ? (system as ContentSystem) : null,
    category: searchParams.get("category"),
    entry: searchParams.get("entry"),
  };
  return (
    <ContentSetEditor
      key={setId}
      setId={setId}
      selection={selection}
      onBack={() => go({}, true)}
      onSelect={(next) => {
        // Each phone step is its own history entry so the device Back button walks back a step.
        go({ set: setId, system: next.system, category: next.category, entry: next.entry }, true);
      }}
    />
  );
}
