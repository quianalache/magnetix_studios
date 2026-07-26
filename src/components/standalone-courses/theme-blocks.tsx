import { sanitizeLessonHtml } from "@/lib/community/lesson-html";
import { embedUrlFor } from "@/lib/community/video-embed";
import type {
  CourseBlock,
  ProgressSidebarBlock,
  InstructorSidebarBlock,
  ButtonAlign,
} from "@/types/course-theme";

/**
 * Renderers for the theme's customizable block types. Deliberately
 * synchronous and dependency-free (no Admin SDK, no fetching) so the EXACT
 * same components render both the real public sales page
 * (`src/app/course/[saId]/[courseId]/page.tsx`) AND the dashboard theme
 * editor's live preview pane, driven by in-progress local state — "looks
 * identical" is guaranteed by construction, not by keeping two renderers in
 * sync by hand. Cross Sell needs another course's title/price to show; both
 * callers resolve that themselves (a batch Admin SDK fetch on the public
 * page, the already-subscribed course list in the editor) and pass it in via
 * `crossSellTargets` rather than this component fetching it.
 */
export interface CrossSellTargetInfo {
  id: string;
  title: string;
  priceCents: number | null;
  currency: string | null;
  access: "open" | "purchase";
  published: boolean;
}

/**
 * Instructor has only a Background Color field (matches the GHL reference —
 * no separate name/title/bio color controls), so its text needs to stay
 * legible against whatever background the owner picks. Cheap luminance
 * check rather than a fixed gray that only works on light backgrounds.
 */
function readableTextOn(hexBackground: string): { strong: string; muted: string } {
  const hex = hexBackground.replace("#", "");
  if (hex.length !== 6) return { strong: "#202124", muted: "#909090" };
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6
    ? { strong: "#202124", muted: "#6b6178" }
    : { strong: "#ffffff", muted: "#c9c3d1" };
}

function alignClass(align: ButtonAlign): string {
  return align === "center"
    ? "justify-center"
    : align === "right"
      ? "justify-end"
      : "justify-start";
}

function formatPriceCents(cents: number | null, currency: string | null): string {
  if (cents == null) return "";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

export function CourseBlockView({
  block,
  saId,
  crossSellTargets,
}: {
  block: CourseBlock;
  /** Only used to build the Cross Sell block's link — no fetching happens here. */
  saId: string;
  crossSellTargets: ReadonlyMap<string, CrossSellTargetInfo>;
}) {
  switch (block.type) {
    case "text": {
      const html = sanitizeLessonHtml(block.bodyHtml);
      if (!html) return null;
      return (
        <div
          className="rounded-xl border border-[#E4E4E4] p-5 prose prose-sm max-w-none leading-relaxed"
          style={{ backgroundColor: block.background, color: block.textColor }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    case "image": {
      if (!block.imageUrl) return null;
      const img = (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.imageUrl}
          alt=""
          className="w-full rounded-xl border border-[#E4E4E4] object-cover"
        />
      );
      return block.linkUrl ? (
        <a href={block.linkUrl} target="_blank" rel="noreferrer">
          {img}
        </a>
      ) : (
        img
      );
    }

    case "video": {
      const src = embedUrlFor(block.videoProvider, block.videoId);
      if (!src) return null;
      return (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-[#E4E4E4] bg-black">
          <iframe
            src={src}
            title="Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      );
    }

    case "custom": {
      const html = sanitizeLessonHtml(block.bodyHtml);
      return (
        <div
          className="space-y-3 rounded-xl border p-5"
          style={{ backgroundColor: block.background, borderColor: block.borderColor }}
        >
          {block.heading && (
            <h3 className="text-lg font-semibold" style={{ color: block.headingColor }}>
              {block.heading}
            </h3>
          )}
          {block.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.imageUrl}
              alt=""
              className="w-full rounded-lg object-cover"
            />
          )}
          {html && (
            <div
              className="prose prose-sm max-w-none leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          {block.buttonVisible && block.buttonText && (
            <div className={`flex ${alignClass(block.buttonAlign)}`}>
              <a
                href={block.linkUrl || "#"}
                className="inline-flex items-center gap-1 rounded-md px-4 py-2 text-sm font-semibold"
                style={{
                  backgroundColor:
                    block.buttonType === "solid" ? block.buttonColor : "transparent",
                  color:
                    block.buttonType === "solid" ? block.buttonTextColor : block.buttonColor,
                }}
              >
                {block.buttonText}
              </a>
            </div>
          )}
        </div>
      );
    }

    case "crossSell": {
      if (!block.targetCourseId) return null;
      const target = crossSellTargets.get(block.targetCourseId);
      if (!target || !target.published) return null;
      const priceLabel =
        target.access === "purchase"
          ? formatPriceCents(target.priceCents, target.currency)
          : "Free";
      return (
        <div
          className="space-y-2 rounded-xl border border-[#E4E4E4] p-4"
          style={{ backgroundColor: block.background }}
        >
          <p className="text-sm font-semibold" style={{ color: block.titleColor }}>
            {target.title}
          </p>
          <p className="text-xs" style={{ color: block.priceColor }}>
            {priceLabel}
          </p>
          <a
            href={`/course/${saId}/${target.id}`}
            className="inline-flex w-full items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-semibold"
            style={{ backgroundColor: block.buttonColor, color: block.buttonTextColor }}
          >
            {block.buttonText}
          </a>
        </div>
      );
    }

    case "callToAction": {
      if (!block.buttonText) return null;
      return (
        <div className={`flex ${alignClass(block.buttonAlign)}`}>
          <a
            href={block.linkUrl || "#"}
            className="inline-flex items-center gap-1 rounded-md px-4 py-2.5 text-sm font-semibold"
            style={{
              backgroundColor:
                block.buttonType === "solid" ? block.buttonColor : "transparent",
              color:
                block.buttonType === "solid" ? block.buttonTextColor : block.buttonColor,
            }}
          >
            {block.buttonText}
          </a>
        </div>
      );
    }
  }
}

export function ProgressBlockView({
  block,
  completedCount,
  totalCount,
}: {
  block: ProgressSidebarBlock;
  completedCount: number;
  totalCount: number;
}) {
  if (!block.visible) return null;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return (
    <div
      className="space-y-2 rounded-xl border border-[#E4E4E4] p-4"
      style={{ backgroundColor: block.background }}
    >
      <p className="text-sm" style={{ color: block.textColor }}>
        {completedCount} of {totalCount} {block.text}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: block.barColor }}
        />
      </div>
      {block.promoImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={block.promoImageUrl}
          alt=""
          className="w-full rounded-lg object-cover"
        />
      )}
    </div>
  );
}

export function InstructorBlockView({ block }: { block: InstructorSidebarBlock }) {
  if (!block.visible) return null;
  const text = readableTextOn(block.background);
  return (
    <div
      className="space-y-2 rounded-xl border border-[#E4E4E4] p-4"
      style={{ backgroundColor: block.background }}
    >
      {block.heading && (
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: text.muted }}
        >
          {block.heading}
        </p>
      )}
      <div className="flex items-center gap-3">
        {block.headshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={block.headshotUrl}
            alt={block.name}
            className="h-12 w-12 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/10 text-sm font-semibold">
            {block.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold" style={{ color: text.strong }}>
            {block.name}
          </p>
          <p className="text-xs" style={{ color: text.muted }}>
            {block.title}
          </p>
        </div>
      </div>
      {block.bio && (
        <p className="text-xs leading-relaxed" style={{ color: text.strong }}>
          {block.bio}
        </p>
      )}
    </div>
  );
}
