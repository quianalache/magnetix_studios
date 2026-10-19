import { PublicReadingTool } from "@/components/energetic-decoder/public-reading-tool";
import { ReadingToolElementClientRender } from "@/components/pages-funnels/puck/reading-tool-client";
import { resolveBaseStyleProps, resolveResponsiveCss } from "@/lib/pages-funnels/puck/style";
import type { PuckPageMetadata, StyleConfig } from "@/types/pages-funnels-puck";

/**
 * SERVER/PUBLIC Public Reading Tool element (`serverPuckConfig`). On a
 * published page the route pre-resolves every placed Embed into
 * `metadata.resolvedEmbeds`; this renders the live tool with the page as its
 * placement (so the Reading records which page produced it). A missing,
 * Draft or Archived Embed renders NOTHING for visitors — no labels, no
 * placeholders (fail closed). In the builder Preview (no pre-resolved data)
 * it falls back to the staff fetch in Preview mode.
 */
export function ReadingToolElementServerRender({
  id,
  embedId,
  style,
  metadata,
}: {
  id: string;
  embedId: string;
  style?: StyleConfig;
  metadata?: PuckPageMetadata;
}) {
  if (metadata?.resolvedEmbeds === undefined) {
    return <ReadingToolElementClientRender id={id} embedId={embedId} style={style} metadata={metadata} showChrome={false} />;
  }
  const payload = embedId ? metadata.resolvedEmbeds[embedId] : null;
  if (!payload || payload.status !== "live") return null;

  const responsiveCss = resolveResponsiveCss(id, style);
  const baseStyle = resolveBaseStyleProps(style);
  return (
    <div id={id}>
      {responsiveCss && <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />}
      <div style={baseStyle}>
        <PublicReadingTool
          saId={metadata.subAccountId}
          embedId={payload.embedId}
          embed={payload.embed}
          accent={payload.accent}
          hdDesign={payload.designs.hdDesign}
          mandalaDesign={payload.designs.mandalaDesign}
          astroDesign={payload.designs.astroDesign}
          mode="live"
          placement={metadata.pageId ? { kind: "page", pageId: metadata.pageId } : { kind: "direct" }}
          logVisit
        />
      </div>
    </div>
  );
}
