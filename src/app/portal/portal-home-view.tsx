import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  DollarSign,
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
  buildBookingUrl,
  buildCourseUrl,
  buildOfferUrl,
} from "@/lib/domains/public-url";
import { getCourseOffer } from "@/lib/server/course-offer-service";
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
import { getStandaloneCourse } from "@/lib/server/standalone-course-service";
import { formatCurrency } from "@/lib/format";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { projectProgressPct } from "@/types/projects";
import { resolvePortalBranding } from "@/types/portal-branding";
import type { PortalPromotionConfig } from "@/types/portal-branding";
import type { SubAccountDoc } from "@/types/tenancy";
import type { Project, ProjectStep } from "@/types/projects";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import type { Quote } from "@/types/quotes";
import { PortalLogoutButton } from "./[saId]/logout-button";
import { PortalProjectsPanel } from "./[saId]/projects-panel";

/**
 * Client Portal Home — approved production visual direction.
 *
 * This is the umbrella dashboard, not a full implementation of every deeper
 * feature. It reuses existing server-side portal queries and only renders
 * modules that have real data for the signed-in member/contact.
 */

export type PortalSection =
  | "home"
  | "appointments"
  | "communities"
  | "courses"
  | "projects"
  | "billing";

const navItems: Array<{
  label: string;
  icon: typeof Home;
  section: PortalSection;
  module?: keyof ReturnType<typeof resolvePortalBranding>["modules"];
}> = [
  { label: "Home", icon: Home, section: "home" },
  {
    label: "Appointments",
    icon: Calendar,
    section: "appointments",
    module: "appointments",
  },
  {
    label: "Communities",
    icon: MessagesSquare,
    section: "communities",
    module: "community",
  },
  { label: "Courses", icon: BookOpen, section: "courses", module: "courses" },
  {
    label: "Projects",
    icon: FolderKanban,
    section: "projects",
    module: "projects",
  },
  {
    label: "Billing",
    icon: FileSignature,
    section: "billing",
    module: "invoices",
  },
];

function portalSectionHref(basePath: string, section: PortalSection): string {
  return section === "home" ? basePath : `${basePath}/${section}`;
}

const portalSectionModules: Record<
  Exclude<PortalSection, "home">,
  keyof ReturnType<typeof resolvePortalBranding>["modules"]
> = {
  appointments: "appointments",
  communities: "community",
  courses: "courses",
  projects: "projects",
  billing: "invoices",
};

function sectionModule(
  section: Exclude<PortalSection, "home">
): keyof ReturnType<typeof resolvePortalBranding>["modules"] {
  return portalSectionModules[section];
}

interface PortalPromotion {
  id: string;
  label: string;
  title: string;
  description: string;
  href: string;
  imageUrl: string | null;
  ctaLabel: string;
  meta: string | null;
}

interface SummaryItem {
  label: string;
  value: string;
  detail: string;
  actionLabel: string;
  href: string;
  icon: React.ReactNode;
}

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

function plainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolvePromotions(
  subAccountId: string,
  subAccount: SubAccountDoc,
  configs: PortalPromotionConfig[],
  ownedCourses: PortalCourse[]
): Promise<PortalPromotion[]> {
  const active = [...configs]
    .filter((promo) => !promo.hidden)
    .sort((a, b) => a.order - b.order)
    .slice(0, 4);
  const out: PortalPromotion[] = [];
  for (const promo of active) {
    if (promo.type === "custom") {
      if (!promo.urlOverride || !promo.titleOverride) continue;
      out.push({
        id: promo.id,
        label: "Featured",
        title: promo.titleOverride,
        description: promo.descriptionOverride ?? "",
        href: promo.urlOverride,
        imageUrl: null,
        ctaLabel: "Open",
        meta: null,
      });
      continue;
    }
    if (!promo.targetId) continue;
    if (promo.type === "course") {
      const course = await getStandaloneCourse(subAccountId, promo.targetId);
      if (!course) continue;
      const owned = ownedCourses.find((item) => item.courseId === course.id);
      out.push({
        id: promo.id,
        label: owned ? "Continue learning" : "Featured course",
        title: promo.titleOverride || course.title,
        description:
          promo.descriptionOverride ||
          plainText(course.aboutHtml).slice(0, 150),
        href:
          owned?.classroomHref ??
          buildCourseUrl({
            subAccount,
            subAccountId,
            courseId: course.id,
            slug: course.slug,
          }),
        imageUrl: course.coverUrl,
        ctaLabel: owned ? "Open course" : "Learn more",
        meta:
          owned != null
            ? `${Math.round(owned.progressPct)}% complete`
            : course.access === "purchase"
              ? formatPriceCents(course.priceCents, course.currency)
              : "Free",
      });
    } else if (promo.type === "booking") {
      const snap = await getAdminDb()
        .doc(`subAccounts/${subAccountId}/bookingPages/${promo.targetId}`)
        .get();
      if (!snap.exists) continue;
      const data = snap.data() as {
        name?: string;
        description?: string;
        slug?: string;
        durationMinutes?: number;
        payment?: { amount?: number | null; currency?: string | null } | null;
        logoUrl?: string | null;
      };
      const slug = data.slug || promo.targetId;
      const metaParts = [
        data.durationMinutes ? `${data.durationMinutes} min` : null,
        typeof data.payment?.amount === "number"
          ? formatCurrency(data.payment.amount, data.payment.currency ?? "USD")
          : null,
      ].filter(Boolean);
      out.push({
        id: promo.id,
        label: "Book a session",
        title: promo.titleOverride || data.name || "Book a session",
        description: promo.descriptionOverride || data.description || "",
        href: buildBookingUrl({ subAccount, subAccountId, slug }),
        imageUrl: data.logoUrl ?? null,
        ctaLabel: "Book session",
        meta: metaParts.join(" · ") || null,
      });
    } else if (promo.type === "offer") {
      const offer = await getCourseOffer(subAccountId, promo.targetId);
      if (!offer) continue;
      out.push({
        id: promo.id,
        label: "Featured offer",
        title: promo.titleOverride || offer.title,
        description:
          promo.descriptionOverride ||
          plainText(offer.descriptionHtml).slice(0, 150),
        href: buildOfferUrl({
          subAccount,
          subAccountId,
          offerId: offer.id,
          slug: offer.slug,
        }),
        imageUrl: offer.thumbnailUrl,
        ctaLabel: "View offer",
        meta:
          offer.priceTextOverride ||
          (offer.type === "free"
            ? "Free"
            : offer.type === "recurring"
              ? `${formatPriceCents(offer.priceCents, offer.currency)} / ${
                  offer.recurringInterval ?? "month"
                }`
              : formatPriceCents(offer.priceCents, offer.currency)),
      });
    }
  }
  return out;
}

function formatPriceCents(
  cents: number | null,
  currency: string | null
): string {
  if (cents == null) return "";
  return formatCurrency(cents / 100, currency ?? "USD");
}

