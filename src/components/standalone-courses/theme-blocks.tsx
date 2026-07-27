import type { CSSProperties } from "react";
import { sanitizeLessonHtml } from "@/lib/community/lesson-html";
import { embedUrlFor } from "@/lib/community/video-embed";
import type {
  CourseBlock,
  ProgressSidebarBlock,
  InstructorSidebarBlock,
  ButtonAlign,
} from "@/types/course-theme";
import type { StandaloneCourseInstructor } from "@/types/standalone-courses";

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
 * Fallback text colors for Instructor blocks saved before per-field colors
 * (Heading/Name/Title/Bio) existed — computed from the background so old
 * blocks stay legible instead of defaulting to a fixed gray that only
 * works on light backgrounds.
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

/**
 * A block's own `color`/`textColor` style only reaches the wrapping div —
 * Tailwind Typography's `prose` classes then set their own color on every
 * child element (p, li, strong, a, …), silently overriding the inherited
 * value. Typography reads those colors from `--tw-prose-*` CSS custom
 * properties, so setting them here (in addition to `color`, for the
 * un-prose-scoped text directly on this element) is what actually makes a
 * configured text color visible.
 */
function proseColorStyle(textColor: string): CSSProperties {
  return {
    color: textColor,
    ["--tw-prose-body" as string]: textColor,
    ["--tw-prose-headings" as string]: textColor,
    ["--tw-prose-bold" as string]: textColor,
    ["--tw-prose-links" as string]: textColor,
    ["--tw-prose-bullets" as string]: textColor,
    ["--tw-prose-counters" as string]: textColor,
    ["--tw-prose-quotes" as string]: textColor,
  } as CSSProperties;
}

/**
 * Regular + hover colors for a themed button, expressed as the CSS custom
 * properties the shared `.theme-btn` class (see `globals.css`) reads —
 * that's what makes the hover swap work with zero client-side JS.
 */
