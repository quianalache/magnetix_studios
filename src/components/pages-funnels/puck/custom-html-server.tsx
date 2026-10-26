import type { CustomHtmlArtifact, StyleConfig } from "@/types/pages-funnels-puck";
import { buildSafeCustomHtmlDocument } from "@/lib/pages-funnels/custom-html/sanitize";
import { CustomHtmlBlock } from "@/components/pages-funnels/puck/custom-html-frame";

export interface CustomHtmlComponentProps {
  id: string;
  content?: CustomHtmlArtifact;
  style?: StyleConfig;
  editing: boolean;
}

/**
 * `serverPuckConfig` variant. On published pages (`/p/[pageId]`, a server
 * render) it sanitizes on the server, so visitors receive only the finished,
 * isolated frame document. Preview uses the same config but renders in the
 * browser, so there the same sanitizer runs client-side — identical output.
 * Mirrors the Form/Reading Tool client/server split (config.tsx).
 */
export function CustomHtmlElementServerRender({ id, content, style, editing }: CustomHtmlComponentProps) {
  const doc = buildSafeCustomHtmlDocument(content);
  return <CustomHtmlBlock id={id} srcDoc={doc.srcDoc} isEmpty={doc.isEmpty} display={doc.display} style={style} editing={editing} />;
}
