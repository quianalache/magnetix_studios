import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Calendar, RefreshCw, DollarSign, FolderKanban, PlayCircle, MessagesSquare, Store, Wallet, ChevronRight } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  resolvePersonFirstName,
  listSpacesForPerson,
  listCoursesForPerson,
  listComingUpForPerson,
  listCommunitiesForPerson,
  listAgencyCommunitiesForPerson,
  listUpcomingCommunityEventsForPerson,
  listAttentionForPerson,
  listPaymentsForPerson,
  listPinnedKeys,
} from "@/lib/server/mymagnetix-service";
import { todaysMindsetEntry } from "@/lib/mymagnetix/mindset";
import { initialsFor } from "@/lib/mymagnetix/visuals";
import { cn } from "@/lib/utils";
import { TileCover } from "@/components/mymagnetix/tile-cover";
import { formatCurrency } from "@/lib/format";
import { MindsetCard } from "@/components/mymagnetix/mindset-card";
import { PinButton } from "@/components/mymagnetix/pin-button";
import { MyMagnetixOnboardingTour } from "@/components/mymagnetix/onboarding-tour";

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
// arrays are already real data (listComingUpForPerson / listPaymentsForPerson).
// Community Product Finish Pass (2026-09-19) adds a third real source, the
// next upcoming Community Event per Community the Person belongs to
// (listUpcomingCommunityEventsForPerson, tenant + Agency both included via
// the shared PersonCommunityItem model) — still just merging and sorting
// real data, never inventing a fourth source (no fake Course dates: courses
// have no scheduled-date concept, so they stay in "Continue Learning" only).
interface ComingUpFeedItem {
  key: string;
  date: Date;
  title: string;
  subtitle: string;
  businessName: string;
  enterHref?: string;
  kind: "appointment" | "renewal" | "community-event";
}

