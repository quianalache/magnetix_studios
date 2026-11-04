import type { ReactNode } from "react";
import { AudioLines, Code2, Share2 } from "lucide-react";
import { BlockEmptyState, BlockShell } from "@/components/pages-funnels/data-metrics/block-shell";
import { SOCIAL_ICONS } from "@/components/pages-funnels/puck/social-icons";
import { resolveNavColor } from "@/lib/pages-funnels/navigation";
import {
  EMBED_MAX_WIDTH_PX,
  EMBED_PROVIDERS,
  EMBED_SANDBOX,
  embedFrameSize,
  resolveEmbedUrl,
  type EmbedBlockProps,
} from "@/lib/pages-funnels/embed";
import { safeAudioSrc } from "@/lib/pages-funnels/audio";
import {
  normalizeSocialItems,
  normalizeSocialStyle,
  socialAccessibleName,
  socialHref,
  SOCIAL_NETWORK_LABEL,
} from "@/lib/pages-funnels/social-links";
import { hasText, plainText } from "@/lib/pages-funnels/pricing";
import { InlinePlaceholderStyle, placeholderProps } from "@/components/pages-funnels/puck/inline-placeholder";
import type { StyleConfig } from "@/types/pages-funnels-puck";

type BrandKit = readonly { id: string; hex: string }[] | undefined;

const JUSTIFY = { left: "justify-start", center: "justify-center", right: "justify-end" } as const;
const SELF = { left: "mr-auto", center: "mx-auto", right: "ml-auto" } as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

// ── Embed ────────────────────────────────────────────────────────────────

/**
 * Embed block (Wave 3). Renders ONLY allow-listed providers (see
 * lib/pages-funnels/embed.ts), in a sandboxed iframe whose origin is always
 * the provider's. In the builder the frame is inert (pointer-events off) so
 * clicking selects the block instead of driving the player, and nothing
 * autoplays; Preview and the live page get the real, interactive embed.
 */
export function EmbedRender({
  id,
  style,
  editing = false,
  ...props
}: Partial<EmbedBlockProps> & { id: string; style?: StyleConfig; editing?: boolean }) {
  const resolved = resolveEmbedUrl(props.url);
  const maxWidth = props.maxWidth === "narrow" || props.maxWidth === "medium" ? EMBED_MAX_WIDTH_PX[props.maxWidth] : undefined;
  const align = props.alignment === "left" || props.alignment === "right" ? props.alignment : "center";
  if (!resolved) {
    if (!editing) return null;
    return (
      <BlockShell id={id} style={style}>
        <BlockEmptyState>
          <Code2 className="h-5 w-5" aria-hidden />
          {props.url?.trim() ? (
            <>
              <span className="font-medium">This link can&apos;t be embedded.</span>
              <span>Paste a link from YouTube, Vimeo, Loom, Wistia, Spotify, Apple Podcasts, SoundCloud, Google Maps, Calendly, Typeform or Tally.</span>
            </>
          ) : (
            <>
              <span className="font-medium">Embed</span>
              <span>Paste a link in Settings — YouTube, Loom, Spotify, Google Maps, Calendly and more.</span>
            </>
          )}
        </BlockEmptyState>
      </BlockShell>
    );
  }
  const provider = EMBED_PROVIDERS[resolved.provider];
  const size = embedFrameSize(
    { sizing: props.sizing ?? "auto", aspectRatio: props.aspectRatio ?? "16:9", heightPx: props.heightPx ?? 400 },
    resolved.provider
  );
  const title = props.title?.trim() || `${provider.label} embed`;
  return (
    <BlockShell id={id} style={style}>
      <div
        data-embed-provider={resolved.provider}
        className={`relative w-full overflow-hidden rounded-xl ${SELF[align]}`}
        style={{ maxWidth, aspectRatio: size.aspectRatio, height: size.height }}
      >
        <iframe
          src={resolved.src}
          title={title}
          sandbox={EMBED_SANDBOX}
          allow={provider.allow}
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          className="absolute inset-0 h-full w-full border-0"
          style={editing ? { pointerEvents: "none" } : undefined}
          tabIndex={editing ? -1 : undefined}
        />
        {editing ? (
          <span className="bg-card/90 text-muted-foreground text-caption pointer-events-none absolute top-2 left-2 rounded-md px-2 py-0.5 shadow-sm">
            {provider.label} · interactive in Preview
          </span>
        ) : null}
      </div>
    </BlockShell>
  );
}

// ── Audio ────────────────────────────────────────────────────────────────

/**
 * Audio block (Wave 3): the browser's native, keyboard-accessible audio
 * controls; never autoplays. Title and caption are page-owned text, edited
 * on the canvas.
 */
