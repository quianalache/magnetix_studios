import { cn } from "@/lib/utils";
import type { BackgroundConfig } from "@/types/pages-funnels-puck";
import { backgroundCssValue } from "@/lib/pages-funnels/puck/background";

/**
 * The ONE shared background rendering primitive — Section, Row, and Column
 * all render this exact component (Phase 2D task §6: "use the same shared
 * data model and renderer helper... do not implement three unrelated
 * copies"). A dedicated absolutely-positioned layer BEHIND content, not a
 * `background`/`filter` style on the container itself — required for
 * Background Blur (task §7: "ensure child content itself remains crisp"):
 * `filter: blur()` on a container blurs everything inside it, including
 * text and images, so blur must live on its own layer with real content
 * rendered in a separate sibling on top.
 *
 * The caller is responsible for giving its own root element `relative`
 * positioning and `overflow-hidden` (Section/Row/Column all already do,
 * see layout.tsx) — this component only renders the background layer
 * itself. When blur is OFF, the layer sits at `inset-0` (an exact match
 * to the container, so gradient stop percentages line up with the visible
 * edges exactly as authored). When blur is ON, the layer overscans
 * slightly (`-inset-6`, i.e. 24px beyond every edge) so the blur's own
 * sampling doesn't fade to a visible transparent halo right at the
 * container boundary — the parent's `overflow-hidden` clips that overscan
 * back to the real edge, and the small percentage-alignment shift this
 * causes is imperceptible under blur (the whole point of blur is to
 * obscure exact positioning).
 */
export function BackgroundLayer({
  background,
}: {
  background: BackgroundConfig | undefined;
}) {
  const value = backgroundCssValue(background);
  const blurEnabled =
    !!background?.blur?.enabled && background.blur.intensity > 0;

  if (!value && !blurEnabled) return null;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute",
        blurEnabled ? "-inset-6" : "inset-0"
      )}
      style={{
        background: value,
        filter: blurEnabled
          ? `blur(${background!.blur.intensity}px)`
          : undefined,
      }}
    />
  );
}
