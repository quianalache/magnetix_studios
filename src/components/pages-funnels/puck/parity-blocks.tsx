"use client";

import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Circle,
  Heart,
  Shield,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import type { FeaturedOfferPayload } from "@/types/reading-blocks";
import type { PuckAlignment, StyleConfig } from "@/types/pages-funnels-puck";
import {
  resolveBaseStyleProps,
  resolveResponsiveCss,
} from "@/lib/pages-funnels/puck/style";
import { parseCountdownTarget } from "@/lib/pages-funnels/puck/countdown";

export interface GalleryImage {
  src: string;
  alt: string;
}
export interface ProofItem {
  quote: string;
  name: string;
  role: string;
  imageUrl: string;
  sourceLabel: string;
}
export interface LogoItem {
  src: string;
  alt: string;
}
export interface StatItem {
  value: string;
  label: string;
  supportingText: string;
}

const alignClass: Record<PuckAlignment, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};
const justifyClass: Record<PuckAlignment, string> = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
};

function Shell({
  id,
  style,
  className,
  children,
}: {
  id: string;
  style?: StyleConfig;
  className?: string;
  children: ReactNode;
}) {
  const css = resolveResponsiveCss(id, style);
  return (
    <div id={id} className={className} style={resolveBaseStyleProps(style)}>
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {children}
    </div>
  );
}

export function IconRender({
  id,
  name,
  size,
  alignment,
  color,
  background,
  style,
}: {
  id: string;
  name: string;
  size: number;
  alignment: PuckAlignment;
  color: string;
  background: string;
  style?: StyleConfig;
}) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? Star;
  return (
    <Shell id={id} style={style} className={`flex ${justifyClass[alignment]}`}>
      <span
        className="border-border inline-flex items-center justify-center rounded-lg border px-3 py-2"
        style={{
          color: color || undefined,
          backgroundColor: background || undefined,
        }}
      >
        <Icon
          aria-label={name || "Star"}
          role="img"
          size={size}
          strokeWidth={1.8}
        />
      </span>
    </Shell>
  );
}