export async function PortalHomeView({
  saId,
  loginPath,
  basePath = `/portal/${saId}`,
  section = "home",
}: {
  saId: string;
  loginPath: string;
  basePath?: string;
  section?: PortalSection;
}) {
  const subSnap = await getAdminDb().doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists) notFound();
  const sub = subSnap.data() as SubAccountDoc;
  const branding = resolvePortalBranding(sub.portalBranding);
  if (section !== "home" && !branding.modules[sectionModule(section)]) {
    notFound();
  }
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
    branding.modules.appointments && member.contactId
      ? listPortalUpcomingBookings(saId, member.contactId)
      : Promise.resolve([]),
    branding.modules.invoices && member.contactId
      ? listPortalQuotes(saId, member.contactId)
      : Promise.resolve([]),
    branding.modules.projects && member.contactId
      ? listPortalProjects(saId, member.contactId)
      : Promise.resolve([]),
    branding.modules.sessions
      ? listPortalSessionBundles(saId, member.id, member.contactId)
      : Promise.resolve([]),
    branding.modules.community
      ? listPortalCommunities(saId, member.id)
      : Promise.resolve([]),
  ]);

  const openInvoices = quotes.filter(
    (q) => q.kind === "invoice" && q.status !== "paid"
  );
  const nextBooking = bookings[0] ?? null;
  const sessionRemaining = sessionBundles.reduce(
    (sum, b) => sum + b.remaining,
    0
  );
  const learningCourse =
    courses.find((course) => course.progressPct < 100) ?? courses[0] ?? null;
  const secondaryCourses = learningCourse
    ? courses.filter((course) => course.courseId !== learningCourse.courseId)
    : courses;
  const promotions = await resolvePromotions(
    saId,
    sub,
    branding.promotions,
    courses
  );
  const hasPromotions = promotions.length > 0;
  const firstOpenInvoice = openInvoices[0] ?? null;
  const firstOpenInvoiceTotal = firstOpenInvoice
    ? computeQuoteTotals(firstOpenInvoice).total
    : null;
  const summaryCandidates: Array<SummaryItem | null> = [
    nextBooking
      ? {
          label: "Upcoming appointment",
          value: "1",
          detail: nextBooking.startAt
            ? formatDateTime(nextBooking.startAt)
            : nextBooking.title,
          actionLabel: "View all",
          href: portalSectionHref(basePath, "appointments"),
          icon: <Calendar className="h-4 w-4" />,
        }
      : null,
    sessionRemaining > 0
      ? {
          label: "Session remaining",
          value: String(sessionRemaining),
          detail: "Available to schedule",
          actionLabel: "Book session",
          href: sessionBundles[0]
            ? `/b/${saId}/${sessionBundles[0].bookingPageSlug}`
            : "#sessions",
          icon: <CheckCircle2 className="h-4 w-4" />,
        }
      : null,
    courses.length > 0
      ? {
          label: "Courses in progress",
          value: String(courses.length),
          detail: learningCourse?.title ?? "Continue learning",
          actionLabel: "Continue learning",
          href:
            learningCourse?.classroomHref ??
            portalSectionHref(basePath, "courses"),
          icon: <BookOpen className="h-4 w-4" />,
        }
      : null,
    firstOpenInvoice && firstOpenInvoiceTotal !== null
      ? {
          label: "Payment due",
          value: formatCurrency(
            firstOpenInvoiceTotal,
            firstOpenInvoice.currency
          ),
          detail: firstOpenInvoice.quoteNumber,
          actionLabel: "View invoice",
          href: `/api/portal/${saId}/quotes/${firstOpenInvoice.id}/view`,
          icon: <DollarSign className="h-4 w-4" />,
        }
      : null,
  ];
  const summaryItems = summaryCandidates.filter(
    (item): item is SummaryItem => item !== null
  );
  const hasContent =
    courses.length > 0 ||
    readings.length > 0 ||
    bookings.length > 0 ||
    openInvoices.length > 0 ||
    sessionBundles.length > 0 ||
    projects.length > 0 ||
    communities.length > 0;

  return (
    <div
      className="min-h-screen bg-[#F8F7F5]"
      style={{ ["--portal-accent" as string]: branding.accentColor }}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <BackToMyMagnetixLink />
        <PortalHeader
          brandingLogoUrl={branding.logoUrl}
          displayName={displayName}
          memberName={member.displayName}
          saId={saId}
        />
        <PortalNav
          basePath={basePath}
          activeSection={section}
          modules={branding.modules}
        />

        <div
          className={`grid gap-6 ${
            hasPromotions ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""
          }`}
        >
          <main className="min-w-0 space-y-5">
            {section === "home" ? (
              <>
                <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_460px]">
                  <WelcomeBlock
                    memberName={member.displayName}
                    displayName={displayName}
                    welcomeMessage={branding.welcomeMessage}
                  />
                  {learningCourse && (
                    <ContinueLearning course={learningCourse} />
                  )}
                </div>

                {summaryItems.length > 0 && <SummaryRow items={summaryItems} />}
                {!hasContent && <EmptyHomeState displayName={displayName} />}

                <div className="grid gap-4 lg:grid-cols-2">
                  {nextBooking && (
                    <AppointmentsModule
                      booking={nextBooking}
                      appointmentsHref={portalSectionHref(
                        basePath,
                        "appointments"
                      )}
                    />
                  )}

                  {communities.length > 0 && (
                    <CommunitiesModule
                      communities={communities}
                      communitiesHref={portalSectionHref(
                        basePath,
                        "communities"
                      )}
                    />
                  )}

                  {secondaryCourses.length > 0 && (
                    <CoursesModule
                      courses={secondaryCourses}
                      coursesHref={portalSectionHref(basePath, "courses")}
                    />
                  )}

                  {projects.length > 0 && (
                    <ProjectsModule
                      projects={projects}
                      projectsHref={portalSectionHref(basePath, "projects")}
                    />
                  )}

                  {readings.length > 0 && (
                    <ReadingsModule readings={readings} />
                  )}

                  {sessionRemaining > 0 && (
                    <SessionsModule
                      saId={saId}
                      sessionBundles={sessionBundles}
                    />
                  )}
                </div>
              </>
            ) : (
              <PortalDestination
                section={section}
                saId={saId}
                bookings={bookings}
                communities={communities}
                courses={courses}
                projects={projects}
                quotes={quotes}
              />
            )}
          </main>

          <PromotionalSidebar promotions={promotions} />
        </div>
      </div>
    </div>
  );
}

