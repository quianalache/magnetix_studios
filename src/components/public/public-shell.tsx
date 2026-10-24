import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CUSTOM_BRAND } from "@/config/landing";
import { LogoMark } from "@/components/brand/logo-mark";
import { PoweredByMagnetix } from "@/components/brand/powered-by-magnetix";
import { tenantBrandStyle, type TenantBrand } from "@/lib/brand/tenant-brand";

/**
 * Public shells (Tenant / Public Surfaces, Visual Direction 2, owner-approved
 * 2026-10-16). Every page a lead, client, member or buyer sees without the CRM
 * is one of two variants of the same `.tenant-surface`:
 *
 *   tenant   — a business's page. Identity and accent come ONLY from that
 *              page family's own existing brand source (portal branding,
 *              booking, offer/course theme, community group…). Absent values
 *              fall back to a clean neutral surface; nothing is invented and
 *              there is no workspace-wide brand.
 *   magnetix — a Magnetix-owned page (staff / MyMagnetix sign-in, resets,
 *              platform errors): the Magnetix preset + cloud wash, no
 *              "Powered by" (it is Magnetix).
 */

export type PublicVariant =
  | { kind: "magnetix" }
  | { kind: "tenant"; brand: TenantBrand };

/** Root props for a public page: the surface classes and the tenant's brand variables. */
export function publicSurfaceProps(variant: PublicVariant, className?: string) {
  return variant.kind === "magnetix"
    ? { className: cn("tenant-surface public-magnetix tenant-wash", className) }
    : { className: cn("tenant-surface tenant-wash", className), style: tenantBrandStyle(variant.brand) };
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("") || "?"
  ).toUpperCase();
}

/** Business identity: its logo when the page's brand source has one, otherwise a monogram tile — plus the name. */
export function TenantIdentity({ brand, size = 32, showName = true, className }: { brand: TenantBrand; size?: number; showName?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <TenantMark brand={brand} size={size} />
      {showName && <span className="public-ink truncate text-base font-semibold">{brand.name}</span>}
    </span>
  );
}

export function TenantMark({ brand, size = 32 }: { brand: TenantBrand; size?: number }) {
  return (
    <span
      className="tenant-mark inline-flex shrink-0 items-center justify-center overflow-hidden font-bold"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.round(size * 0.36) }}
      aria-hidden={brand.logoUrl ? undefined : true}
    >
      {brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted logo URL
        <img src={brand.logoUrl} alt={brand.name} className="h-full w-full bg-white object-cover" />
      ) : (
        initials(brand.name)
      )}
    </span>
  );
}

/** The platform's own mark: the configured logo (Magnetix's magnet), else the template LogoMark. */
export function PlatformMark({ size = 28, idSuffix = "-public" }: { size?: number; idSuffix?: string }) {
  return CUSTOM_BRAND.logoPath ? (
    // eslint-disable-next-line @next/next/no-img-element -- small static asset in /public
    <img src={CUSTOM_BRAND.logoPath} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
  ) : (
    <LogoMark size={size} idSuffix={idSuffix} />
  );
}

export function MagnetixIdentity({ size = 28 }: { size?: number }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5">
      <PlatformMark size={size} />
      <span className="public-ink text-base font-semibold">{CUSTOM_BRAND.name}</span>
    </Link>
  );
}

function Identity({ variant }: { variant: PublicVariant }) {
  return variant.kind === "magnetix" ? <MagnetixIdentity /> : <TenantIdentity brand={variant.brand} />;
}

function Footer({ variant, poweredBy }: { variant: PublicVariant; poweredBy: boolean }) {
  if (variant.kind === "tenant") return poweredBy ? <PoweredByMagnetix className="public-faint" /> : null;
  return (
    <p className="public-faint text-center text-xs">
      {CUSTOM_BRAND.name} ·{" "}
      <Link href="/privacy" className="hover:underline">
        Privacy
      </Link>{" "}
      ·{" "}
      <Link href="/terms" className="hover:underline">
        Terms
      </Link>
    </p>
  );
}

/**
 * PublicAuthShell — every sign-in, sign-up and reset page. The existing form
 * component goes in `children` unchanged (its auth logic is untouched).
 * `card={false}` is for a form that already draws its own card.
 */
