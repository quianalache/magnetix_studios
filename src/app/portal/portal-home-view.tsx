import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpen,
  Calendar,
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
 * Shared portal-home screen — real build of the "Client Portal — Branding
 * Mockup" dashboard she approved: a stat row + a grid of clickable module
 * tiles instead of the original flat stacked-section MVP, respecting the
 * staff-configured module visibility toggles (Client Portal settings page).
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
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[13px] font-bold text-white"
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
              <p className="text-xs font-medium uppercase tracking-wide text-[#909090]">{displayName}</p>
              <h1 className="text-[15px] font-semibold text-[#202124]">
                Hi{member.displayName ? ` ${member.displayName}` : ""}, welcome back
              </h1>
            </div>
          </div>
          <PortalLogoutButton saId={saId} />
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Courses" value={String(coursesInProgress)} />
          <StatCard
            label="Sessions used"
            value={sessionsTotal > 0 ? `${sessionsUsed}/${sessionsTotal}` : "—"}
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

        {member.contactId && <PortalProjectsPanel saId={saId} projects={projects} />}

        <div className="grid gap-4 sm:grid-cols-2">
          {branding.modules.courses && (
            <Tile icon={<BookOpen className="h-4 w-4" />} title="Courses">
              {courses.length === 0 ? (
                <EmptyTileBody text="No courses yet." />
              ) : (
                <div className="space-y-2.5">
                  {courses.slice(0, 3).map((c) => (
                    <Link
                      key={c.courseId}
                      href={c.classroomHref}
                      className="block rounded-lg border border-[#E4E4E4] p-2.5 hover:border-[var(--portal-accent)]"
                    >
                      <p className="text-[13px] font-medium text-[#202124]">{c.title}</p>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F0EFEC]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.round(c.progressPct * 100)}%`, background: "var(--portal-accent)" }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-[#909090]">{Math.round(c.progressPct * 100)}% complete</p>
                    </Link>
                  ))}
                </div>
              )}
            </Tile>
          )}

          {branding.modules.readings && (
            <Tile icon={<Orbit className="h-4 w-4" />} title="Energetic Readings">
              {readings.length === 0 ? (
                <EmptyTileBody text="No readings yet." />
              ) : (
                <div className="space-y-2">
                  {readings.slice(0, 3).map((r) => (
                    <div key={r.id} className="rounded-lg border border-[#E4E4E4] p-2.5">
                      <p className="text-[13px] font-medium text-[#202124]">{r.name}</p>
                      <p className="text-[11px] text-[#909090]">{r.birthPlace}</p>
                    </div>
                  ))}
                </div>
              )}
            </Tile>
          )}

          {branding.modules.sessions && (
            <Tile icon={<Calendar className="h-4 w-4" />} title="Sessions" wide={sessionsTotal > 0}>
              {sessionsTotal === 0 && !nextBooking ? (
                <EmptyTileBody text="No sessions yet." />
              ) : (
                <div className="space-y-3">
                  {sessionsTotal > 0 && (
                    <div>
                      <p className="text-[12.5px] text-[#202124]">
                        {sessionsUsed} of {sessionsTotal} sessions used
                      </p>
                      <div className="mt-1.5 flex gap-1">
                        {Array.from({ length: sessionsTotal }).map((_, i) => (
                          <div
                            key={i}
                            className="h-1.5 flex-1 rounded-full"
                            style={{
                              background: i < sessionsUsed ? "var(--portal-accent)" : "#E4E4E4",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {nextBooking && (
                    <p className="text-[12.5px] text-[#202124]">
                      Next: <span className="font-medium">{nextBooking.title}</span>
                      {nextBooking.startAt && (
                        <span className="text-[#909090]">
                          {" "}
                          — {nextBooking.startAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      )}
                    </p>
                  )}
                  {sessionsRemaining > 0 && (
                    <p className="text-[12.5px] font-medium" style={{ color: "var(--portal-accent)" }}>
                      {sessionsRemaining} session{sessionsRemaining === 1 ? "" : "s"} available to book &rarr;
                    </p>
                  )}
                </div>
              )}
            </Tile>
          )}

          {branding.modules.invoices && (
            <Tile icon={<FileSignature className="h-4 w-4" />} title="Invoices">
              {openQuotes.length === 0 ? (
                <EmptyTileBody text="Nothing due." />
              ) : (
                <div className="space-y-2">
                  {openQuotes.slice(0, 3).map((q) => {
                    const { total } = computeQuoteTotals(q);
                    return (
                      <Link
                        key={q.id}
                        href={`/api/portal/${saId}/quotes/${q.id}/view`}
                        className="flex items-center justify-between rounded-lg border border-[#E4E4E4] p-2.5 hover:border-[var(--portal-accent)]"
                      >
                        <div>
                          <p className="text-[13px] font-medium text-[#202124]">{q.quoteNumber}</p>
                          <p className="text-[11px] text-[#909090]">{QUOTE_STATUS_LABEL[q.status] ?? q.status}</p>
                        </div>
                        <p className="text-[13px] font-semibold text-[#202124]">
                          {q.currency} {total.toFixed(2)}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Tile>
          )}

          {branding.modules.community && (
            <Tile icon={<MessagesSquare className="h-4 w-4" />} title="Community">
              <EmptyTileBody text="Nothing new yet." />
            </Tile>
          )}
        </div>

        {courses.length === 0 &&
          readings.length === 0 &&
          bookings.length === 0 &&
          openQuotes.length === 0 &&
          sessionBundles.length === 0 && (
            <p className="rounded-xl border border-dashed border-[#E4E4E4] bg-white py-12 text-center text-sm text-[#909090]">
              Nothing here yet — check back after your next appointment or purchase.
            </p>
          )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E4E4E4] bg-white p-3.5">
      <p className="text-lg font-bold tabular-nums text-[#202124]">{value}</p>
      <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#909090]">{label}</p>
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
    <div className={`rounded-xl border border-[#E4E4E4] bg-white p-4 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F8F7F5]"
          style={{ color: "var(--portal-accent)" }}
        >
          {icon}
        </span>
        <h3 className="text-[13px] font-semibold text-[#202124]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyTileBody({ text }: { text: string }) {
  return <p className="text-[12px] italic text-[#909090]">{text}</p>;
}