/**
 * "Back to MyMagnetix" (2026-08-17) — a deliberately understated
 * breadcrumb-style link, not a second nav bar: this Client Portal is a
 * business-specific Space inside the Person's larger MyMagnetix account,
 * and there must always be an easy way back to that global home,
 * regardless of whether the visitor arrived here from MyMagnetix or
 * logged into this Portal directly (Portal password, Portal magic link).
 *
 * Rendered once here in the shared PortalHomeView shell — every section
 * (Home/Appointments/Communities/Courses/Projects/Billing) gets it for
 * free, no per-page wiring.
 *
 * A plain anchor, not next/link: this needs a REAL browser navigation to
 * a Route Handler (/api/my/bridge-from-member) that reads the already-
 * valid ls_member_session cookie server-side, safely reconciles/resolves
 * the linked Person, mints mm_session, and redirects to the canonical
 * platform /my — reusing the exact bridge already shipped for MyMagnetix
 * itself, not a second identity path. Never requires a second login, and
 * never touches or clears the Portal's own session — someone can leave
 * and come back to this same Portal without re-authenticating.
 */
function BackToMyMagnetixLink() {
  return (
    <Link
      href="/api/my/bridge-from-member"
      prefetch={false}
      className="mb-2.5 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#6B7280] transition-colors hover:text-[#111827]"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to MyMagnetix
    </Link>
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
    <header className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[11px] text-[15px] font-bold text-white shadow-sm"
          style={{
            background: brandingLogoUrl ? undefined : "var(--portal-accent)",
          }}
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
          <p className="text-[18px] leading-tight font-bold text-[#111217]">
            {displayName}
          </p>
          <p className="mt-0.5 text-[13px] text-[#4F5565]">Client Portal</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="hidden h-11 min-w-[232px] items-center gap-2 rounded-[10px] border border-[#DFE2EA] bg-white px-3.5 text-[#111827] shadow-[0_8px_22px_rgba(18,18,18,0.03)] md:flex">
          <Search className="h-4 w-4" />
          <span className="sr-only">Search portal</span>
          <input
            type="search"
            placeholder="Search portal"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#6B7280]"
          />
        </label>
        <button
          type="button"
          disabled
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#DFE2EA] bg-white text-[#111827] shadow-[0_8px_22px_rgba(18,18,18,0.03)]"
          aria-label="Notifications"
          title="Notifications are not available yet"
        >
          <Bell className="h-4 w-4" />
        </button>
        <div
          className="flex h-11 items-center gap-2 rounded-full bg-transparent px-1.5 text-[#111827]"
          aria-label="Account"
          title="Account settings are not available yet"
        >
          <span
            className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold text-white"
            style={{ background: "var(--portal-accent)" }}
          >
            {initials(memberName || "Account")}
          </span>
          <span className="hidden text-[13px] font-bold sm:inline">
            {memberName || "Account"}
          </span>
        </div>
        <PortalLogoutButton saId={saId} />
      </div>
    </header>
  );
}