export function AudioRender({
  id,
  style,
  editing = false,
  source,
  title,
  caption,
}: {
  id: string;
  style?: StyleConfig;
  editing?: boolean;
  source?: { src?: string } | null;
  title?: ReactNode;
  caption?: ReactNode;
}) {
  const safe = safeAudioSrc(source?.src);
  if (!safe && !editing) return null;
  const titleText = plainText(title).trim();
  return (
    <BlockShell id={id} style={style}>
      <InlinePlaceholderStyle editing={editing} />
      <figure className="border-border bg-card space-y-3 rounded-xl border p-4" data-audio-block="">
        {(editing || hasText(title)) && (
          <figcaption className="text-body font-semibold" {...placeholderProps(editing, "Audio title (optional)")}>
            {title}
          </figcaption>
        )}
        {safe ? (
          <audio
            controls
            preload="metadata"
            src={safe}
            className="w-full"
            aria-label={titleText || "Audio"}
            style={editing ? { pointerEvents: "none" } : undefined}
          />
        ) : (
          <BlockEmptyState>
            <AudioLines className="h-5 w-5" aria-hidden />
            <span>Choose an audio file in Settings.</span>
          </BlockEmptyState>
        )}
        {(editing || hasText(caption)) && (
          <p className="text-muted-foreground text-body-sm" {...placeholderProps(editing, "Add a caption (optional)")}>
            {caption}
          </p>
        )}
      </figure>
    </BlockShell>
  );
}

// ── Social Links ─────────────────────────────────────────────────────────

/**
 * Social Links block (Wave 3): profile links with brand icons. Every link has
 * a text accessible name (never icon-only for assistive tech). Colors come
 * from the Brand / Custom color model; hover color is a scoped :hover rule.
 */
export function SocialLinksRender({
  id,
  style,
  editing = false,
  items: rawItems,
  socialStyle,
  brandKit,
}: {
  id: string;
  style?: StyleConfig;
  editing?: boolean;
  items?: unknown;
  socialStyle?: unknown;
  brandKit?: BrandKit;
}) {
  const s = normalizeSocialStyle(socialStyle);
  const items = normalizeSocialItems(rawItems).map((item) => ({ item, href: socialHref(item) }));
  const visible = editing ? items : items.filter((x) => x.href);
  if (visible.length === 0) {
    if (!editing) return null;
    return (
      <BlockShell id={id} style={style}>
        <BlockEmptyState>
          <Share2 className="h-5 w-5" aria-hidden />
          <span>Add your social profiles in Settings.</span>
        </BlockEmptyState>
      </BlockShell>
    );
  }
  const color = resolveNavColor(s.color, brandKit);
  const hover = resolveNavColor(s.hoverColor, brandKit);
  const safeId = /^[a-zA-Z_][\w-]*$/.test(id) ? id : null;
  const hoverCss = hover && HEX.test(hover) && safeId ? `#${safeId} [data-social-link]:hover,#${safeId} [data-social-link]:focus-visible{color:${hover}}` : null;
  const box = s.shape === "plain" ? 0 : Math.round(s.size * 1.9);
  return (
    <BlockShell id={id} style={style}>
      {hoverCss && <style dangerouslySetInnerHTML={{ __html: hoverCss }} />}
      <ul className={`flex flex-wrap items-center ${JUSTIFY[s.alignment]}`} style={{ gap: s.gap }} aria-label="Social links">
        {visible.map(({ item, href }) => {
          const Icon = SOCIAL_ICONS[item.network];
          const name = socialAccessibleName(item);
          const shapeClass = s.shape === "circle" ? "rounded-full border border-current/20" : s.shape === "rounded" ? "rounded-lg border border-current/20" : "";
          const content = (
            <>
              <Icon size={s.size} aria-hidden />
              <span className="sr-only">{name}</span>
            </>
          );
          const common = {
            "data-social-link": item.network,
            className: `inline-flex items-center justify-center transition-colors focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 ${shapeClass} ${color ? "" : "text-foreground"}`,
            style: { color: color ?? undefined, width: box || undefined, height: box || undefined },
            title: name,
          };
          return (
            <li key={item.id}>
              {href && !editing ? (
                <a href={href} target={item.network === "email" ? undefined : "_blank"} rel={item.network === "email" ? undefined : "noopener noreferrer"} {...common}>
                  {content}
                </a>
              ) : (
                <span {...common} aria-label={editing && !href ? `${SOCIAL_NETWORK_LABEL[item.network]} (no link yet)` : name} role="img" data-missing-link={!href || undefined} style={{ ...common.style, opacity: href ? 1 : 0.45 }}>
                  <Icon size={s.size} aria-hidden />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </BlockShell>
  );
}
