"use client";

import { useEffect, useState } from "react";
import { PublicReadingTool } from "@/components/energetic-decoder/public-reading-tool";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";
import type { PuckPageMetadata, StyleConfig } from "@/types/pages-funnels-puck";
import type { ReadingToolPayload } from "@/types/embed-config";

/**
 * Builder-side Public Reading Tool (the Puck editor canvas and the builder
 * Preview): fetches the Embed for the signed-in staff member and runs the
 * real tool in Preview mode — the real form and calculation, nothing saved.
 * The "Public Reading Tool · {Embed}" label is builder chrome only; the
 * published page never renders it.
 */
export function ReadingToolElementClientRender({
  id,
  embedId,
  style,
  metadata,
  showChrome = true,
}: {
  id: string;
  embedId: string;
  style?: StyleConfig;
  metadata?: PuckPageMetadata;
  showChrome?: boolean;
}) {
  const subAccountId = metadata?.subAccountId ?? "";
  const [payload, setPayload] = useState<ReadingToolPayload | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "missing">("idle");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!embedId || !subAccountId) {
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    const base = `/api/sub-accounts/${subAccountId}/energetic-decoder/embeds/${encodeURIComponent(embedId)}`;
    Promise.all([fetch(`${base}?view=tool`), fetch(base)])
      .then(async ([toolRes, embedRes]) => {
        if (cancelled) return;
        if (!toolRes.ok) return setState("missing");
        const tool = await toolRes.json();
        const embed = embedRes.ok ? await embedRes.json() : null;
        setPayload(tool.payload);
        setName(embed?.embed?.name ?? "");
        setState("ready");
      })
      .catch(() => !cancelled && setState("missing"));
    return () => {
      cancelled = true;
    };
  }, [embedId, subAccountId]);

  const responsiveCss = resolveResponsiveCss(id, style);
  const baseStyle = resolveBaseStyleProps(style);

  let body: React.ReactNode;
  if (!embedId) {
    body = <Placeholder>Choose a Reading Tool for this block</Placeholder>;
  } else if (state === "loading" || state === "idle") {
    body = <Placeholder>Loading the reading tool…</Placeholder>;
  } else if (state === "missing" || !payload) {
    body = <Placeholder>This Reading Tool no longer exists. Choose another.</Placeholder>;
  } else {
    body = (
      <div className="space-y-2" style={baseStyle}>
        {showChrome && (
          <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold uppercase tracking-wide">Reading Tool</span>
            <span>· {name || "Reading Tool"}</span>
            {payload.status !== "live" && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700">{payload.status === "draft" ? "Draft — not visible to visitors" : "Archived — not visible to visitors"}</span>}
          </p>
        )}
        <PublicReadingTool
          saId={subAccountId}
          embedId={payload.embedId}
          embed={payload.embed}
          accent={payload.accent}
          hdDesign={payload.designs.hdDesign}
          mandalaDesign={payload.designs.mandalaDesign}
          astroDesign={payload.designs.astroDesign}
          mode="preview"
          placement={metadata?.pageId ? { kind: "page", pageId: metadata.pageId } : { kind: "direct" }}
        />
      </div>
    );
  }

  return (
    <div id={id}>
      {responsiveCss && <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />}
      {body}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-muted text-muted-foreground flex h-24 items-center justify-center rounded-2xl border border-dashed px-4 text-center text-sm">
      {children}
    </div>
  );
}
