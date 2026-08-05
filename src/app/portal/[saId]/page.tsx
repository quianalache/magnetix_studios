import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentMember } from "@/lib/community/member-session";
import {
  listPortalCourses,
  listPortalQuotes,
  listPortalReadings,
  listPortalUpcomingBookings,
} from "@/lib/server/portal-service";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { PortalLogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ saId: string }>;
}

const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  paid: "Paid",
};

export default async function PortalPage({ params }: PageProps) {
  const { saId } = await params;

  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) notFound();
  const subName = (subSnap.data()?.name as string | undefined) ?? "Client Portal";

  const member = await getCurrentMember(saId);
  if (!member) redirect(`/portal/${saId}/login`);

  const [courses, readings, bookings, quotes] = await Promise.all([
    listPortalCourses(saId, member.id),
    member.contactId ? listPortalReadings(saId, member.contactId) : Promise.resolve([]),
    member.contactId
      ? listPortalUpcomingBookings(saId, member.contactId)
      : Promise.resolve([]),
    member.contactId ? listPortalQuotes(saId, member.contactId) : Promise.resolve([]),
  ]);

  const openQuotes = quotes.filter((q) => q.kind === "invoice" && q.status !== "paid");

  return (
    <div className="min-h-screen bg-[#F8F7F5]">
      <header className="border-b border-[#E4E4E4] bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#909090]">
              {subName}
            </p>
            <h1 className="text-lg font-semibold text-[#202124]">
              Welcome{member.displayName ? `, ${member.displayName}` : ""}
            </h1>
          </div>
          <PortalLogoutButton saId={saId} />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        {bookings.length > 0 && (
          <Section title="Upcoming appointments">
            <div className="divide-y rounded-xl border border-[#E4E4E4] bg-white">
              {bookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-4 py-3">
                  <p className="text-sm font-medium text-[#202124]">{b.title}</p>
                  <p className="text-xs text-[#909090]">
                    {b.startAt
                      ? b.startAt.toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {openQuotes.length > 0 && (
          <Section title="Invoices">
            <div className="divide-y rounded-xl border border-[#E4E4E4] bg-white">
              {openQuotes.map((q) => {
                const { total } = computeQuoteTotals(q);
                return (
                  <Link
                    key={q.id}
                    href={`/api/portal/${saId}/quotes/${q.id}/view`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-[#F8F7F5]"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#202124]">{q.quoteNumber}</p>
                      <p className="text-xs text-[#909090]">
                        {QUOTE_STATUS_LABEL[q.status] ?? q.status}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[#202124]">
                      {q.currency} {total.toFixed(2)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </Section>
        )}

        {courses.length > 0 && (
          <Section title="Your courses">
            <div className="grid gap-3 sm:grid-cols-2">
              {courses.map((c) => (
                <Link
                  key={c.courseId}
                  href={c.classroomHref}
                  className="rounded-xl border border-[#E4E4E4] bg-white p-4 hover:border-[#202124]/30"
                >
                  <p className="text-sm font-semibold text-[#202124]">{c.title}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F0EFEC]">
                    <div
                      className="h-full bg-[#202124]"
                      style={{ width: `${Math.round(c.progressPct * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[#909090]">
                    {Math.round(c.progressPct * 100)}% complete
                  </p>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {readings.length > 0 && (
          <Section title="Your readings">
            <div className="divide-y rounded-xl border border-[#E4E4E4] bg-white">
              {readings.map((r) => (
                <div key={r.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-[#202124]">{r.name}</p>
                  <p className="text-xs text-[#909090]">{r.birthPlace}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {courses.length === 0 &&
          readings.length === 0 &&
          bookings.length === 0 &&
          openQuotes.length === 0 && (
            <p className="rounded-xl border border-dashed border-[#E4E4E4] bg-white py-12 text-center text-sm text-[#909090]">
              Nothing here yet — check back after your next appointment or purchase.
            </p>
          )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#909090]">
        {title}
      </h2>
      {children}
    </section>
  );
}
