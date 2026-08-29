"use client";

import { useState } from "react";
import { Play } from "lucide-react";
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
  const [activeIndex, setActiveIndex] = useState(0);
  if (items.length === 0) return null;

  const active = items[Math.min(activeIndex, items.length - 1)];
  const others = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => index !== activeIndex);

  return (
    <section className="community-about-media-block" aria-label="Community media">
      <FeaturedMedia item={active} />
      {others.length > 0 && (
        <div className="community-about-media-strip">
          {others.map(({ item, index }) => (
            <button
              key={item.id}
              type="button"
              className="community-about-media-thumb"
              onClick={() => setActiveIndex(index)}
              aria-label={item.title?.trim() ? `Show ${item.title}` : "Show media item"}
            >
              <ThumbMedia item={item} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function FeaturedMedia({ item }: { item: CommunityAboutMediaItem }) {
  const title = item.title?.trim() || "";
  const label = item.label?.trim() || "";
  const hasText = Boolean(title || label);
  const mediaImage = item.type === "image" ? item.url : item.thumbnailUrl || null;
  const isEmpty = !mediaImage;
  const isVideo = item.type === "video";

  const card = (
    <article
      className={`community-about-media-featured-wrap ${isEmpty ? "community-about-media-empty" : ""}`}
    >
      {mediaImage && (
        <div className="community-about-media-image" style={{ backgroundImage: `url(${mediaImage})` }} />
      )}
      {isVideo && (
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