export function PublicAuthShell({
  variant,
  title,
  description,
  notice,
  footerNote,
  poweredBy = false,
  card = true,
  headerAside,
  children,
}: {
  variant: PublicVariant;
  title?: ReactNode;
  description?: ReactNode;
  /** An error/info message shown above the form. */
  notice?: ReactNode;
  /** A line under the form, inside the card (e.g. "Need help? email"). */
  footerNote?: ReactNode;
  poweredBy?: boolean;
  card?: boolean;
  headerAside?: ReactNode;
  children: ReactNode;
}) {
  const surface = publicSurfaceProps(variant, "flex min-h-dvh flex-col px-4 py-5 sm:px-8 sm:py-7");
  return (
    <div {...surface} data-public-shell="auth" data-public-variant={variant.kind}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <Identity variant={variant} />
        {headerAside}
      </header>
      <main className="flex flex-1 items-center justify-center py-8">
        <div className={cn("w-full max-w-[440px]", card && "tenant-card p-6 sm:p-9")}>
          {variant.kind === "tenant" && card && (
            <div className="mb-4 flex justify-center">
              <TenantMark brand={variant.brand} size={52} />
            </div>
          )}
          {(title || description) && (
            <div className="mb-6 text-center">
              {title && (
                // The serif title is the sign-in's one personality moment (both variants).
                <h1 className="public-ink text-display-md leading-tight text-balance" style={{ fontFamily: "var(--font-dm-serif-display), Georgia, serif", fontWeight: 400 }}>
                  {title}
                </h1>
              )}
              {description && <p className="public-body mx-auto mt-2.5 max-w-sm text-sm leading-relaxed">{description}</p>}
            </div>
          )}
          {notice}
          {children}
          {footerNote && <div className="public-faint mt-5 text-center text-xs leading-relaxed">{footerNote}</div>}
        </div>
      </main>
      <Footer variant={variant} poweredBy={poweredBy} />
    </div>
  );
}

export type PublicStateTone = "warning" | "error" | "success" | "brand";

/**
 * PublicStateShell — one state card for invalid / expired / revoked links,
 * not found, payment pending or failed, unsubscribe results and replay errors.
 * Icon chip, plain title, one sentence, at most one action.
 */
export function PublicStateShell({
  variant,
  icon: Icon,
  tone = "warning",
  title,
  description,
  action,
  poweredBy,
  documentTitle,
  children,
}: {
  variant: PublicVariant;
  /** Browser tab title. Needed on not-found boundaries, where Next ignores a `metadata` export. */
  documentTitle?: string;
  icon: LucideIcon;
  tone?: PublicStateTone;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Defaults to on for a tenant page, off for Magnetix. */
  poweredBy?: boolean;
  children?: ReactNode;
}) {
  const surface = publicSurfaceProps(variant, "flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-10");
  return (
    <div {...surface} data-public-shell="state" data-public-variant={variant.kind}>
      {documentTitle && <title>{documentTitle}</title>}
      <Identity variant={variant} />
      <main className="tenant-card flex w-full max-w-[420px] flex-col items-center gap-3 p-7 text-center sm:p-8">
        <span className={cn("flex size-12 items-center justify-center rounded-full", `public-tone-${tone}`)}>
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h1 className="public-ink text-xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="public-body text-sm leading-relaxed">{description}</p>}
        {children}
        {action && <div className="mt-2 flex w-full flex-col items-center gap-2">{action}</div>}
      </main>
      <Footer variant={variant} poweredBy={poweredBy ?? variant.kind === "tenant"} />
    </div>
  );
}

/** A state-card action: brand primary or a quiet secondary. Renders a link or a button. */
export function PublicAction({
  href,
  onClick,
  secondary = false,
  children,
}: {
  href?: string;
  onClick?: () => void;
  secondary?: boolean;
  children: ReactNode;
}) {
  const cls = cn(
    "inline-flex h-11 w-full max-w-[260px] items-center justify-center gap-2 border px-5 text-sm font-semibold transition-colors",
    secondary ? "public-button-secondary" : "tenant-button",
  );
  if (href) {
    return href.startsWith("/") ? (
      <Link href={href} className={cls}>
        {children}
      </Link>
    ) : (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
