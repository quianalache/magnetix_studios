import type { CSSProperties } from "react";
import type {
  ImageSizeConfig,
  VideoSizeConfig,
  PuckAlignment,
} from "@/types/pages-funnels-puck";

/**
 * System B — Image/Video sizing resolvers (master spec §24.6). Pure,
 * additive-only (an unset field emits no CSS), same rule `style.ts`'s
 * resolvers already follow — an empty/default size config never changes
 * how existing/migrated Image or Video elements look, matching every
 * other System-A-era resolver in this codebase.
 */

export const DEFAULT_IMAGE_SIZE: ImageSizeConfig = {};
export const DEFAULT_VIDEO_SIZE: VideoSizeConfig = {};

const WIDTH_PERCENT: Record<string, number> = {
  "25": 25,
  "50": 50,
  "75": 75,
  "100": 100,
};

/** Applied to the `<img>` element itself. */
export function resolveImageSizeStyle(
  size: ImageSizeConfig | undefined
): CSSProperties {
  if (!size) return {};
  const style: CSSProperties = {};
  if (size.width && size.width !== "auto") {
    style.width = `${WIDTH_PERCENT[size.width]}%`;
  }
  if (size.maxWidthPx != null) style.maxWidth = `${size.maxWidthPx}px`;
  if (size.heightPx != null) {
    style.height = `${size.heightPx}px`;
    // object-fit/object-position are only meaningful once height is fixed
    // (see ImageSizeConfig's own doc comment) — resolved here, not gated
    // in the Settings UI, so a value entered then "orphaned" by clearing
    // height simply has nothing to affect rather than needing to be
    // separately reset.
    if (size.objectFit) style.objectFit = size.objectFit;
    if (size.objectPosition) style.objectPosition = size.objectPosition;
  }
  return style;
}

/** Applied to the `<video>`/iframe element itself. */
export function resolveVideoSizeStyle(
  size: VideoSizeConfig | undefined
): CSSProperties {
  if (!size) return {};
  const style: CSSProperties = {};
  if (size.width && size.width !== "auto") {
    style.width = `${WIDTH_PERCENT[size.width]}%`;
  }
  if (size.maxWidthPx != null) style.maxWidth = `${size.maxWidthPx}px`;
  return style;
}

const ASPECT_RATIO_VALUE: Record<
  NonNullable<VideoSizeConfig["aspectRatio"]>,
  string
> = {
  "16:9": "16 / 9",
  "9:16": "9 / 16",
  "1:1": "1 / 1",
  "4:3": "4 / 3",
};

/** The video's OWN aspect-ratio box (independent of `width`/`maxWidthPx`
 *  above) — defaults to 16:9 when unset, preserving the exact hardcoded
 *  `aspect-video` Tailwind behavior every Video element already had
 *  before System B, so this is additive, not a visual change for existing
 *  pages. */
export function videoAspectRatioValue(
  aspectRatio: VideoSizeConfig["aspectRatio"] | undefined
): string {
  return ASPECT_RATIO_VALUE[aspectRatio ?? "16:9"];
}

const JUSTIFY_CLASS: Record<PuckAlignment, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

/** The WRAPPER div's flex-justify class — positions the (possibly
 *  narrower-than-100%-width) media box within its column. Left, matching
 *  every existing element's default (block, natural position), when
 *  unset. */
export function mediaAlignmentClass(
  alignment: PuckAlignment | undefined
): string {
  return JUSTIFY_CLASS[alignment ?? "left"];
}
