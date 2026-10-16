import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseHex, tenantBrandStyle } from "@/lib/brand/tenant-brand";
import type { CourseTheme } from "@/types/course-theme";
import { TenantMark } from "@/components/public/public-shell";

/**
 * PublicCheckoutShell (Tenant / Public Surfaces, owner-approved 2026-10-16) —
 * the shared frame of the paid sales pages: Course Offers and Standalone
 * Course sales pages (and the theme editors' live previews, which render the
 * same views).
 *
 * The page's ONLY brand source is its own Course Theme: the theme's button
 * color becomes the surface accent (wash, CTA, chips), its fonts, header
 * colors, hero and background image are honored exactly as configured.
 * No "Powered by" on paid pages (owner decision).
 */

/** True for greys / near-black (HSL saturation under ~15%) — a wash tinted from them reads as dull grey. */
function isNeutralColor(hex: string | null | undefined): boolean {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return true;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return sat < 0.15;
}

export function CheckoutFrame({
  theme,
  businessName,
  children,
}: {
  theme: CourseTheme;
  businessName: string;
  children: ReactNode;
}) {
  const style = {
    ...tenantBrandStyle({ name: businessName, primary: theme.hero.buttonColor }),
    fontFamily: `"${theme.fonts.primary.family}", sans-serif`,
    "--font-secondary": `"${theme.fonts.secondary.family}", sans-serif`,
  } as CSSProperties;
  return (
    // A themed accent gets the soft tenant wash; the default near-black theme
    // (or any grey) gets the clean near-white canvas instead of a grey wash.
    <div
      className={cn("tenant-surface min-h-screen pb-24 md:pb-0", isNeutralColor(theme.hero.buttonColor) ? "public-plain" : "tenant-wash")}
      style={style}
      data-public-shell="checkout"
    >
      {theme.background.imageUrl && (
        <div
          className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${theme.background.imageUrl})`, opacity: theme.background.transparency / 100 }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/** Header: the business (monogram + name) in the theme's header colors, with the page's right-hand action. */
export function CheckoutHeader({
  theme,
  businessName,
  right,
}: {
  theme: CourseTheme;
  businessName: string;
  right?: ReactNode;
}) {
  return (
    <header className="public-line border-b" style={{ backgroundColor: theme.header.background }}>
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <TenantMark brand={{ name: businessName }} size={32} />
          <span className="truncate text-base font-semibold" style={{ fontFamily: "var(--font-secondary)", color: theme.header.iconColor }}>
            {businessName}
          </span>
        </span>
        {right}
      </div>
    </header>
  );
}

/** Small brand chip above the title ("Offer", a course category…). */
export function SalesChip({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="tenant-soft inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Real media when there is any, otherwise a neutral brand-tinted tile with an icon — never a letter placeholder. */
export function SalesMedia({ src, icon: Icon, className }: { src: string | null | undefined; icon: LucideIcon; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted media
    return <img src={src} alt="" className={cn("w-full object-cover", className)} />;
  }
  return (
    <div className={cn("public-media-fallback flex w-full items-center justify-center", className)} aria-hidden="true">
      <Icon className="size-7 opacity-80" />
    </div>
  );
}

/** A white section card in the sales column. */
export function SalesSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="tenant-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="public-ink text-base font-semibold">{title}</h2>
        {aside && <span className="public-faint text-xs">{aside}</span>}
      </div>
      <div className="public-line border-t">{children}</div>
    </section>
  );
}

/** The buy card: media, price, then the page's own sidebar blocks and CTA. */
export function BuyCard({
  media,
  title,
  price,
  priceNote,
  stats,
  secure,
  children,
}: {
  media: ReactNode;
  title: string;
  price: string;
  priceNote: string;
  stats?: ReactNode;
  /** Paid checkout: show the secure-checkout line. */
  secure: boolean;
  children: ReactNode;
}) {
  return (
    <aside className="tenant-card h-fit overflow-hidden md:sticky md:top-8" data-buy-card>
      {media}
      <div className="space-y-4 p-5">
        <h2 className="public-ink text-lg leading-snug font-semibold" style={{ fontFamily: "var(--font-secondary)" }}>
          {title}
        </h2>
        <div>
          <div className="public-ink text-3xl leading-none font-bold tracking-tight tabular-nums">{price}</div>
          <div className="public-faint mt-1 text-xs tracking-wide uppercase">{priceNote}</div>
        </div>
        {stats}
        {children}
        {secure && (
          <p className="public-faint flex items-center justify-center gap-1.5 text-xs">
            <Lock className="size-3.5" aria-hidden="true" />
            Secure checkout
          </p>
        )}
      </div>
    </aside>
  );
}

/** Phones only: price + the same purchase action, pinned to the bottom of the screen. */
export function StickyBuyBar({ price, priceNote, children }: { price: string; priceNote: string; children: ReactNode }) {
  return (
    <div
      className="public-line fixed inset-x-0 bottom-0 z-40 flex items-center gap-4 border-t bg-white px-4 pt-3 shadow-[0_-6px_20px_rgb(31_27_58/0.08)] md:hidden"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      data-sticky-buy-bar
    >
      <div className="min-w-0 shrink-0">
        <div className="public-ink text-lg leading-tight font-bold tabular-nums">{price}</div>
        <div className="public-faint text-xs">{priceNote}</div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
