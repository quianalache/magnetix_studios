import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
  ChevronRight,
  FileSignature,
  MessagesSquare,
  Orbit,
} from "lucide-react";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentMember } from "@/lib/community/member-session";
import {
  listPortalCourses,
  listPortalProjects,
  listPortalQuotes,
  listPortalReadings,
  listPortalSessionBundles,
  listPortalUpcomingBookings,
} from "@/lib/server/portal-service";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { resolvePortalBranding } from "@/types/portal-branding";
import type { SubAccountDoc } from "@/types/tenancy";
import { PortalLogoutButton } from "./[saId]/logout-button";
import { PortalProjectsPanel } from "./[saId]/projects-panel";

/**
 * Shared portal-home screen — real build of the approved Branding Mockup
 * dashboard. Rebuilt a second time (2026-08-07) with exact values pulled
 * from the mockup's own CSS (tile padding/radius, icon sizes, stat card
 * sizing, progress segment height) rather than approximated, same fix as
 * portal-login-view.tsx.
 *
 * Rendered from either the opaque `/portal/{saId}` route or the pretty
 * `/portal` custom-domain mirror — `loginPath` is the one thing that
 * differs between the two callers.
 */

const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  paid: "Paid",
};

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("") || "?"
  ).toUpperCase();
}

