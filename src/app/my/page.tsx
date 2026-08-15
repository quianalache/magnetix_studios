import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Calendar, PlayCircle, DollarSign, FolderKanban } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  resolvePersonDisplayName,
  listSpacesForPerson,
  listCoursesForPerson,
  listComingUpForPerson,
  listAttentionForPerson,
  listPaymentsForPerson,
} from "@/lib/server/mymagnetix-service";
import { todaysMindsetEntry } from "@/lib/mymagnetix/mindset";
import { formatCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function initials(text: string): string {
  return (text[0] ?? "?").toUpperCase();
}

export default async function MyMagnetixHomePage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const memberships = await listPersonMemberships(person.id);

  const [displayName, spaces, courses, comingUp, attention, payments] = await Promise.all([
    resolvePersonDisplayName(person.id, person.primaryEmail, memberships),
    listSpacesForPerson(memberships),
    listCoursesForPerson(memberships),
    listComingUpForPerson(memberships),
    listAttentionForPerson(memberships),
    listPaymentsForPerson(memberships),
  ]);

  const mindset = todaysMindsetEntry();
  const continueLearning = courses
    .slice()
    .sort((a, b) => (a.progressPct === 100 ? 1 : 0) - (b.progressPct === 100 ? 1 : 0))
    .slice(0, 4);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-[22px] font-semibold text-[#202124]">Welcome back, {displayName}.</h1>
        <p className="mt-1 text-[13px] text-[#909090]">Here&rsquo;s what&rsquo;s happening for you across Magnetix.</p>
      </div>

      {/* Magnetix Mindset */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{ background: "linear-gradient(135deg, #5E2574, #341E42)" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Magnetix Mindset</p>
        <p className="mt-2 font-serif text-[17px] leading-snug">{mindset.text}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Needs Your Attention */}
          <section className="rounded-2xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-[13px] font-semibold text-[#202124]">Needs Your Attention</h2>
            {attention.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">Nothing needs your attention right now.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#F0EEEA]">
                {attention.slice(0, 6).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F3E4F0] text-[#5E2574]">
                      {item.kind === "invoice" ? <DollarSign className="h-4 w-4" /> : <FolderKanban className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[#202124]">{item.title}</p>
                      <p className="truncate text-[11.5px] text-[#909090]">
                        {item.detail} · {item.businessName}
                      </p>
                    </div>
                    <Link
                      href={item.enterHref}
                      className="shrink-0 text-[12px] font-semibold text-[#5E2574] hover:underline"
                    >
                      View
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Continue Where You Left Off */}
          <section className="rounded-2xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-[13px] font-semibold text-[#202124]">Continue Where You Left Off</h2>
            {continueLearning.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">
                No courses yet. Once you enroll in a course with any Magnetix business, it&rsquo;ll show up here.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {continueLearning.map((course) => (
                  <Link
                    key={`${course.subAccountId}:${course.courseId}`}
                    href={course.enterHref}
                    className="group flex flex-col overflow-hidden rounded-xl border border-[#E4E4E4] transition-colors hover:border-[#5E2574]"
                  >
                    <div className="flex h-24 items-center justify-center bg-[#F3E4F0]">
                      {course.coverUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={course.coverUrl} alt={course.title} className="h-full w-full object-cover" />
                      ) : (
                        <PlayCircle className="h-8 w-8 text-[#5E2574]" />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-[13px] font-semibold text-[#202124]">{course.title}</p>
                      <p className="truncate text-[11px] text-[#909090]">{course.businessName}</p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F0EEEA]">
                        <div
                          className="h-full rounded-full bg-[#5E2574]"
                          style={{ width: `${Math.min(100, course.progressPct)}%` }}
                        />
                      </div>
                      {course.nextLessonTitle && (
                        <p className="mt-1.5 truncate text-[11px] text-[#5E2574]">Next: {course.nextLessonTitle}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Your Spaces */}
          <section className="rounded-2xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-[13px] font-semibold text-[#202124]">Your Spaces</h2>
            {spaces.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">
                No business relationships yet — once you join a Magnetix business&rsquo;s community, course, or portal, it&rsquo;ll appear here.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {spaces.map((space) => (
                  <Link
                    key={space.subAccountId}
                    href={space.enterHref}
                    className="flex items-center gap-3 rounded-xl border border-[#E4E4E4] p-3 transition-colors hover:border-[#5E2574]"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-[14px] font-bold text-white"
                      style={{ background: space.logoUrl ? undefined : space.accentColor }}
                    >
                      {space.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={space.logoUrl} alt={space.name} className="h-full w-full object-cover" />
                      ) : (
                        initials(space.name)
                      )}
                    </div>
                    <p className="truncate text-[13px] font-semibold text-[#202124]">{space.name}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {/* Coming Up */}
          <section className="rounded-2xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-[13px] font-semibold text-[#202124]">Coming Up</h2>
            {comingUp.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">Nothing scheduled yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {comingUp.map((item) => (
                  <li key={`${item.subAccountId}:${item.id}`} className="flex items-start gap-2.5">
                    <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[#5E2574]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-[#202124]">{item.title}</p>
                      <p className="text-[11px] text-[#909090]">
                        {item.startAt ? formatDateTime(item.startAt) : "Time TBD"} · {item.businessName}
                      </p>
                      <Link href={item.enterHref} className="text-[11px] font-semibold text-[#5E2574] hover:underline">
                        View appointment
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Payments This Week */}
          <section className="rounded-2xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-[13px] font-semibold text-[#202124]">Payments This Week</h2>
            {payments.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">No upcoming charges in the next two weeks.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-[#202124]">{p.label}</p>
                      <p className="text-[11px] text-[#909090]">
                        Renews {formatDate(p.renewsAt)} · {p.businessName}
                      </p>
                    </div>
                    <p className="shrink-0 text-[12.5px] font-semibold text-[#202124]">
                      {formatCurrency(p.amountCents / 100, p.currency)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Quick Actions */}
          <section className="rounded-2xl border border-[#E4E4E4] bg-white p-5">
            <h2 className="text-[13px] font-semibold text-[#202124]">Quick Actions</h2>
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/my/courses"
                className="flex items-center gap-2 rounded-lg border border-[#E4E4E4] px-3 py-2 text-[12.5px] font-medium text-[#202124] hover:border-[#5E2574]"
              >
                <PlayCircle className="h-4 w-4 text-[#5E2574]" /> Browse My Courses
              </Link>
              <Link
                href="/my/communities"
                className="flex items-center gap-2 rounded-lg border border-[#E4E4E4] px-3 py-2 text-[12.5px] font-medium text-[#202124] hover:border-[#5E2574]"
              >
                <CheckCircle2 className="h-4 w-4 text-[#5E2574]" /> Browse My Communities
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
