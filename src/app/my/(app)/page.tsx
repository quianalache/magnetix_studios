import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, RefreshCw, DollarSign, FolderKanban, PlayCircle, MessagesSquare, Wallet, ChevronRight } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  resolvePersonDisplayName,
  listSpacesForPerson,
  listCoursesForPerson,
  listComingUpForPerson,
  listAttentionForPerson,
  listPaymentsForPerson,
  listPinnedKeys,
} from "@/lib/server/mymagnetix-service";
import { todaysMindsetEntry } from "@/lib/mymagnetix/mindset";
import { gradientForId, initialsFor } from "@/lib/mymagnetix/visuals";
import { formatCurrency } from "@/lib/format";
import { MindsetCard } from "@/components/mymagnetix/mindset-card";
import { PinButton } from "@/components/mymagnetix/pin-button";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function formatTime(date: Date): string {
  return date.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" });
}
function dateBadge(date: Date): { month: string; day: string } {
  return {
    month: date.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    day: date.toLocaleDateString(undefined, { day: "numeric" }),
  };
}
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// "Coming Up" in the approved mockup mixes real upcoming appointments AND
// real upcoming subscription renewals into one chronological feed — both
// arrays are already real data (listComingUpForPerson / listPaymentsForPerson);
// this just merges and sorts them, it doesn't invent a third source.
interface ComingUpFeedItem {
  key: string;
  date: Date;
  title: string;
  subtitle: string;
  businessName: string;
  enterHref?: string;
  kind: "appointment" | "renewal";
}