export async function PortalHomeView({ saId, loginPath }: { saId: string; loginPath: string }) {
  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) notFound();
  const sub = subSnap.data() as SubAccountDoc;
  const branding = resolvePortalBranding(sub.portalBranding);
  const displayName = branding.portalName || sub.name || "Client Portal";

  const member = await getCurrentMember(saId);
  if (!member) redirect(loginPath);

  const [courses, readings, bookings, quotes, projects, sessionBundles] = await Promise.all([
    branding.modules.courses ? listPortalCourses(saId, member.id) : Promise.resolve([]),
    branding.modules.readings && member.contactId
      ? listPortalReadings(saId, member.contactId)
      : Promise.resolve([]),
    member.contactId ? listPortalUpcomingBookings(saId, member.contactId) : Promise.resolve([]),
    branding.modules.invoices && member.contactId
      ? listPortalQuotes(saId, member.contactId)
      : Promise.resolve([]),
    member.contactId ? listPortalProjects(saId, member.contactId) : Promise.resolve([]),
    branding.modules.sessions
      ? listPortalSessionBundles(saId, member.id, member.contactId)
      : Promise.resolve([]),
  ]);

  const openQuotes = quotes.filter((q) => q.kind === "invoice" && q.status !== "paid");
  const balanceDue = openQuotes.reduce((sum, q) => sum + computeQuoteTotals(q).total, 0);
  const nextBooking = bookings[0] ?? null;
  const sessionsTotal = sessionBundles.reduce((s, b) => s + b.total, 0);
  const sessionsUsed = sessionBundles.reduce((s, b) => s + b.used, 0);
  const sessionsRemaining = sessionBundles.reduce((s, b) => s + b.remaining, 0);
  const coursesInProgress = courses.filter((c) => c.progressPct < 1).length;

  return (
    <div
      className="min-h-screen bg-[#F8F7F5]"
      style={{ ["--portal-accent" as string]: branding.accentColor }}
    >
      <div className="mx-auto max-w-3xl px-5 py-7 sm:px-6">
        <div className="mb-[22px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[13px] font-bold text-white"
              style={{ background: branding.logoUrl ? undefined : "var(--portal-accent)" }}
            >
              {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={branding.logoUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                initials(displayName)
              )}
            </div>
            <div>
              <p className="text-[14px] font-bold text-[#202124]">{displayName}</p>
              <p className="text-[11px] text-[#909090]">
                Hi{member.displayName ? ` ${member.displayName}` : ""}, welcome back
              </p>
            </div>
          </div>
          <PortalLogoutButton saId={saId} />
        </div>

        <div className="mb-[22px] flex flex-wrap gap-2.5">
          <StatCard label="Courses" value={String(coursesInProgress)} />
          <StatCard
            label="Sessions used"
            value={sessionsTotal > 0 ? `${sessionsUsed}` : "—"}
            suffix={sessionsTotal > 0 ? `/${sessionsTotal}` : undefined}
          />
          <StatCard
            label="Next session"
            value={
              nextBooking?.startAt
                ? nextBooking.startAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                : "—"
            }
          />
          <StatCard label="Balance due" value={`$${balanceDue.toFixed(2)}`} />
        </div>

        {member.contactId && (
          <div className="mb-[22px]">
            <PortalProjectsPanel saId={saId} projects={projects} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
          {branding.modules.courses && (
            <Tile icon={<BookOpen className="h-full w-full" />} title="Courses">
              {courses.length === 0 ? (
                <EmptyTileBody text="No courses yet." />
              ) : (
                courses.slice(0, 2).map((c, i) => (
                  <Link
                    key={c.courseId}
                    href={c.classroomHref}
                    className={i > 0 ? "mt-2 block" : "block"}
                  >
                    <p>
                      <strong>{c.title}</strong> — {Math.round(c.progressPct * 100)}% complete
                    </p>
                  </Link>
                ))
              )}
            </Tile>
          )}

          {branding.modules.readings && (
            <Tile icon={<Orbit className="h-full w-full" />} title="Energetic Readings">
              {readings.length === 0 ? (
                <EmptyTileBody text="No readings yet." />
              ) : (
                readings.slice(0, 2).map((r, i) => (
                  <p key={r.id} className={i > 0 ? "mt-2" : ""}>
                    <strong>{r.name}</strong> — {r.birthPlace}
                  </p>
                ))
              )}
            </Tile>
          )}

          {branding.modules.sessions && (
            <Tile icon={<Calendar className="h-full w-full" />} title="Sessions" wide={sessionsTotal > 0}>
              {sessionsTotal === 0 && !nextBooking ? (
                <EmptyTileBody text="No sessions yet." />
              ) : (
                <>
                  {sessionsTotal > 0 && (
                    <>
                      <span>
                        {sessionsUsed} of {sessionsTotal} sessions used
                      </span>
                      <div className="mb-1.5 mt-2 flex gap-1">
                        {Array.from({ length: sessionsTotal }).map((_, i) => (
                          <div
                            key={i}
                            className="h-[5px] flex-1 rounded-[3px]"
                            style={{ background: i < sessionsUsed ? "var(--portal-accent)" : "#E4E4E4" }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {nextBooking && (
                    <p className={sessionsTotal > 0 ? "mt-2" : ""}>
                      Next: <strong>{nextBooking.title}</strong>
                      {nextBooking.startAt && (
                        <>
                          {" "}
                          — {nextBooking.startAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </>
                      )}
                    </p>
                  )}
                  {sessionsRemaining > 0 && (
                    <p
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold"
                      style={{ color: "var(--portal-accent)" }}
                    >
                      {sessionsRemaining} session{sessionsRemaining === 1 ? "" : "s"} available to book
                      <ChevronRight className="h-3 w-3" />
                    </p>
                  )}
                </>
              )}
            </Tile>
          )}

          {branding.modules.invoices && (
            <Tile icon={<FileSignature className="h-full w-full" />} title="Invoices">
              {openQuotes.length === 0 ? (
                <EmptyTileBody text="Nothing due." />
              ) : (
                openQuotes.slice(0, 2).map((q, i) => {
                  const { total } = computeQuoteTotals(q);
                  return (
                    <Link
                      key={q.id}
                      href={`/api/portal/${saId}/quotes/${q.id}/view`}
                      className={i > 0 ? "mt-2 block" : "block"}
                    >
                      <strong>{q.quoteNumber}</strong> — {QUOTE_STATUS_LABEL[q.status] ?? q.status} · {q.currency}{" "}
                      {total.toFixed(2)}
                    </Link>
                  );
                })
              )}
            </Tile>
          )}

          {branding.modules.community && (
            <Tile icon={<MessagesSquare className="h-full w-full" />} title="Community">
              <EmptyTileBody text="Nothing new yet." />
            </Tile>
          )}
        </div>

        {courses.length === 0 &&
          readings.length === 0 &&
          bookings.length === 0 &&
          openQuotes.length === 0 &&
          sessionBundles.length === 0 && (
            <p className="mt-4 rounded-xl border border-dashed border-[#E4E4E4] bg-white py-12 text-center text-sm text-[#909090]">
              Nothing here yet — check back after your next appointment or purchase.
            </p>
          )}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="min-w-[108px] flex-1 rounded-[11px] bg-[#EFE9EE] px-[13px] py-[11px]">
      <p className="text-[19px] font-bold leading-[1.1] tabular-nums text-[#202124]">
        {value}
        {suffix && <span className="text-[12px] font-semibold text-[#909090]">{suffix}</span>}
      </p>
      <p className="mt-[3px] text-[10px] uppercase tracking-[.03em] text-[#909090]">{label}</p>
    </div>
  );
}

function Tile({
  icon,
  title,
  children,
  wide,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`cursor-pointer rounded-[13px] border border-[#E4E4E4] bg-white p-[15px] transition-colors hover:border-[var(--portal-accent)] ${wide ? "sm:col-span-2" : ""}`}
    >
      <div className="mb-[11px] flex items-center gap-2">
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#F8F7F5] p-1.5"
          style={{ color: "var(--portal-accent)" }}
        >
          {icon}
        </span>
        <h3 className="text-[12.5px] font-bold text-[#202124]">{title}</h3>
      </div>
      <div className="text-[11.5px] leading-relaxed text-[#909090]">{children}</div>
    </div>
  );
}

function EmptyTileBody({ text }: { text: string }) {
  return <p className="italic">{text}</p>;
}
