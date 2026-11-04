import { embedBlockProblem } from "@/lib/pages-funnels/embed";
import { audioBlockProblem } from "@/lib/pages-funnels/audio";
import { socialLinksProblem } from "@/lib/pages-funnels/social-links";
import { normalizeMediaVideo } from "@/lib/pages-funnels/puck/media-video";

/**
 * Strict save-time checks for the Wave 3 blocks (Embed, Audio, Social
 * Links) and the Video block's Media Library source, anywhere in a Puck tree
 * (slots, nested rows, popups). Returns the first problem as a user-facing
 * message. Render paths stay lenient/safe on their own.
 */
export function findWave3BlockProblem(data: unknown): string | null {
  const seen = new Set<object>();
  let problem: string | null = null;
  const visit = (value: unknown) => {
    if (problem || !value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) return value.forEach(visit);
    const node = value as { type?: unknown; props?: Record<string, unknown> };
    if (node.props && typeof node.props === "object") {
      if (node.type === "Embed") problem = embedBlockProblem(node.props);
      else if (node.type === "Audio") problem = audioBlockProblem(node.props);
      else if (node.type === "SocialLinks") problem = socialLinksProblem(node.props);
      else if (node.type === "Video") problem = videoSourceProblem(node.props);
      if (problem) return;
    }
    Object.values(value).forEach(visit);
  };
  visit(data);
  return problem;
}

/** Video block: an optional Media Library video (Wave 3) and poster. */
export function videoSourceProblem(props: Record<string, unknown>): string | null {
  const ref = props.mediaVideo;
  if (ref !== undefined && ref !== null && !normalizeMediaVideo(ref)) return "A Media Library video couldn't be read.";
  const poster = (props.playback as { posterUrl?: unknown } | undefined)?.posterUrl;
  // Lenient on purpose: the poster used to be a free-text field, so older
  // pages may hold any string. Only unsafe schemes / absurd lengths are
  // refused; the renderer uses a poster only when it's an http(s) URL.
  if (poster !== undefined && poster !== null && (typeof poster !== "string" || poster.length > 2048 || /^\s*(javascript|data|vbscript):/i.test(poster))) {
    return "A video poster must be a public https image.";
  }
  return null;
}