export function TabsRender({
  id,
  items,
  activeIndex,
  alignment,
  style,
}: {
  id: string;
  items: { label: string; content: string }[];
  activeIndex: number;
  alignment: PuckAlignment;
  style?: StyleConfig;
}) {
  const [active, setActive] = useState(
    Math.max(0, Math.min(activeIndex ?? 0, Math.max(0, items.length - 1)))
  );
  const base = useId();
  return (
    <Shell id={id} style={style} className="space-y-4">
      <div
        role="tablist"
        aria-label="Content tabs"
        className={`flex flex-wrap gap-2 ${justifyClass[alignment]}`}
      >
        {items.map((item, index) => (
          <button
            key={`${base}-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls={`${base}-panel-${index}`}
            id={`${base}-tab-${index}`}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index + 1) % items.length);
              }
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index - 1 + items.length) % items.length);
              }
            }}
            className="border-border focus-visible:ring-ring data-[active=true]:bg-primary data-[active=true]:text-primary-foreground rounded-md border px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
            data-active={active === index}
          >
            {item.label || `Tab ${index + 1}`}
          </button>
        ))}
      </div>
      {items.map(
        (item, index) =>
          active === index && (
            <div
              key={`${base}-content-${index}`}
              role="tabpanel"
              tabIndex={0}
              id={`${base}-panel-${index}`}
              aria-labelledby={`${base}-tab-${index}`}
              className="border-border text-body-sm rounded-lg border p-4"
            >
              {item.content}
            </div>
          )
      )}
    </Shell>
  );
}

function ImageFigure({
  image,
  fit,
  aspect,
}: {
  image: GalleryImage;
  fit: "cover" | "contain";
  aspect: "square" | "landscape" | "natural";
}) {
  const aspectClass =
    aspect === "square"
      ? "aspect-square"
      : aspect === "landscape"
        ? "aspect-[4/3]"
        : "h-auto";
  return image.src ? (
    <img
      src={image.src}
      alt={image.alt}
      className={`w-full rounded-lg ${aspectClass} ${fit === "contain" ? "object-contain" : "object-cover"}`}
    />
  ) : (
    <div className="bg-muted text-muted-foreground text-caption flex aspect-[4/3] items-center justify-center rounded-lg">
      No image set
    </div>
  );
}

export function GalleryRender({
  id,
  images,
  columns,
  gap,
  fit,
  aspect,
  alignment,
  style,
  editing = false,
}: {
  id: string;
  images: GalleryImage[];
  columns: 2 | 3 | 4;
  gap: number;
  fit: "cover" | "contain";
  aspect: "square" | "landscape" | "natural";
  alignment: PuckAlignment;
  style?: StyleConfig;
  editing?: boolean;
}) {
  if (!images.length && !editing) return null;
  return (
    <Shell id={id} style={style} className={alignClass[alignment]}>
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}
        style={{ gap }}
      >
        {images.length ? (
          images.map((image, index) => (
            <ImageFigure
              key={`${image.src}-${index}`}
              image={image}
              fit={fit}
              aspect={aspect}
            />
          ))
        ) : (
          <div className="border-border bg-muted/30 text-muted-foreground text-body-sm flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 text-center">
            {editing ? "Add images to this gallery" : ""}
          </div>
        )}
      </div>
    </Shell>
  );
}

export function SliderRender({
  id,
  images,
  autoplay,
  interval,
  showControls,
  showDots,
  style,
  editing = false,
}: {
  id: string;
  images: GalleryImage[];
  autoplay: boolean;
  interval: number;
  showControls: boolean;
  showDots: boolean;
  style?: StyleConfig;
  editing?: boolean;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!autoplay || images.length < 2) return;
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % images.length),
      Math.max(2000, interval)
    );
    return () => window.clearInterval(timer);
  }, [autoplay, interval, images.length]);
  const current = images[index];
  if (!current && !editing) return null;
  if (!current)
    return (
      <Shell id={id} style={style}>
        <div className="border-border bg-muted/30 text-muted-foreground text-body-sm flex min-h-48 items-center justify-center rounded-lg border border-dashed px-4 text-center">
          {editing ? "Add images to this slider" : ""}
        </div>
      </Shell>
    );
  return (
    <Shell id={id} style={style} className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
        <ImageFigure image={current} fit="cover" aspect="landscape" />
        {showControls && images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={() =>
                setIndex((index - 1 + images.length) % images.length)
              }
              className="bg-background/90 border-border focus-visible:ring-ring absolute top-1/2 left-3 -translate-y-1/2 rounded-full border px-3 py-2 text-lg focus-visible:ring-2 focus-visible:outline-none"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={() => setIndex((index + 1) % images.length)}
              className="bg-background/90 border-border focus-visible:ring-ring absolute top-1/2 right-3 -translate-y-1/2 rounded-full border px-3 py-2 text-lg focus-visible:ring-2 focus-visible:outline-none"
            >
              ›
            </button>
          </>
        )}
      </div>
      {showDots && images.length > 1 && (
        <div
          className="flex justify-center gap-2"
          role="tablist"
          aria-label="Slider images"
        >
          {images.map((image, dot) => (
            <button
              key={`${image.src}-${dot}`}
              type="button"
              role="tab"
              aria-label={`Show image ${dot + 1}`}
              aria-selected={index === dot}
              onClick={() => setIndex(dot)}
              className="border-border data-[active=true]:bg-primary h-2.5 w-2.5 rounded-full border"
              data-active={index === dot}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}

export function ProofRender({
  id,
  items,
  alignment,
  style,
  editing = false,
}: {
  id: string;
  items: ProofItem[];
  alignment: PuckAlignment;
  style?: StyleConfig;
  editing?: boolean;
}) {
  const hasContent = items.some(
    (item) =>
      item.quote || item.name || item.role || item.imageUrl || item.sourceLabel
  );
  if (!hasContent && !editing) return null;
  if (!hasContent)
    return (
      <Shell id={id} style={style}>
        <div className="border-border bg-muted/30 text-muted-foreground text-body-sm flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 text-center">
          {editing ? "Add testimonials to this proof block" : ""}
        </div>
      </Shell>
    );
  return (
    <Shell id={id} style={style} className="grid gap-4 md:grid-cols-2">
      {items.map((item, index) => (
        <figure
          key={`${item.name}-${index}`}
          className={`border-border rounded-lg border p-5 ${alignClass[alignment]}`}
        >
          <blockquote className="text-body italic">“{item.quote}”</blockquote>
          <figcaption className="mt-4 flex items-center gap-3">
            <>
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              )}
            </>
            <span>
              <strong className="text-body-sm block">
                {item.name || "Name"}
              </strong>
              <span className="text-muted-foreground text-caption">
                {[item.role, item.sourceLabel].filter(Boolean).join(" · ")}
              </span>
            </span>
          </figcaption>
        </figure>
      ))}
    </Shell>
  );
}

export function LogoStripRender({
  id,
  logos,
  grayscale,
  gap,
  style,
  editing = false,
}: {
  id: string;
  logos: LogoItem[];
  grayscale: boolean;
  gap: number;
  style?: StyleConfig;
  editing?: boolean;
}) {
  if (!logos.some((logo) => logo.src) && !editing) return null;
  if (!logos.some((logo) => logo.src))
    return (
      <Shell id={id} style={style}>
        <div className="border-border bg-muted/30 text-muted-foreground text-body-sm flex min-h-24 items-center justify-center rounded-lg border border-dashed px-4 text-center">
          {editing ? "Add logos to this strip" : ""}
        </div>
      </Shell>
    );
  return (
    <Shell id={id} style={style}>
      <div
        className="flex min-h-16 flex-wrap items-center justify-center"
        style={{ gap }}
      >
        {logos.map((logo, index) =>
          logo.src ? (
            <img
              key={`${logo.src}-${index}`}
              src={logo.src}
              alt={logo.alt}
              className={`max-h-12 max-w-40 object-contain ${grayscale ? "grayscale" : ""}`}
            />
          ) : null
        )}
      </div>
    </Shell>
  );
}

export function StatsRender({
  id,
  items,
  columns,
  alignment,
  style,
  editing = false,
}: {
  id: string;
  items: StatItem[];
  columns: 2 | 3 | 4;
  alignment: PuckAlignment;
  style?: StyleConfig;
  editing?: boolean;
}) {
  const hasContent = items.some(
    (item) => item.value || item.label || item.supportingText
  );
  if (!hasContent && !editing) return null;
  if (!hasContent)
    return (
      <Shell id={id} style={style}>
        <div className="border-border bg-muted/30 text-muted-foreground text-body-sm flex min-h-24 items-center justify-center rounded-lg border border-dashed px-4 text-center">
          {editing ? "Add stats to this block" : ""}
        </div>
      </Shell>
    );
  return (
    <Shell
      id={id}
      style={style}
      className={`grid grid-cols-1 gap-6 sm:grid-cols-2 ${columns === 3 ? "lg:grid-cols-3" : columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}
    >
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={`min-w-0 ${alignClass[alignment]}`}
        >
          <div className="text-title-lg font-semibold tracking-tight">
            {item.value || "—"}
          </div>
          <div className="text-body font-medium">{item.label}</div>
          {item.supportingText && (
            <p className="text-muted-foreground text-body-sm mt-1">
              {item.supportingText}
            </p>
          )}
        </div>
      ))}
    </Shell>
  );
}

export function CountdownRender({
  id,
  targetAt,
  timezone,
  showDays,
  showHours,
  showMinutes,
  showSeconds,
  expiredBehavior,
  expiredMessage,
  style,
  editing = false,
}: {
  id: string;
  targetAt: string;
  timezone: string;
  showDays: boolean;
  showHours: boolean;
  showMinutes: boolean;
  showSeconds: boolean;
  expiredBehavior: "zero" | "hide" | "message";
  expiredMessage: string;
  style?: StyleConfig;
  editing?: boolean;
}) {
  const targetMs = parseCountdownTarget(targetAt, timezone);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, targetMs - Date.now())
  );
  useEffect(() => {
    const tick = () =>
      setRemaining(
        Math.max(0, parseCountdownTarget(targetAt, timezone) - Date.now())
      );
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [targetAt, timezone]);
  if (!targetAt)
    return editing ? (
      <Shell id={id} style={style}>
        <div className="border-border bg-muted/30 text-muted-foreground text-body-sm flex min-h-24 items-center justify-center rounded-lg border border-dashed px-4 text-center">
          Set a date and time for this countdown
        </div>
      </Shell>
    ) : null;
  const units = [
    {
      key: "days",
      label: "Days",
      value: Math.floor(remaining / 86400000),
      show: showDays,
    },
    {
      key: "hours",
      label: "Hours",
      value: Math.floor(remaining / 3600000) % 24,
      show: showHours,
    },
    {
      key: "minutes",
      label: "Minutes",
      value: Math.floor(remaining / 60000) % 60,
      show: showMinutes,
    },
    {
      key: "seconds",
      label: "Seconds",
      value: Math.floor(remaining / 1000) % 60,
      show: showSeconds,
    },
  ].filter((unit) => unit.show);
  const expired = remaining <= 0;
  if (expired && expiredBehavior === "hide") return null;
  if (expired && expiredBehavior === "message")
    return (
      <Shell id={id} style={style} className="text-body-sm text-center">
        {expiredMessage || "This timer has ended."}
        <span className="sr-only">Timezone: {timezone}</span>
      </Shell>
    );
  return (
    <Shell id={id} style={style} className="text-center">
      <div className="flex flex-wrap justify-center gap-3" aria-live="polite">
        {units.map((unit) => (
          <div
            key={unit.key}
            className="border-border min-w-16 rounded-lg border px-3 py-2"
          >
            <div className="text-title-md font-semibold tabular-nums">
              {String(unit.value).padStart(2, "0")}
            </div>
            <div className="text-muted-foreground text-caption">
              {unit.label}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Target timezone: {timezone}</span>
    </Shell>
  );
}

export function OfferSummaryRender({
  id,
  offerId,
  alignment,
  ctaLabel,
  style,
  offer,
}: {
  id: string;
  offerId: string;
  alignment: PuckAlignment;
  ctaLabel: string;
  style?: StyleConfig;
  offer?: FeaturedOfferPayload | null;
}) {
  if (!offer || !offerId)
    return (
      <Shell
        id={id}
        style={style}
        className="border-border rounded-lg border p-5"
      >
        <p className="text-muted-foreground text-body-sm">
          {offerId
            ? "This Offer is unavailable or unpublished."
            : "Choose an Offer to show its authoritative summary."}
        </p>
      </Shell>
    );
  return (
    <Shell
      id={id}
      style={style}
      className={`border-border rounded-lg border p-6 ${alignClass[alignment]}`}
    >
      <h2 className="text-title-md font-semibold">{offer.title}</h2>
      {offer.summary && (
        <p className="text-muted-foreground text-body-sm mt-2">
          {offer.summary}
        </p>
      )}
      <div className="text-title-lg mt-4 font-semibold">{offer.priceLabel}</div>
      {offer.billingNote && (
        <p className="text-muted-foreground text-caption">
          {offer.billingNote}
        </p>
      )}
      {offer.grants.length > 0 && (
        <ul className="text-body-sm mt-4 list-inside list-disc">
          {offer.grants.map((grant) => (
            <li key={grant}>{grant}</li>
          ))}
        </ul>
      )}
      <a
        href={offer.href}
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-5 inline-flex rounded-full px-5 py-2.5 text-sm font-medium"
      >
        {ctaLabel || "GO TO OFFER"}
      </a>
    </Shell>
  );
}

const ICONS = { ArrowRight, Check, Circle, Heart, Shield, Sparkles, Star, Zap };