export function themeBtnStyle(opts: {
  fill: string;
  fillHover: string;
  border: string;
  borderHover: string;
  text: string;
  textHover: string;
}): CSSProperties {
  return {
    ["--btn-fill" as string]: opts.fill,
    ["--btn-fill-hover" as string]: opts.fillHover,
    ["--btn-border" as string]: opts.border,
    ["--btn-border-hover" as string]: opts.borderHover,
    ["--btn-text" as string]: opts.text,
    ["--btn-text-hover" as string]: opts.textHover,
  } as CSSProperties;
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
          style={{ backgroundColor: block.background, ...proseColorStyle(block.textColor) }}
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
              style={proseColorStyle(block.bodyTextColor ?? "#3a3a44")}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          {block.buttonVisible && block.buttonText && (
            <div className={`flex ${alignClass(block.buttonAlign)}`}>
              <a
                href={block.linkUrl || "#"}
                className="theme-btn inline-flex items-center gap-1 rounded-md border px-4 py-2 text-sm font-semibold"
                style={themeBtnStyle(
                  block.buttonType === "solid"
                    ? {
                        fill: block.buttonColor,
                        fillHover: block.buttonColorHover ?? block.buttonColor,
                        border: block.buttonBorderColor ?? block.buttonColor,
                        borderHover: block.buttonBorderColorHover ?? block.buttonColor,
                        text: block.buttonTextColor,
                        textHover: block.buttonTextColorHover ?? block.buttonTextColor,
                      }
                    : {
                        fill: "transparent",
                        fillHover: "transparent",
                        border: "transparent",
                        borderHover: "transparent",
                        text: block.buttonColor,
                        textHover: block.buttonColorHover ?? block.buttonColor,
                      },
                )}
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
            className="theme-btn inline-flex w-full items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm font-semibold"
            style={themeBtnStyle({
              fill: block.buttonColor,
              fillHover: block.buttonColorHover ?? block.buttonColor,
              border: block.buttonBorderColor ?? block.buttonColor,
              borderHover: block.buttonBorderColorHover ?? block.buttonColor,
              text: block.buttonTextColor,
              textHover: block.buttonTextColorHover ?? block.buttonTextColor,
            })}
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
            className="theme-btn inline-flex items-center gap-1 rounded-md border px-4 py-2.5 text-sm font-semibold"
            style={themeBtnStyle(
              block.buttonType === "solid"
                ? {
                    fill: block.buttonColor,
                    fillHover: block.buttonColorHover ?? block.buttonColor,
                    border: block.buttonBorderColor ?? block.buttonColor,
                    borderHover: block.buttonBorderColorHover ?? block.buttonColor,
                    text: block.buttonTextColor,
                    textHover: block.buttonTextColorHover ?? block.buttonTextColor,
                  }
                : {
                    fill: "transparent",
                    fillHover: "transparent",
                    border: "transparent",
                    borderHover: "transparent",
                    text: block.buttonColor,
                    textHover: block.buttonColorHover ?? block.buttonColor,
                  },
            )}
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

/**
 * Precedence between the course-level Instructor profile (Settings tab —
 * `StandaloneCourse.instructor`) and this block's own stored fields (which
 * may have been authored directly, or carried in from an applied Theme
 * Template — templates are copy-on-apply, so there's no live reference to
 * check, just whatever ended up in the block): when `syncFromProfile` is on
 * AND the course profile actually has a name filled in, the course-level
 * profile wins. Otherwise (syncing is off, or the course profile is blank —
 * e.g. a template shipped its own complete instructor persona) the block's
 * own fields are used as-is.
 */
function resolveInstructor(
  block: InstructorSidebarBlock,
  instructor: StandaloneCourseInstructor,
): Pick<InstructorSidebarBlock, "heading" | "name" | "title" | "bio" | "headshotUrl"> {
  const useProfile = block.syncFromProfile && instructor.name.trim() !== "";
  return useProfile
    ? {
        heading: instructor.heading,
        name: instructor.name,
        title: instructor.title,
        bio: instructor.bio,
        headshotUrl: instructor.headshotUrl,
      }
    : {
        heading: block.heading,
        name: block.name,
        title: block.title,
        bio: block.bio,
        headshotUrl: block.headshotUrl,
      };
}

export function InstructorBlockView({
  block,
  instructor,
}: {
  block: InstructorSidebarBlock;
  instructor: StandaloneCourseInstructor;
}) {
  if (!block.visible) return null;
  // Fallback for blocks saved before per-field colors existed.
  const fallback = readableTextOn(block.background);
  const headingColor = block.headingColor ?? fallback.muted;
  const nameColor = block.nameColor ?? fallback.strong;
  const titleColor = block.titleColor ?? fallback.muted;
  const bioColor = block.bioColor ?? fallback.strong;
  const headshotVisible = block.headshotVisible ?? true;
  const resolved = resolveInstructor(block, instructor);
  return (
    <div
      className="space-y-2 rounded-xl border border-[#E4E4E4] p-4"
      style={{ backgroundColor: block.background }}
    >
      {resolved.heading && (
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: headingColor }}
        >
          {resolved.heading}
        </p>
      )}
      <div className="flex items-center gap-3">
        {headshotVisible &&
          (resolved.headshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolved.headshotUrl}
              alt={resolved.name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-black/10 text-sm font-semibold">
              {resolved.name.charAt(0).toUpperCase()}
            </div>
          ))}
        <div>
          <p className="text-sm font-semibold" style={{ color: nameColor }}>
            {resolved.name}
          </p>
          <p className="text-xs" style={{ color: titleColor }}>
            {resolved.title}
          </p>
        </div>
      </div>
      {resolved.bio && (
        <p className="text-xs leading-relaxed" style={{ color: bioColor }}>
          {resolved.bio}
        </p>
      )}
    </div>
  );
}
