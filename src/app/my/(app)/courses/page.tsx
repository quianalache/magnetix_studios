import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listCoursesForPerson,
  listPinnedKeys,
} from "@/lib/server/mymagnetix-service";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { TileCover } from "@/components/mymagnetix/tile-cover";
import { PinButton } from "@/components/mymagnetix/pin-button";
import { MyMagnetixBackLink } from "@/components/mymagnetix/back-link";

export const dynamic = "force-dynamic";

/**
 * My Courses — the person-centered global index (Part 12). Every course
 * here is a real enrollment reused from portal-service.ts's own
 * listPortalCourses, fanned out across every business relationship this
 * Person has (mymagnetix-service.ts) — not a second course system.
 * Clicking a course opens the exact same classroom experience Client
 * Portal already links to.
 */
export default async function MyMagnetixCoursesPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const memberships = await listPersonMemberships(person.id);
  const [courses, pinned] = await Promise.all([
    listCoursesForPerson(memberships),
    listPinnedKeys(person.id),
  ]);

  const sorted = courses.slice().sort((a, b) => {
    const ap = pinned.has(a.pinKey) ? 0 : 1;
    const bp = pinned.has(b.pinKey) ? 0 : 1;
    return ap - bp;
  });

  return (
    <div className="mx-auto max-w-5xl">
      <MyMagnetixBackLink />
      <PageHeader title="My Courses" description="Every course you&rsquo;re enrolled in, across every Magnetix business." />

      {sorted.length === 0 ? (
        <EmptyState className="mt-6" icon={BookOpen} title="No courses yet" description="When you enroll in a course with any Magnetix business, it appears here." />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((course) => {
            const key = `${course.subAccountId}:${course.courseId}`;
            return (
              <div
                key={key}
                className="relative flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop"
              >
                <div className="absolute top-2 right-2 z-10 rounded-full bg-card/90">
                  <PinButton
                    pinKey={course.pinKey}
                    initialPinned={pinned.has(course.pinKey)}
                  />
                </div>
                <Link href={course.enterHref} className="flex flex-1 flex-col">
                  <TileCover id={key} src={course.coverUrl} icon={BookOpen} className="h-28" />
                  <div className="p-3">
                    <p className="truncate text-body-sm font-semibold text-foreground">
                      {course.title}
                    </p>
                    <p className="truncate text-micro text-muted-foreground">
                      {course.businessName}
                    </p>
                    <p className="mt-2 text-micro font-medium text-muted-foreground">{course.progressPct}% complete</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${Math.min(100, course.progressPct)}%`,
                        }}
                      />
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
