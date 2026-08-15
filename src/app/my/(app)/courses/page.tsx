import Link from "next/link";
import { redirect } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import { listPersonMemberships, listCoursesForPerson, listPinnedKeys } from "@/lib/server/mymagnetix-service";
import { PinButton } from "@/components/mymagnetix/pin-button";

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
      <h1 className="font-serif text-[20px] font-semibold text-[#202124]">My Courses</h1>
      <p className="mt-1 text-[13px] text-[#909090]">Every course you&rsquo;re enrolled in, across every Magnetix business.</p>

      {sorted.length === 0 ? (
        <p className="mt-6 text-[13px] text-[#909090]">No courses yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((course) => (
            <div
              key={`${course.subAccountId}:${course.courseId}`}
              className="relative flex flex-col overflow-hidden rounded-xl border border-[#E4E4E4] transition-colors hover:border-[#5E2574]"
            >
              <div className="absolute right-2 top-2 z-10 rounded-full bg-white/90">
                <PinButton pinKey={course.pinKey} initialPinned={pinned.has(course.pinKey)} />
              </div>
              <Link href={course.enterHref} className="flex flex-1 flex-col">
                <div className="flex h-28 items-center justify-center bg-[#F3E4F0]">
                  {course.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={course.coverUrl} alt={course.title} className="h-full w-full object-cover" />
                  ) : (
                    <PlayCircle className="h-9 w-9 text-[#5E2574]" />
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
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
