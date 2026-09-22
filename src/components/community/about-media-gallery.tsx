"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { embedUrlFor } from "@/lib/community/video-embed";
import type { CommunityAboutMediaItem } from "@/types/community";

/**
 * About page media gallery — public display (2026-08-29 conversion-layout
 * redesign, Parts 2/5/6). Supersedes the previous pass's side-by-side
 * "support-row" thumbnail+text cards with the newly-approved mockup shape:
 * one 16:9 featured viewer, a compact 16:9 thumbnail strip underneath that
 * scrolls horizontally rather than growing the page, and clicking a
 * thumbnail swaps which item is shown large. `items` is the plain,
 * server-normalized `CommunityAboutMediaItem[]` — no Timestamp/class
 * instances, safe to pass straight from the Server Component page (same
 * class of Server→Client boundary rule documented on `AboutEditButton`,
 * just not a concern here since this shape has none of that).
 */
export function AboutMediaGallery({ items }: { items: CommunityAboutMediaItem[] }) {
  const orderedItems = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
    .map(({ item }) => item);
  const [activeId, setActiveId] = useState(orderedItems[0]?.id ?? "");
  if (orderedItems.length === 0) return null;

  const active = orderedItems.find((item) => item.id === activeId) ?? orderedItems[0];

  return (
    <section className="community-about-media-block" aria-label="Community media">
      <FeaturedMedia item={active} />
      {orderedItems.length > 0 && (
        <div className="community-about-media-strip">
          {orderedItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`community-about-media-thumb${item.id === active.id ? " community-about-media-thumb-active" : ""}`}
              onClick={() => setActiveId(item.id)}
              aria-label={mediaAriaLabel(item)}
              aria-pressed={item.id === active.id}
            >
              <ThumbMedia item={item} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function mediaAriaLabel(item: CommunityAboutMediaItem): string {
  const title = item.title?.trim();
  if (title) return `Show ${title}`;
  return item.type === "video" ? "Show YouTube video" : "Show image";
}

function FeaturedMedia({ item }: { item: CommunityAboutMediaItem }) {
  const title = item.title?.trim() || "";
  const label = item.label?.trim() || "";
  const hasText = Boolean(title || label);
  const mediaImage = item.type === "image" ? item.url : item.thumbnailUrl || null;
  const isEmpty = !mediaImage;
  const isVideo = item.type === "video";
  const embedUrl = isVideo ? embedUrlFor(item.provider, item.videoId) : null;

  const card = (
    <article
      className={`community-about-media-featured-wrap ${isEmpty ? "community-about-media-empty" : ""}`}
    >
      {embedUrl && (
        <iframe
          className="community-about-media-video"
          src={embedUrl}
          title={title || "YouTube video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      )}
      {!embedUrl && mediaImage && (
        <div className="community-about-media-image" style={{ backgroundImage: `url(${mediaImage})` }} />
      )}
      {isVideo && !embedUrl && (
        <div className="community-about-play community-about-play-lg">
          <Play size={22} fill="currentColor" />
        </div>
      )}
      {hasText && (
        <>
          <div className="community-about-media-shade" />
          <div className="community-about-media-copy">
            {label && <p>{label}</p>}
            <h3>{title}</h3>
          </div>
        </>
      )}
    </article>
  );

  return item.linkUrl ? (
    <a href={item.linkUrl} target="_blank" rel="noreferrer">
      {card}
    </a>
  ) : (
    card
  );
}

/** Thumbnail-strip tile — image or video fill only, no forced title text
 *  (Part 2/5: compact, 16:9, "do not force text beside every media item").
 *  A video gets a small play badge as its only affordance. */
function ThumbMedia({ item }: { item: CommunityAboutMediaItem }) {
  const mediaImage = item.type === "image" ? item.url : item.thumbnailUrl || null;
  const isEmpty = !mediaImage;
  return (
    <span className={`community-about-media-thumb-inner ${isEmpty ? "community-about-media-empty" : ""}`}>
      {mediaImage && (
        <span className="community-about-media-image" style={{ backgroundImage: `url(${mediaImage})` }} />
      )}
      {item.type === "video" && (
        <span className="community-about-play community-about-play-sm">
          <Play size={11} fill="currentColor" />
        </span>
      )}
    </span>
  );
}