export default async function MyMagnetixHomePage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const memberships = await listPersonMemberships(person.id);

  const [firstName, spaces, courses, comingUp, tenantCommunities, agencyCommunities, attention, payments, pinned] = await Promise.all([
    resolvePersonFirstName(person.id, person.primaryEmail, memberships),
    listSpacesForPerson(memberships),
    listCoursesForPerson(memberships),
    listComingUpForPerson(memberships),
    listCommunitiesForPerson(memberships),
    listAgencyCommunitiesForPerson(person.id),
    listAttentionForPerson(memberships),
    listPaymentsForPerson(memberships),
    listPinnedKeys(person.id),
  ]);
  const upcomingEvents = await listUpcomingCommunityEventsForPerson(tenantCommunities, agencyCommunities);

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
    ...upcomingEvents.map(
      (e): ComingUpFeedItem => ({
        key: e.key,
        date: e.startAt,
        title: e.title,
        subtitle: `${e.communityName} • ${formatTime(e.startAt)}`,
        businessName: e.businessName,
        enterHref: e.enterHref,
        kind: "community-event",
      }),
    ),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 6);

  const paymentsTotalCents = payments.reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-title-lg font-semibold tracking-tight text-foreground">
          {greeting()}, {firstName}! <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-body text-muted-foreground">Here&rsquo;s what&rsquo;s happening across your spaces.</p>
      </div>

      <MindsetCard initial={mindset} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Needs Your Attention */}
          <section id="mymagnetix-attention" className="rounded-card border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-section font-semibold text-foreground">Needs your attention</h2>
            </div>
            {attention.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted-foreground">Nothing needs your attention right now.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {attention.slice(0, 6).map((item) => {
                  const urgent = item.detail === "Due today" || item.detail === "Overdue" || item.detail === "Needs payment";
                  return (
                    <li key={item.id}>
                      <Link href={item.enterHref} className="flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg hover:bg-muted">
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-full",
                            item.kind === "invoice" ? "bg-tag-green-bg text-tag-green-fg" : item.kind === "project-due" ? "bg-status-danger-bg text-status-danger-fg" : "bg-tag-violet-bg text-tag-violet-fg",
                          )}
                        >
                          {item.kind === "invoice" ? <DollarSign className="h-4 w-4" /> : <FolderKanban className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body-sm font-semibold text-foreground">{item.title}</p>
                          <p className="truncate text-caption text-muted-foreground">{item.businessName}</p>
                        </div>
                        {urgent ? (
                          <span className="shrink-0 rounded-full bg-status-danger-bg px-2.5 py-1 text-micro font-semibold text-status-danger-fg">
                            {item.detail}
                          </span>
                        ) : (
                          <span className="shrink-0 text-micro text-muted-foreground">{item.detail}</span>
                        )}
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Continue Where You Left Off */}
          <section id="mymagnetix-continue" className="rounded-card border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-section font-semibold text-foreground">Continue where you left off</h2>
              {continueLearning.length > 0 && <Link href="/my/courses" className="text-caption font-semibold text-link hover:underline">View all</Link>}
            </div>
            {continueLearning.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted-foreground">
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
                      className="group flex w-48 shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop"
                    >
                      <TileCover id={key} src={course.coverUrl} icon={BookOpen} className="h-24" />
                      <div className="p-3">
                        <p className="truncate text-body-sm font-semibold text-foreground">{course.title}</p>
                        <p className="truncate text-micro text-muted-foreground">{course.businessName}</p>
                        <p className="mt-2 text-micro font-medium text-muted-foreground">{course.progressPct}% complete</p>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, course.progressPct)}%` }} />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Your Spaces */}
          <section id="mymagnetix-spaces" className="scroll-mt-20 rounded-card border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-section font-semibold text-foreground">Your Spaces</h2>
                          </div>
            {spaces.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted-foreground">
                No business relationships yet — once you join a Magnetix business&rsquo;s community, course, or portal, it&rsquo;ll appear here.
              </p>
            ) : (
              <div className="mt-3.5 flex snap-x gap-3.5 overflow-x-auto pb-1">
                {spaces.map((space) => (
                  <div
                    key={space.subAccountId}
                    className="group relative w-44 shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop"
                  >
                    <div className="absolute right-2 top-2 z-10 rounded-full bg-card/90">
                      <PinButton pinKey={space.pinKey} initialPinned={pinned.has(space.pinKey)} />
                    </div>
                    <Link href={space.enterHref} className="flex flex-col">
                      <TileCover id={space.subAccountId} src={space.logoUrl} icon={Store} className="h-20" />
                      <div className="flex items-center gap-2 p-2.5">
                        <span
                          // The business's own portal accent — its brand, not Magnetix's.
                          className="flex size-6 shrink-0 items-center justify-center rounded-full text-overline font-semibold text-white"
                          style={{ background: space.accentColor }}
                        >
                          {initialsFor(space.name)}
                        </span>
                        <p className="truncate text-body-sm font-semibold text-foreground">{space.name}</p>
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
          <section id="mymagnetix-coming-up" className="rounded-card border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-section font-semibold text-foreground">Coming up</h2>
                          </div>
            {comingUpFeed.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted-foreground">Nothing scheduled yet.</p>
            ) : (
              <ul className="mt-3.5 flex flex-col gap-3">
                {comingUpFeed.map((item) => {
                  const badge = dateBadge(item.date);
                  const Row = (
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-tag-violet-bg">
                        <span className="text-overline font-semibold uppercase leading-none text-tag-violet-fg">{badge.month}</span>
                        <span className="text-body font-semibold leading-tight text-tag-violet-fg">{badge.day}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm font-semibold text-foreground">{item.title}</p>
                        <p className="truncate text-micro text-muted-foreground">{item.subtitle}</p>
                        <p className="truncate text-micro text-ink-tertiary">{item.businessName}</p>
                      </div>
                      {item.kind === "renewal" ? (
                        <RefreshCw className="mt-1 h-4 w-4 shrink-0 text-status-success-fg" />
                      ) : (
                        <Calendar className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      )}
                    </div>
                  );
                  return (
                    <li key={item.key}>
                      {item.enterHref ? (
                        <Link href={item.enterHref} className="-mx-1 block rounded-lg px-1 py-0.5 hover:bg-muted">
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
          <section id="mymagnetix-payments" className="rounded-card border border-border bg-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-section font-semibold text-foreground">Payments this week</h2>
              {payments.length > 0 && <Link href="/my/purchases" className="text-caption font-semibold text-link hover:underline">View all</Link>}
            </div>
            {payments.length === 0 ? (
              <p className="mt-3 text-body-sm text-muted-foreground">No upcoming charges in the next two weeks.</p>
            ) : (
              <>
                <p className="mt-3 text-title-lg font-semibold tracking-tight text-foreground tabular-nums">{formatCurrency(paymentsTotalCents / 100)}</p>
                <p className="text-micro text-muted-foreground">Total across {payments.length} subscription{payments.length === 1 ? "" : "s"}</p>
                <ul className="mt-3 flex flex-col gap-2.5 border-t border-border pt-3">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-micro text-muted-foreground">{formatDate(p.renewsAt)}</p>
                        <p className="truncate text-body-sm font-medium text-foreground">{p.label}</p>
                      </div>
                      <p className="shrink-0 text-body-sm font-semibold text-foreground">{formatCurrency(p.amountCents / 100, p.currency)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* Quick Actions */}
          <section id="mymagnetix-quick-actions" className="rounded-card border border-border bg-card p-5 shadow-card">
            <h2 className="text-section font-semibold text-foreground">Quick actions</h2>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
              <Link
                href="/my/courses"
                className="flex flex-col items-center gap-2 rounded-xl border border-border py-3.5 text-center transition-colors hover:border-border-strong hover:bg-muted"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tag-violet-bg text-tag-violet-fg">
                  <PlayCircle className="h-[18px] w-[18px]" />
                </span>
                <span className="text-caption font-medium text-foreground">My Courses</span>
              </Link>
              <Link
                href="/my/communities"
                className="flex flex-col items-center gap-2 rounded-xl border border-border py-3.5 text-center transition-colors hover:border-border-strong hover:bg-muted"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tag-blue-bg text-tag-blue-fg">
                  <MessagesSquare className="h-[18px] w-[18px]" />
                </span>
                <span className="text-caption font-medium text-foreground">My Communities</span>
              </Link>
              <Link
                href="#mymagnetix-spaces"
                className="flex flex-col items-center gap-2 rounded-xl border border-border py-3.5 text-center transition-colors hover:border-border-strong hover:bg-muted"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tag-aqua-bg text-tag-aqua-fg">
                  <Wallet className="h-[18px] w-[18px]" />
                </span>
                <span className="text-caption font-medium text-foreground">Your Spaces</span>
              </Link>
              {/* Messaging doesn't exist yet — an honest "Soon" slot, not a button. */}
              <div
                title="Coming soon"
                className="flex cursor-default flex-col items-center gap-2 rounded-xl border border-dashed border-border py-3.5 text-center"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-ink-tertiary">
                  <MessagesSquare className="h-[18px] w-[18px]" />
                </span>
                <span className="text-caption font-medium text-ink-tertiary">Message Coach · Soon</span>
              </div>
            </div>
          </section>
        </div>
      </div>
      <MyMagnetixOnboardingTour primaryEmail={person.primaryEmail} />
    </div>
  );
}
