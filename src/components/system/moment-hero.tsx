import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * MomentHero — the approved Dashboard hero band (Visual Direction 2,
 * Section 4.1; reproduced to the proof in the 2026-10-14 parity pass):
 *
 *   [ LETTER-SPACED EYEBROW                          ✦               ]
 *   [ Serif headline, one line, italic violet accent   ◯══ planet  “brand line” ]
 *   [ quiet subtitle                                 ·      ✦        ]
 *
 * Lavender/blush wash, a 136px planet with a wide tilted gold ring, a small
 * lavender dot and two gold sparks, and an optional serif brand line at the
 * far right (wide screens). Decoration is aria-hidden and clipped by the
 * card, so it can never escape into the page. The art shrinks on tablets and
 * is dropped on phones (the approved mobile hero is a plain greeting strip).
 * Approved moment pages only.
 */
export function MomentHero({
  eyebrow,
  title,
  description,
  quote,
  className,
}: {
  eyebrow?: ReactNode;
  /** Rendered as an h2 in the display serif — the page's h1 is the PageHeader. */
  title: ReactNode;
  description?: ReactNode;
  /** Short serif brand line at the right edge (≥1280px). */
  quote?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "mx-hero-wash relative isolate overflow-hidden rounded-card border px-5 py-5 sm:px-8 sm:py-7 lg:min-h-[11.25rem] lg:py-[1.875rem]",
        className,
      )}
    >
      <HeroPlanet withQuote={!!quote} />
      {quote ? (
        <p
          aria-hidden="true"
          className="mx-hero-quote pointer-events-none absolute top-[3.25rem] right-8 hidden w-40 font-display text-base leading-[1.35] xl:block"
        >
          {quote}
        </p>
      ) : null}
      <div className="relative z-10 max-w-[35rem] sm:pr-44 lg:pr-72 xl:pr-0">
        {eyebrow ? (
          <p className="text-micro font-medium tracking-[0.24em] text-ink-secondary uppercase">{eyebrow}</p>
        ) : null}
        <h2 className="mt-2 font-display text-[1.75rem] leading-[1.05] font-normal tracking-tight text-foreground sm:text-display-md lg:text-display-lg xl:text-display-xl">
          {title}
        </h2>
        {description ? <p className="mt-2.5 text-body-sm text-muted-foreground sm:text-sm">{description}</p> : null}
      </div>
    </section>
  );
}

/** The approved planet composition — positions copied from the Section 4.1 proof. */
function HeroPlanet({ withQuote }: { withQuote: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-motif="planet"
      className={cn(
        "pointer-events-none absolute top-0 h-[11.25rem] w-[460px] max-sm:hidden",
        // sm–lg: smaller, tucked to the right. xl: full size, beside the brand line.
        "-right-[96px] origin-top-right scale-[0.66] lg:-right-[100px] lg:scale-[0.84]",
        withQuote ? "xl:right-0 xl:scale-100" : "xl:-right-[110px] xl:scale-100",
      )}
    >
      <span className="mx-hero-planet absolute top-[20px] left-[74px] size-[136px] rounded-full" />
      <span className="mx-hero-planet-ring absolute top-[66px] left-[17px] h-[56px] w-[250px] -rotate-[16deg] rounded-[50%]" />
      <span className="absolute top-[92px] left-[40px] size-[10px] rounded-full bg-violet-ds-300" />
      <Spark className="absolute top-[26px] left-[242px] size-[22px]" />
      <Spark className="absolute top-[130px] left-[24px] size-4" />
    </div>
  );
}

function Spark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <path
        className="fill-gold-300"
        d="M12 2C12.6 8.5 15.5 11.4 22 12 15.5 12.6 12.6 15.5 12 22 11.4 15.5 8.5 12.6 2 12 8.5 11.4 11.4 8.5 12 2Z"
      />
    </svg>
  );
}