export default async function MyMagnetixHomePage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const memberships = await listPersonMemberships(person.id);

  const [displayName, spaces, courses, comingUp, attention, payments, pinned] = await Promise.all([
    resolvePersonDisplayName(person.id, person.primaryEmail, memberships),
    listSpacesForPerson(memberships),
    listCoursesForPerson(memberships),
    listComingUpForPerson(memberships),
    listAttentionForPerson(memberships),
    listPaymentsForPerson(memberships),
    listPinnedKeys(person.id),
  ]);

  const mindset = todaysMindsetEntry();
  const continueLearning = courses
    .slice()
    .sort((a, b) => (a.progressPct === 100 ? 1 : 0) - (b.progressPct === 100 ? 1 : 0))
    .slice(0, 6);

  const comingUpFeed: ComingUpFeedItem[] = [
    ...comingUp
      .filter((b) => b.startAt)
      .map((b): ComingUpFeedItem => ({
        key: `apt:${b.subAccountId}:${b.id}`,
        date: b.startAt as Date,
        title: b.title,
        subtitle: formatTime(b.startAt as Date),
        businessName: b.businessName,
        enterHref: b.enterHref,
        kind: "appointment",
      })),
    ...payments.map(
      (p): ComingUpFeedItem => ({
        key: `pay:${p.id}`,
        date: p.renewsAt,
        title: p.label,
        subtitle: `Renews • ${formatCurrency(p.amountCents / 100, p.currency)}`,
        businessName: "Subscription",
        kind: "renewal",
      }),
    ),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 6);

  const paymentsTotalCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
      <div>
        <h1 className="text-[24px] font-bold text-[#1D1B27]">
          {greeting()}, {displayName}! <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-[13.5px] text-[#84809A]">Here&rsquo;s what&rsquo;s happening across your spaces.</p>
      </div>

      <MindsetCard initial={mindset} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Needs Your Attention */}
          <section className="rounded-2xl border border-[#ECE9F5] bg-white p-5 shadow-[0_1px_2px_rgba(30,20,60,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[14.5px] font-bold text-[#1D1B27]">Needs your attention</h2>
              {attention.length > 0 && (
                <span className="text-[12px] font-semibold text-[#5E2574]">View all</span>
              )}
            </div>
            {attention.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">Nothing needs your attention right now.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#F3F1FA]">
                {attention.slice(0, 6).map((item) => {
                  const urgent = item.detail === "Due today" || item.detail === "Overdue" || item.detail === "Needs payment";
                  return (
                    <li key={item.id}>
                      <Link href={item.enterHref} className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-[#FAF9FD]">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                          style={{
                            background: item.kind === "invoice" ? "#DCFCE7" : item.kind === "project-due" ? "#FEE2E2" : "#EDE9FE",
                            color: item.kind === "invoice" ? "#15803D" : item.kind === "project-due" ? "#DC2626" : "#6D28D9",
                          }}
                        >
                          {item.kind === "invoice" ? <DollarSign className="h-4 w-4" /> : <FolderKanban className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-[#1D1B27]">{item.title}</p>
                          <p className="truncate text-[11.5px] text-[#8A87A0]">{item.businessName}</p>
                        </div>
                        {urgent ? (
                          <span className="shrink-0 rounded-full bg-[#FEE2E2] px-2.5 py-1 text-[10.5px] font-bold text-[#DC2626]">
                            {item.detail}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[11px] text-[#8A87A0]">{item.detail}</span>
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#C7C4D6]" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Continue Where You Left Off */}
          <section className="rounded-2xl border border-[#ECE9F5] bg-white p-5 shadow-[0_1px_2px_rgba(30,20,60,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[14.5px] font-bold text-[#1D1B27]">Continue where you left off</h2>
              {continueLearning.length > 0 && <span className="text-[12px] font-semibold text-[#5E2574]">View all</span>}
            </div>
            {continueLearning.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">
                No courses yet. Once you enroll in a course with any Magnetix business, it&rsquo;ll show up here.
              </p>
            ) : (
              <div className="mt-3.5 flex snap-x gap-3.5 overflow-x-auto pb-1">
                {continueLearning.map((course) => {
                  const key = `${course.subAccountId}:${course.courseId}`;
                  return (
                    <Link
                      key={key}
                      href={course.enterHref}
                      className="group flex w-[190px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-[#ECE9F5] transition-transform hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div
                        className="relative flex h-[110px] items-end p-3"
                        style={{ background: course.coverUrl ? undefined : gradientForId(key) }}
                      >
                        {course.coverUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={course.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        )}
                        {!course.coverUrl && (
                          <span className="relative text-[15px] font-extrabold uppercase leading-tight text-white/95">
                            {course.title}
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="truncate text-[13px] font-semibold text-[#1D1B27]">{course.title}</p>
                        <p className="truncate text-[11px] text-[#8A87A0]">{course.businessName}</p>
                        <p className="mt-1.5 text-[10.5px] font-medium text-[#8A87A0]">{course.progressPct}% complete</p>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#F0EEF7]">
                          <div className="h-full rounded-full bg-[#5E2574]" style={{ width: `${Math.min(100, course.progressPct)}%` }} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Your Spaces */}
          <section id="spaces" className="scroll-mt-20 rounded-2xl border border-[#ECE9F5] bg-white p-5 shadow-[0_1px_2px_rgba(30,20,60,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[14.5px] font-bold text-[#1D1B27]">Your spaces</h2>
              {spaces.length > 0 && <span className="text-[12px] font-semibold text-[#5E2574]">View all</span>}
            </div>
            {spaces.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">
                No business relationships yet — once you join a Magnetix business&rsquo;s community, course, or portal, it&rsquo;ll appear here.
              </p>
            ) : (
              <div className="mt-3.5 flex snap-x gap-3.5 overflow-x-auto pb-1">
                {spaces.map((space) => (
                  <div
                    key={space.subAccountId}
                    className="group relative w-[168px] shrink-0 snap-start overflow-hidden rounded-xl border border-[#ECE9F5] transition-transform hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="absolute right-2 top-2 z-10 rounded-full bg-white/85">
                      <PinButton pinKey={space.pinKey} initialPinned={pinned.has(space.pinKey)} />
                    </div>
                    <Link href={space.enterHref} className="flex flex-col">
                      <div
                        className="relative flex h-[92px] items-end p-3"
                        style={{ background: space.logoUrl ? undefined : gradientForId(space.subAccountId) }}
                      >
                        {space.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={space.logoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        )}
                        {!space.logoUrl && (
                          <span className="relative text-[14px] font-extrabold uppercase leading-tight text-white/95">{space.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 p-2.5">
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: space.accentColor }}
                        >
                          {initialsFor(space.name)}
                        </span>
                        <p className="truncate text-[12.5px] font-semibold text-[#1D1B27]">{space.name}</p>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          {/* Coming Up */}
          <section className="rounded-2xl border border-[#ECE9F5] bg-white p-5 shadow-[0_1px_2px_rgba(30,20,60,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[14.5px] font-bold text-[#1D1B27]">Coming up</h2>
              {comingUpFeed.length > 0 && <span className="text-[12px] font-semibold text-[#5E2574]">View calendar</span>}
            </div>
            {comingUpFeed.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">Nothing scheduled yet.</p>
            ) : (
              <ul className="mt-3.5 flex flex-col gap-3">
                {comingUpFeed.map((item) => {
                  const badge = dateBadge(item.date);
                  const Row = (
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-[#F3E4F0]">
                        <span className="text-[8.5px] font-bold uppercase leading-none text-[#5E2574]">{badge.month}</span>
                        <span className="text-[14px] font-extrabold leading-tight text-[#5E2574]">{badge.day}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-[#1D1B27]">{item.title}</p>
                        <p className="truncate text-[11px] text-[#8A87A0]">{item.subtitle}</p>
                        <p className="truncate text-[10.5px] text-[#B5B3C2]">{item.businessName}</p>
                      </div>
                      {item.kind === "renewal" ? (
                        <RefreshCw className="mt-1 h-4 w-4 shrink-0 text-[#16A34A]" />
                      ) : (
                        <Calendar className="mt-1 h-4 w-4 shrink-0 text-[#5E2574]" />
                      )}
                    </div>
                  );
                  return (
                    <li key={item.key}>
                      {item.enterHref ? (
                        <Link href={item.enterHref} className="-mx-1 block rounded-lg px-1 py-0.5 hover:bg-[#FAF9FD]">
                          {Row}
                        </Link>
                      ) : (
                        Row
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Payments This Week */}
          <section className="rounded-2xl border border-[#ECE9F5] bg-white p-5 shadow-[0_1px_2px_rgba(30,20,60,0.04)]">
            <div className="flex items-center justify-between">
              <h2 className="text-[14.5px] font-bold text-[#1D1B27]">Payments this week</h2>
              {payments.length > 0 && <span className="text-[12px] font-semibold text-[#5E2574]">View all</span>}
            </div>
            {payments.length === 0 ? (
              <p className="mt-3 text-[13px] text-[#909090]">No upcoming charges in the next two weeks.</p>
            ) : (
              <>
                <p className="mt-3 text-[26px] font-extrabold text-[#1D1B27]">{formatCurrency(paymentsTotalCents / 100)}</p>
                <p className="text-[11px] text-[#8A87A0]">Total across {payments.length} subscription{payments.length === 1 ? "" : "s"}</p>
                <ul className="mt-3 flex flex-col gap-2.5 border-t border-[#F3F1FA] pt-3">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] text-[#8A87A0]">{formatDate(p.renewsAt)}</p>
                        <p className="truncate text-[12.5px] font-medium text-[#1D1B27]">{p.label}</p>
                      </div>
                      <p className="shrink-0 text-[12.5px] font-semibold text-[#1D1B27]">{formatCurrency(p.amountCents / 100, p.currency)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Quick Actions */}
          <section className="rounded-2xl border border-[#ECE9F5] bg-white p-5 shadow-[0_1px_2px_rgba(30,20,60,0.04)]">
            <h2 className="text-[14.5px] font-bold text-[#1D1B27]">Quick actions</h2>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <Link
                href="/my/courses"
                className="flex flex-col items-center gap-2 rounded-xl border border-[#ECE9F5] py-3.5 text-center transition-colors hover:border-[#5E2574]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EDE9FE] text-[#6D28D9]">
                  <PlayCircle className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[11.5px] font-medium text-[#1D1B27]">My Courses</span>
              </Link>
              <Link
                href="/my/communities"
                className="flex flex-col items-center gap-2 rounded-xl border border-[#ECE9F5] py-3.5 text-center transition-colors hover:border-[#5E2574]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#DBEAFE] text-[#2563EB]">
                  <MessagesSquare className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[11.5px] font-medium text-[#1D1B27]">My Communities</span>
              </Link>
              <Link
                href="#spaces"
                className="flex flex-col items-center gap-2 rounded-xl border border-[#ECE9F5] py-3.5 text-center transition-colors hover:border-[#5E2574]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D1FAE5] text-[#0F766E]">
                  <Wallet className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[11.5px] font-medium text-[#1D1B27]">Your Spaces</span>
              </Link>
              <div
                title="Coming soon"
                className="flex cursor-default flex-col items-center gap-2 rounded-xl border border-[#ECE9F5] py-3.5 text-center opacity-50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F1FA] text-[#8A87A0]">
                  <MessagesSquare className="h-[18px] w-[18px]" />
                </span>
                <span className="text-[11.5px] font-medium text-[#8A87A0]">Message Coach</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
