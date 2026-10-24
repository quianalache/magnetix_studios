import { notFound } from "next/navigation";
import { getWebinarBySlugServerSide } from "@/lib/server/webinar-service";
import { getSubAccountPublicName } from "@/lib/server/public-identity";
import { publicSurfaceProps, TenantIdentity } from "@/components/public/public-shell";
import { WebinarRegistrationForm } from "./registration-form";

export const dynamic = "force-dynamic";

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate() : null;
}

/**
 * Public webinar registration (Visual Direction 2, 2026-10-24): the
 * business's tenant surface with the webinar's own title, time and
 * description — the same fields the public registration API already
 * returns. Registration itself is unchanged (RegistrationForm posts to
 * /api/webinar/.../register). Webinars have no brand source of their own,
 * so the accent stays the neutral default.
 */
export default async function PublicWebinarPage({ params }: { params: Promise<{ subAccountId: string; webinarSlug: string }> }) {
  const { subAccountId, webinarSlug } = await params;
  const [webinar, businessName] = await Promise.all([
    getWebinarBySlugServerSide(subAccountId, webinarSlug).catch(() => null),
    getSubAccountPublicName(subAccountId).catch(() => null),
  ]);
  if (!webinar) notFound();

  const brand = { name: businessName || webinar.title };
  const startAt = toDate(webinar.startAt);
  const when = startAt
    ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: webinar.timezone || undefined, timeZoneName: "short" }).format(startAt)
    : null;
  const surface = publicSurfaceProps({ kind: "tenant", brand }, "flex min-h-dvh flex-col px-4 py-5 sm:px-8 sm:py-7");

  return (
    <div {...surface} data-public-shell="webinar">
      <header className="mx-auto flex w-full max-w-6xl items-center">
        <TenantIdentity brand={brand} />
      </header>
      <main className="flex flex-1 items-center justify-center py-8">
        <div className="tenant-card w-full max-w-[480px] p-6 sm:p-9">
          <p className="public-faint text-xs font-semibold tracking-[0.14em] uppercase">Webinar</p>
          <h1 className="tenant-display public-ink mt-2 text-2xl leading-tight text-balance sm:text-3xl">{webinar.title}</h1>
          {when && <p className="tenant-text mt-2 text-sm font-medium">{when}</p>}
          {webinar.description && <p className="public-body mt-3 text-sm leading-relaxed whitespace-pre-line">{webinar.description}</p>}
          <div className="public-line mt-6 border-t pt-6">
            <WebinarRegistrationForm subAccountId={subAccountId} webinarSlug={webinarSlug} />
          </div>
        </div>
      </main>
    </div>
  );
}
