import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  BookOpen,
  Calendar,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  FileSignature,
  FolderKanban,
  Home,
  MessagesSquare,
  Orbit,
  PlayCircle,
  Search,
  Video,
} from "lucide-react";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentMember } from "@/lib/community/member-session";
import {
  listPortalCommunities,
  listPortalCourses,
  listPortalProjects,
  listPortalQuotes,
  listPortalReadings,
  listPortalSessionBundles,
  listPortalUpcomingBookings,
  type PortalBooking,
  type PortalCommunity,
  type PortalCourse,
  type PortalSessionBundle,
} from "@/lib/server/portal-service";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { projectProgressPct } from "@/types/projects";
import { resolvePortalBranding } from "@/types/portal-branding";
import type { SubAccountDoc } from "@/types/tenancy";
import type { Quote } from "@/types/quotes";
import type { Project, ProjectStep } from "@/types/projects";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import { PortalLogoutButton } from "./[saId]/logout-button";

/**
 * Client Portal Home — approved production visual direction.
 *
 * This is the umbrella dashboard, not a full implementation of every deeper
 * feature. It reuses existing server-side portal queries and only renders
 * modules that have real data for the signed-in member/contact.
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

const navItems = [
  { label: "Home", icon: Home, href: "#", active: true },
  { label: "Appointments", icon: Calendar, href: "#appointments" },
  { label: "Communities", icon: MessagesSquare, href: "#communities" },
  { label: "Courses", icon: BookOpen, href: "#courses" },
  { label: "Projects", icon: FolderKanban, href: "#projects" },
  { label: "Billing", icon: FileSignature, href: "#billing" },
];

type PortalPromotion = never;

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

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function PortalHomeView({
  saId,
  loginPath,
}: {
  saId: string;
  loginPath: string;
}) {
  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) notFound();
  const sub = subSnap.data() as SubAccountDoc;
  const branding = resolvePortalBranding(sub.portalBranding);
  const displayName = branding.portalName || sub.name || "Client Portal";

  const member = await getCurrentMember(saId);
  if (!member) redirect(loginPath);

  const [
    courses,
    readings,
    bookings,
    quotes,
    projects,
    sessionBundles,
    communities,
  ] = await Promise.all([
    branding.modules.courses
      ? listPortalCourses(saId, member.id)
      : Promise.resolve([]),
    branding.modules.readings && member.contactId
      ? listPortalReadings(saId, member.contactId)
      : Promise.resolve([]),
    member.contactId
      ? listPortalUpcomingBookings(saId, member.contactId)
      : Promise.resolve([]),
    branding.modules.invoices && member.contactId
      ? listPortalQuotes(saId, member.contactId)
      : Promise.resolve([]),
    member.contactId ? listPortalProjects(saId, member.contactId) : Promise.resolve([]),
    branding.modules.sessions
      ? listPortalSessionBundles(saId, member.id, member.contactId)
      : Promise.resolve([]),
    branding.modules.community
      ? listPortalCommunities(saId, member.id)
      : Promise.resolve([]),
  ]);

  const openInvoices = quotes.filter(
    (q) => q.kind === "invoice" && q.status !== "paid",
  );
  const nextBooking = bookings[0] ?? null;
  const sessionRemaining = sessionBundles.reduce((sum, b) => sum + b.remaining, 0);
  const activeProjects = projects.length;
  const learningCourse =
    courses.find((course) => course.progressPct < 100) ?? courses[0] ?? null;
  const secondaryCourses = learningCourse
    ? courses.filter((course) => course.courseId !== learningCourse.courseId)
    : courses;
  const promotions: PortalPromotion[] = [];
  const hasPromotions = promotions.length > 0;

  return (
    <div
      className="min-h-screen bg-[#F8F7F5]"
      style={{ ["--portal-accent" as string]: branding.accentColor }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-6 sm:px-6 lg:px-8">
        <PortalHeader
          brandingLogoUrl={branding.logoUrl}
          displayName={displayName}
          memberName={member.displayName}
          saId={saId}
        />
        <PortalNav />

        <div
          className={`grid gap-5 ${
            hasPromotions ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""
          }`}
        >
          <main className="min-w-0 space-y-4">
            <WelcomeBlock
              memberName={member.displayName}
              displayName={displayName}
            />

            <SummaryRow
              coursesCount={courses.length}
              communitiesCount={communities.length}
              activeProjects={activeProjects}
              openInvoiceCount={openInvoices.length}
            />

            {learningCourse && <ContinueLearning course={learningCourse} />}

            {nextBooking && <AppointmentsModule booking={nextBooking} />}

            {communities.length > 0 && (
              <CommunitiesModule communities={communities} />
            )}

            {secondaryCourses.length > 0 && (
              <CoursesModule courses={secondaryCourses} />
            )}

            {sessionRemaining > 0 && (
              <SessionsModule saId={saId} sessionBundles={sessionBundles} />
            )}

            {projects.length > 0 && <ProjectsModule projects={projects} />}

            {readings.length > 0 && <ReadingsModule readings={readings} />}

            {openInvoices.length > 0 && (
              <BillingModule saId={saId} invoices={openInvoices} />
            )}
          </main>

          <PromotionalSidebar promotions={promotions} />
        </div>

        {courses.length === 0 &&
          readings.length === 0 &&
          bookings.length === 0 &&
          openInvoices.length === 0 &&
          sessionBundles.length === 0 &&
          projects.length === 0 &&
          communities.length === 0 && (
            <p className="mt-4 rounded-xl border border-dashed border-[#E4E4E4] bg-white py-12 text-center text-sm text-[#909090]">
              Nothing here yet. Check back after your next appointment,
              purchase, or community invite.
            </p>
          )}
      </div>
    </div>
  );
}

function PortalHeader({
  brandingLogoUrl,
  displayName,
  memberName,
  saId,
}: {
  brandingLogoUrl: string | null;
  displayName: string;
  memberName: string | null;
  saId: string;
}) {
  return (
    <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] text-[13px] font-bold text-white"
          style={{ background: brandingLogoUrl ? undefined : "var(--portal-accent)" }}
        >
          {brandingLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brandingLogoUrl}
              alt={displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            initials(displayName)
          )}
        </div>
        <div>
          <p className="text-[14px] font-bold text-[#202124]">{displayName}</p>
          <p className="text-[11px] text-[#909090]">Client Portal</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="hidden h-9 min-w-[220px] items-center gap-2 rounded-[10px] border border-[#E4E4E4] bg-white px-3 text-[#909090] md:flex">
          <Search className="h-3.5 w-3.5" />
          <span className="sr-only">Search portal</span>
          <input
            type="search"
            placeholder="Search portal"
            className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#909090]"
          />
        </label>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E4E4E4] bg-white text-[#606060]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-[10px] border border-[#E4E4E4] bg-white px-2.5 text-[#606060]"
          aria-label="Account"
        >
          <CircleUserRound className="h-4 w-4" />
          <span className="hidden text-[11px] font-semibold sm:inline">
            {memberName || "Account"}
          </span>
        </button>
        <PortalLogoutButton saId={saId} />
      </div>
    </header>
  );
}

function PortalNav() {
  return (
    <nav
      className="mb-5 flex gap-1.5 overflow-x-auto rounded-[13px] border border-[#E4E4E4] bg-white p-1"
      aria-label="Client Portal"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 py-2 text-[11px] font-bold ${
              item.active ? "text-white" : "text-[#707070] hover:bg-[#F8F7F5]"
            }`}
            style={{
              background: item.active ? "var(--portal-accent)" : undefined,
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function WelcomeBlock({
  memberName,
  displayName,
}: {
  memberName: string | null;
  displayName: string;
}) {
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-[#909090]">
        Home
      </p>
      <h1 className="mt-1 text-[24px] font-bold leading-tight text-[#202124]">
        Hi{memberName ? ` ${memberName}` : ""}, welcome back.
      </h1>
      <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-[#909090]">
        Continue your programs, join what is coming up, and open anything that
        needs attention inside {displayName}.
      </p>
    </section>
  );
}

function SummaryRow({
  coursesCount,
  communitiesCount,
  activeProjects,
  openInvoiceCount,
}: {
  coursesCount: number;
  communitiesCount: number;
  activeProjects: number;
  openInvoiceCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      <StatCard label="Courses" value={String(coursesCount)} />
      <StatCard label="Communities" value={String(communitiesCount)} />
      <StatCard label="Projects" value={String(activeProjects)} />
      <StatCard label="Open invoices" value={String(openInvoiceCount)} />
    </div>
  );
}

function ContinueLearning({ course }: { course: PortalCourse }) {
  return (
    <section className="rounded-[13px] border border-[#E4E4E4] bg-white p-[15px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[.04em] text-[#909090]">
            Continue Learning
          </p>
          <h2 className="mt-1 text-[15px] font-bold text-[#202124]">
            {course.title}
          </h2>
          {course.nextLessonTitle && (
            <p className="mt-1 text-[12px] leading-relaxed text-[#909090]">
              Next lesson: {course.nextLessonTitle}
            </p>
          )}
          <ProgressBar value={course.progressPct} />
        </div>
        <PortalButton href={course.classroomHref} icon={<PlayCircle className="h-3.5 w-3.5" />}>
          Continue
        </PortalButton>
      </div>
    </section>
  );
}

function AppointmentsModule({ booking }: { booking: PortalBooking }) {
  return (
    <SectionBlock
      id="appointments"
      icon={<Calendar className="h-full w-full" />}
      title="Next Appointment"
      actionLabel="See all appointments"
      actionHref="#appointments"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[12.5px] font-bold text-[#202124]">
            {booking.title}
          </p>
          {booking.startAt && (
            <p className="mt-1 text-[12px] leading-relaxed text-[#909090]">
              {formatDateTime(booking.startAt)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {booking.meetingUrl && (
            <PortalButton href={booking.meetingUrl} external>
              <Video className="h-3.5 w-3.5" />
              Join
            </PortalButton>
          )}
          <PortalButton href="#appointments" variant="outline">
            View Details
          </PortalButton>
        </div>
      </div>
    </SectionBlock>
  );
}

function CommunitiesModule({
  communities,
}: {
  communities: PortalCommunity[];
}) {
  return (
    <SectionBlock
      id="communities"
      icon={<MessagesSquare className="h-full w-full" />}
      title="Communities"
      actionLabel="Open community"
      actionHref={communities[0]?.href ?? "#communities"}
    >
      <div className="space-y-3">
        {communities.slice(0, 3).map((community) => (
          <div
            key={community.groupId}
            className="flex flex-col gap-2 border-b border-[#EEEEEE] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-[12.5px] font-bold text-[#202124]">
                {community.name}
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[#909090]">
                {community.tagline || `Level ${community.level} member`}
              </p>
            </div>
            <PortalButton href={community.href} variant="outline">
              Enter
            </PortalButton>
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

function CoursesModule({ courses }: { courses: PortalCourse[] }) {
  return (
    <SectionBlock
      id="courses"
      icon={<BookOpen className="h-full w-full" />}
      title="Courses"
      actionLabel="View courses"
      actionHref={courses[0]?.classroomHref ?? "#courses"}
    >
      <div className="space-y-4">
        {courses.slice(0, 3).map((course) => (
          <div key={course.courseId}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold text-[#202124]">
                  {course.title}
                </p>
                {course.nextLessonTitle && (
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[#909090]">
                    Next: {course.nextLessonTitle}
                  </p>
                )}
              </div>
              <PortalButton href={course.classroomHref} variant="outline">
                Continue
              </PortalButton>
            </div>
            <ProgressBar value={course.progressPct} />
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

function SessionsModule({
  saId,
  sessionBundles,
}: {
  saId: string;
  sessionBundles: PortalSessionBundle[];
}) {
  const available = sessionBundles.filter((bundle) => bundle.remaining > 0);
  if (available.length === 0) return null;
  return (
    <SectionBlock
      icon={<Calendar className="h-full w-full" />}
      title="Included Sessions"
      actionLabel="Book session"
      actionHref={`/b/${saId}/${available[0].bookingPageSlug}`}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {available.map((bundle) => (
          <div
            key={bundle.bookingPageSlug}
            className="rounded-[11px] bg-[#F8F7F5] px-3 py-2.5"
          >
            <p className="text-[12px] font-bold text-[#202124]">
              {bundle.bookingPageName}
            </p>
            <p className="mt-0.5 text-[11px] text-[#909090]">
              {bundle.remaining} of {bundle.total} session
              {bundle.total === 1 ? "" : "s"} remaining
            </p>
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

function ProjectsModule({
  projects,
}: {
  projects: (Project & { steps: ProjectStep[] })[];
}) {
  return (
    <SectionBlock
      id="projects"
      icon={<FolderKanban className="h-full w-full" />}
      title="Projects"
      actionLabel="View projects"
      actionHref="#projects"
    >
      <div className="space-y-3">
        {projects.slice(0, 3).map((project) => {
          const nextStep = project.steps.find((step) => !step.done);
          return (
            <div key={project.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-bold text-[#202124]">
                    {project.title}
                  </p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[#909090]">
                    {project.status === "active" ? "In progress" : "Archived"}
                    {nextStep ? ` - Next milestone: ${nextStep.title}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-bold text-[#606060]">
                  {projectProgressPct(project)}%
                </span>
              </div>
              <ProgressBar value={projectProgressPct(project)} />
            </div>
          );
        })}
      </div>
    </SectionBlock>
  );
}

function ReadingsModule({
  readings,
}: {
  readings: EnergeticDecoderReading[];
}) {
  return (
    <SectionBlock
      id="readings"
      icon={<Orbit className="h-full w-full" />}
      title="Readings"
      actionLabel="View reading"
      actionHref="#readings"
    >
      <div className="space-y-3">
        {readings.slice(0, 2).map((reading) => (
          <div
            key={reading.id}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-[12.5px] font-bold text-[#202124]">
                {reading.name}
              </p>
              <p className="mt-1 text-[12px] text-[#909090]">
                {reading.birthPlace}
              </p>
            </div>
            <PortalButton href="#readings" variant="outline">
              Open
            </PortalButton>
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

function BillingModule({
  saId,
  invoices,
}: {
  saId: string;
  invoices: Quote[];
}) {
  return (
    <SectionBlock
      id="billing"
      icon={<CreditCard className="h-full w-full" />}
      title="Billing"
      actionLabel="View invoice"
      actionHref={`/api/portal/${saId}/quotes/${invoices[0].id}/view`}
    >
      <div className="space-y-3">
        {invoices.slice(0, 2).map((invoice) => {
          const { total } = computeQuoteTotals(invoice);
          return (
            <Link
              key={invoice.id}
              href={`/api/portal/${saId}/quotes/${invoice.id}/view`}
              className="flex flex-col gap-1 rounded-[11px] bg-[#F8F7F5] px-3 py-2.5 text-[12px] hover:bg-[#EFE9EE] sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <strong className="text-[#202124]">{invoice.quoteNumber}</strong>
                <span className="text-[#909090]">
                  {" "}
                  - {QUOTE_STATUS_LABEL[invoice.status] ?? invoice.status}
                </span>
              </span>
              <span className="font-bold text-[#202124]">
                {invoice.currency} {total.toFixed(2)}
              </span>
            </Link>
          );
        })}
      </div>
    </SectionBlock>
  );
}

function PromotionalSidebar({ promotions }: { promotions: PortalPromotion[] }) {
  // Presentation area intentionally renders only when real promotional
  // configuration exists. The admin/source-of-truth for these promotional
  // cards is deferred, so production does not show fake offers.
  if (promotions.length === 0) return null;
  return <aside className="hidden lg:block" aria-label="Promotions" />;
}

function SectionBlock({
  id,
  icon,
  title,
  actionLabel,
  actionHref,
  children,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  actionLabel: string;
  actionHref: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-[13px] border border-[#E4E4E4] bg-white p-[15px]"
    >
      <div className="mb-[12px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[8px] bg-[#F8F7F5] p-1.5"
            style={{ color: "var(--portal-accent)" }}
          >
            {icon}
          </span>
          <h2 className="text-[12.5px] font-bold text-[#202124]">{title}</h2>
        </div>
        <Link
          href={actionHref}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold"
          style={{ color: "var(--portal-accent)" }}
        >
          {actionLabel}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div>{children}</div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[108px] flex-1 rounded-[11px] bg-[#EFE9EE] px-[13px] py-[11px]">
      <p className="text-[19px] font-bold leading-[1.1] tabular-nums text-[#202124]">
        {value}
      </p>
      <p className="mt-[3px] text-[10px] uppercase tracking-[.03em] text-[#909090]">
        {label}
      </p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-[#E4E4E4]">
      <div
        className="h-full rounded-[3px]"
        style={{ width: `${pct}%`, background: "var(--portal-accent)" }}
      />
    </div>
  );
}

function PortalButton({
  href,
  children,
  variant = "solid",
  icon,
  external,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "outline";
  icon?: React.ReactNode;
  external?: boolean;
}) {
  const className =
    variant === "solid"
      ? "inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] border border-[var(--portal-accent)] px-2.5 text-[11px] font-bold text-white"
      : "inline-flex h-8 items-center justify-center gap-1.5 rounded-[9px] border border-[#E4E4E4] bg-white px-2.5 text-[11px] font-bold text-[#606060]";

  return (
    <Link
      href={href}
      className={className}
      style={{ background: variant === "solid" ? "var(--portal-accent)" : undefined }}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {icon}
      {children}
    </Link>
  );
}