function PortalNav({
  basePath,
  activeSection,
  modules,
}: {
  basePath: string;
  activeSection: PortalSection;
  modules: ReturnType<typeof resolvePortalBranding>["modules"];
}) {
  return (
    <nav
      className="mb-5 flex gap-4 overflow-x-auto rounded-[11px] border border-[#DFE2EA] bg-white p-2 shadow-[0_8px_24px_rgba(18,18,18,0.035)] sm:gap-6"
      aria-label="Client Portal"
    >
      {navItems
        .filter((item) => !item.module || modules[item.module])
        .map((item) => {
          const Icon = item.icon;
          const active = item.section === activeSection;
          return (
            <Link
              key={item.label}
              href={portalSectionHref(basePath, item.section)}
              className={`flex shrink-0 items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] font-bold ${
                active ? "text-white" : "text-[#707070] hover:bg-[#F8F7F5]"
              }`}
              style={{
                background: active ? "var(--portal-accent)" : undefined,
              }}
            >
              <Icon className="h-4 w-4" />
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
  welcomeMessage,
}: {
  memberName: string | null;
  displayName: string;
  welcomeMessage: string;
}) {
  return (
    <section className="py-3">
      <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.01em] text-[#111217] md:text-[34px]">
        Good morning{memberName ? `, ${memberName.split(" ")[0]}` : ""}.
      </h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#4F5565]">
        {welcomeMessage ||
          `Continue your programs, join what is coming up, and open anything that needs attention inside ${displayName}.`}
      </p>
    </section>
  );
}

function SummaryRow({ items }: { items: SummaryItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <StatCard key={item.label} item={item} />
      ))}
    </div>
  );
}

function EmptyHomeState({ displayName }: { displayName: string }) {
  return (
    <section className="rounded-[13px] border border-[#E4E4E4] bg-white p-[15px]">
      <div className="flex items-start gap-3">
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-[#F8F7F5] p-1.5"
          style={{ color: "var(--portal-accent)" }}
        >
          <Home className="h-full w-full" />
        </span>
        <div>
          <h2 className="text-[13px] font-bold text-[#202124]">
            Your portal is ready.
          </h2>
          <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-[#909090]">
            As {displayName} adds appointments, courses, communities, projects,
            readings, or invoices for you, they will appear here.
          </p>
        </div>
      </div>
    </section>
  );
}

function ContinueLearning({ course }: { course: PortalCourse }) {
  return (
    <section className="rounded-[12px] border border-[#DFE2EA] bg-white p-3.5 shadow-[0_12px_34px_rgba(18,18,18,0.04)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-[8px] bg-[#EFE9EE] sm:h-[94px] sm:w-[108px]">
          {course.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <BrandedFallback label="Course" />
          )}
          <span className="absolute inset-0 m-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/92 text-[var(--portal-accent)] shadow-lg">
            <PlayCircle className="h-7 w-7" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-[#4F5565]">
            Continue learning
          </p>
          <h2 className="mt-1 text-[15px] font-bold text-[#111217]">
            {course.title}
          </h2>
          {course.nextLessonTitle && (
            <p className="mt-1 text-[13px] leading-relaxed text-[#4F5565]">
              {course.nextLessonTitle}
            </p>
          )}
          <ProgressBar value={course.progressPct} />
        </div>
        <PortalButton href={course.classroomHref} variant="outline">
          Continue
        </PortalButton>
      </div>
    </section>
  );
}

function AppointmentsModule({
  booking,
  appointmentsHref,
}: {
  booking: PortalBooking;
  appointmentsHref: string;
}) {
  const month = booking.startAt
    ? booking.startAt
        .toLocaleString(undefined, { month: "short" })
        .toUpperCase()
    : "";
  const day = booking.startAt
    ? booking.startAt.toLocaleString(undefined, { day: "2-digit" })
    : "";
  return (
    <SectionBlock
      id="appointments"
      icon={<Calendar className="h-full w-full" />}
      title="Next appointment"
      actionLabel="See all appointments"
      actionHref={appointmentsHref}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {booking.startAt && (
            <div className="flex h-[76px] w-[78px] shrink-0 flex-col items-center justify-center rounded-[10px] bg-[#F1EAF5] text-[var(--portal-accent)]">
              <span className="text-[13px] font-bold">{month}</span>
              <span className="text-[28px] leading-none font-extrabold text-[#111217]">
                {day}
              </span>
            </div>
          )}
          <div>
            {booking.startAt && (
              <p className="text-[15px] font-bold text-[var(--portal-accent)]">
                {formatDateTime(booking.startAt)}
              </p>
            )}
            <p className="mt-1 text-[17px] font-bold text-[#111217]">
              {booking.title}
            </p>
            <p className="mt-1 text-[13px] text-[#4F5565]">Scheduled session</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {booking.meetingUrl && (
            <PortalButton href={booking.meetingUrl} external>
              <Video className="h-3.5 w-3.5" />
              Join
            </PortalButton>
          )}
          <PortalButton href={appointmentsHref} variant="outline">
            View Details
          </PortalButton>
        </div>
      </div>
    </SectionBlock>
  );
}

function CommunitiesModule({
  communities,
  communitiesHref,
}: {
  communities: PortalCommunity[];
  communitiesHref: string;
}) {
  return (
    <SectionBlock
      id="communities"
      icon={<MessagesSquare className="h-full w-full" />}
      title="Communities"
      actionLabel="See all"
      actionHref={communitiesHref}
    >
      <div className="space-y-3">
        {communities.slice(0, 3).map((community) => (
          <div
            key={community.groupId}
            className="flex flex-col gap-3 border-b border-[#EEEEEE] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-[20px] font-bold text-white"
                style={{ background: "var(--portal-accent)" }}
              >
                {initials(community.name)}
              </span>
              <div>
                <p className="text-[15px] font-bold text-[#111217]">
                  {community.name}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#4F5565]">
                  {community.tagline || `Level ${community.level} member`}
                </p>
                <span className="mt-2 inline-flex rounded-[7px] bg-[#F1EAF5] px-2.5 py-1 text-[11px] font-bold text-[var(--portal-accent)]">
                  Member · Active
                </span>
              </div>
            </div>
            <Link
              href={community.href}
              className="text-[#4F5565] hover:text-[var(--portal-accent)]"
              aria-label={`Open ${community.name}`}
            >
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        ))}
      </div>
    </SectionBlock>
  );
}

function CoursesModule({
  courses,
  coursesHref,
}: {
  courses: PortalCourse[];
  coursesHref: string;
}) {
  return (
    <SectionBlock
      id="courses"
      icon={<BookOpen className="h-full w-full" />}
      title="Courses"
      actionLabel="See all"
      actionHref={coursesHref}
    >
      <div className="space-y-4">
        {courses.slice(0, 3).map((course) => (
          <div
            key={course.courseId}
            className="flex items-center gap-3 border-b border-[#EEEEEE] pb-3 last:border-0 last:pb-0"
          >
            <div className="h-[56px] w-[64px] shrink-0 overflow-hidden rounded-[7px] bg-[#EFE9EE]">
              {course.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={course.coverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <BrandedFallback label="Course" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold text-[#111217]">
                {course.title}
              </p>
              {course.nextLessonTitle && (
                <p className="mt-0.5 truncate text-[12px] text-[#4F5565]">
                  {course.nextLessonTitle}
                </p>
              )}
              <ProgressBar value={course.progressPct} compact />
            </div>
            <PortalButton href={course.classroomHref} variant="outline">
              Continue
            </PortalButton>
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
  projectsHref,
}: {
  projects: (Project & { steps: ProjectStep[] })[];
  projectsHref: string;
}) {
  return (
    <SectionBlock
      id="projects"
      icon={<FolderKanban className="h-full w-full" />}
      title="Projects"
      actionLabel="View projects"
      actionHref={projectsHref}
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

function ReadingsModule({ readings }: { readings: EnergeticDecoderReading[] }) {
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

function PortalDestination({
  section,
  saId,
  bookings,
  communities,
  courses,
  projects,
  quotes,
}: {
  section: Exclude<PortalSection, "home">;
  saId: string;
  bookings: PortalBooking[];
  communities: PortalCommunity[];
  courses: PortalCourse[];
  projects: (Project & { steps: ProjectStep[] })[];
  quotes: Quote[];
}) {
  const copy = {
    appointments: {
      title: "Appointments",
      empty: "No appointments yet.",
    },
    communities: {
      title: "Communities",
      empty: "No communities available.",
    },
    courses: { title: "Courses", empty: "No courses yet." },
    projects: { title: "Projects", empty: "No projects assigned." },
    billing: { title: "Billing", empty: "No billing items." },
  }[section];

  const heading = (
    <section className="py-3">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.01em] text-[#111217] md:text-[32px]">
        {copy.title}
      </h1>
    </section>
  );

  if (section === "appointments") {
    return (
      <>
        {heading}
        {bookings.length === 0 ? (
          <PortalEmptyState message={copy.empty} />
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <section
                key={booking.id}
                className="flex flex-col gap-4 rounded-[12px] border border-[#DFE2EA] bg-white p-4 shadow-[0_12px_34px_rgba(18,18,18,0.035)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[16px] font-bold text-[#111217]">
                    {booking.title}
                  </p>
                  <p className="mt-1 text-[13px] text-[#4F5565]">
                    {booking.startAt
                      ? formatDateTime(booking.startAt)
                      : "Scheduled session"}
                  </p>
                </div>
                {booking.meetingUrl && (
                  <PortalButton href={booking.meetingUrl} external>
                    <Video className="h-3.5 w-3.5" />
                    Join meeting
                  </PortalButton>
                )}
              </section>
            ))}
          </div>
        )}
      </>
    );
  }

  if (section === "communities") {
    return (
      <>
        {heading}
        {communities.length === 0 ? (
          <PortalEmptyState message={copy.empty} />
        ) : (
          <div className="space-y-3">
            {communities.map((community) => (
              <Link
                key={community.groupId}
                href={community.href}
                className="flex items-center justify-between gap-4 rounded-[12px] border border-[#DFE2EA] bg-white p-4 shadow-[0_12px_34px_rgba(18,18,18,0.035)] hover:border-[var(--portal-accent)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                    style={{ background: "var(--portal-accent)" }}
                  >
                    {initials(community.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-bold text-[#111217]">
                      {community.name}
                    </p>
                    <p className="mt-1 truncate text-[13px] text-[#4F5565]">
                      {community.tagline || "Member · Active"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-[#4F5565]" />
              </Link>
            ))}
          </div>
        )}
      </>
    );
  }

  if (section === "courses") {
    return (
      <>
        {heading}
        {courses.length === 0 ? (
          <PortalEmptyState message={copy.empty} />
        ) : (
          <div className="space-y-3">
            {courses.map((course) => (
              <section
                key={course.courseId}
                className="flex flex-col gap-4 rounded-[12px] border border-[#DFE2EA] bg-white p-4 shadow-[0_12px_34px_rgba(18,18,18,0.035)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="h-[56px] w-[64px] shrink-0 overflow-hidden rounded-[7px] bg-[#EFE9EE]">
                    {course.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={course.coverUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <BrandedFallback label="Course" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-bold text-[#111217]">
                      {course.title}
                    </p>
                    {course.nextLessonTitle && (
                      <p className="mt-1 truncate text-[13px] text-[#4F5565]">
                        {course.nextLessonTitle}
                      </p>
                    )}
                    <ProgressBar value={course.progressPct} />
                  </div>
                </div>
                <PortalButton href={course.classroomHref} variant="outline">
                  Continue
                </PortalButton>
              </section>
            ))}
          </div>
        )}
      </>
    );
  }

  if (section === "projects") {
    const projectViews = projects.map((project) => ({
      id: project.id,
      title: project.title,
      description: project.description ?? "",
      stepCount: project.stepCount,
      stepsDoneCount: project.stepsDoneCount,
      steps: project.steps.map((step) => ({
        id: step.id,
        title: step.title,
        done: step.done,
      })),
    }));
    return (
      <>
        {heading}
        {projectViews.length === 0 ? (
          <PortalEmptyState message={copy.empty} />
        ) : (
          <PortalProjectsPanel saId={saId} projects={projectViews} />
        )}
      </>
    );
  }

  return (
    <>
      {heading}
      {quotes.length === 0 ? (
        <PortalEmptyState message={copy.empty} />
      ) : (
        <div className="space-y-3">
          {quotes.map((quote) => {
            const total = computeQuoteTotals(quote).total;
            const isInvoice = quote.kind === "invoice";
            return (
              <a
                key={quote.id}
                href={`/api/portal/${saId}/quotes/${quote.id}/view`}
                className="flex items-center justify-between gap-4 rounded-[12px] border border-[#DFE2EA] bg-white p-4 shadow-[0_12px_34px_rgba(18,18,18,0.035)] hover:border-[var(--portal-accent)]"
              >
                <div>
                  <p className="text-[16px] font-bold text-[#111217]">
                    {isInvoice ? "Invoice" : "Quote"} {quote.quoteNumber}
                  </p>
                  <p className="mt-1 text-[13px] text-[#4F5565] capitalize">
                    {quote.status}
                  </p>
                </div>
                <p className="shrink-0 text-[16px] font-bold text-[#111217]">
                  {formatCurrency(total, quote.currency)}
                </p>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}

function PortalEmptyState({ message }: { message: string }) {
  return (
    <section className="rounded-[12px] border border-dashed border-[#DFE2EA] bg-white px-5 py-10 text-center text-[14px] text-[#4F5565]">
      {message}
    </section>
  );
}

function PromotionalSidebar({ promotions }: { promotions: PortalPromotion[] }) {
  if (promotions.length === 0) return null;
  return (
    <aside
      className="space-y-4 xl:sticky xl:top-6 xl:self-start"
      aria-label="Promotions"
    >
      <h2 className="px-1 text-[16px] font-extrabold text-[var(--portal-accent)]">
        What&apos;s new for you
      </h2>
      {promotions.map((promotion) => (
        <Link
          key={promotion.id}
          href={promotion.href}
          className="group block overflow-hidden rounded-[12px] border border-[#DFE2EA] bg-white shadow-[0_14px_38px_rgba(18,18,18,0.045)] transition-all hover:-translate-y-0.5 hover:border-[var(--portal-accent)]"
        >
          <div className="relative min-h-[178px] overflow-hidden p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(94,37,116,0.12),transparent_45%),linear-gradient(135deg,#fff_0%,#F7F0FA_100%)]" />
            {promotion.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={promotion.imageUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute right-[-22px] bottom-[-28px] h-36 w-36 rounded-full bg-[var(--portal-accent)] opacity-15" />
            )}
            {promotion.imageUrl && (
              <div className="absolute inset-0 bg-gradient-to-r from-white via-white/88 to-white/20" />
            )}
            <div className="relative z-10 flex min-h-[146px] max-w-[78%] flex-col items-start">
              <span className="rounded-[6px] bg-[#F1EAF5] px-2.5 py-1 text-[10px] font-extrabold tracking-[.03em] text-[var(--portal-accent)] uppercase">
                {promotion.label}
              </span>
              <h3 className="mt-4 text-[20px] leading-tight font-extrabold text-[#111217]">
                {promotion.title}
              </h3>
              {promotion.meta && (
                <p className="mt-1 text-[12px] font-bold text-[var(--portal-accent)]">
                  {promotion.meta}
                </p>
              )}
              {promotion.description && (
                <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-[#2F3441]">
                  {promotion.description}
                </p>
              )}
              <span
                className="mt-auto inline-flex h-9 items-center justify-center rounded-[7px] px-4 text-[12px] font-bold text-white shadow-sm"
                style={{ background: "var(--portal-accent)" }}
              >
                {promotion.ctaLabel}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </aside>
  );
}

function BrandedFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.45),transparent_38%),linear-gradient(135deg,var(--portal-accent),#121217)] text-[10px] font-bold tracking-[.04em] text-white uppercase">
      {label}
    </div>
  );
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
      className="rounded-[12px] border border-[#DFE2EA] bg-white shadow-[0_12px_34px_rgba(18,18,18,0.035)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F4] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[6px] bg-[#F1EAF5] p-1.5"
            style={{ color: "var(--portal-accent)" }}
          >
            {icon}
          </span>
          <h2 className="text-[15px] font-bold text-[#111217]">{title}</h2>
        </div>
        <Link
          href={actionHref}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold"
          style={{ color: "var(--portal-accent)" }}
        >
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function StatCard({ item }: { item: SummaryItem }) {
  return (
    <Link
      href={item.href}
      className="block rounded-[12px] border border-[#DFE2EA] bg-white p-4 shadow-[0_12px_32px_rgba(18,18,18,0.035)] transition-colors hover:border-[var(--portal-accent)]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[#F1EAF5] text-[var(--portal-accent)]">
          {item.icon}
        </span>
        <div className="min-w-0">
          <p className="text-[24px] leading-none font-extrabold text-[#111217]">
            {item.value}
          </p>
          <p className="mt-2 text-[13px] leading-snug font-medium text-[#4F5565]">
            {item.label}
          </p>
          <p className="mt-1 line-clamp-1 text-[12px] text-[#4F5565]">
            {item.detail}
          </p>
          <span
            className="mt-3 inline-flex text-[12px] font-bold"
            style={{ color: "var(--portal-accent)" }}
          >
            {item.actionLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProgressBar({
  value,
  compact = false,
}: {
  value: number;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`mt-2 overflow-hidden rounded-full bg-[#E4E6EE] ${
        compact ? "h-[5px]" : "h-[5px]"
      }`}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: "#5667FF" }}
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
      ? "inline-flex h-9 items-center justify-center gap-1.5 rounded-[7px] border border-[var(--portal-accent)] px-4 text-[12px] font-bold text-white shadow-sm"
      : "inline-flex h-9 items-center justify-center gap-1.5 rounded-[7px] border border-[var(--portal-accent)] bg-white px-4 text-[12px] font-bold text-[var(--portal-accent)]";

  return (
    <Link
      href={href}
      className={className}
      style={{
        background: variant === "solid" ? "var(--portal-accent)" : undefined,
      }}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {icon}
      {children}
    </Link>
  );
}
