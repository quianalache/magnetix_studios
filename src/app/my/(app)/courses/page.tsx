import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import {
  listPersonMemberships,
  listCoursesForPerson,
  listPinnedKeys,
} from "@/lib/server/mymagnetix-service";
import { gradientForId } from "@/lib/mymagnetix/visuals";
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
      <h1 className="text-[20px] font-bold text-[#1D1B27]">My Courses</h1>
      <p className="mt-1 text-[13px] text-[#84809A]">
        Every course you&rsquo;re enrolled in, across every Magnetix business.
      </p>

      {sorted.length === 0 ? (
        <p className="mt-6 text-[13px] text-[#909090]">No courses yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((course) => {
            const key = `${course.subAccountId}:${course.courseId}`;
            return (
              <div
                key={key}
                className="relative flex flex-col overflow-hidden rounded-xl border border-[#ECE9F5] bg-white transition-transform hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="absolute top-2 right-2 z-10 rounded-full bg-white/85">
                  <PinButton
                    pinKey={course.pinKey}
                    initialPinned={pinned.has(course.pinKey)}
                  />
                </div>
                <Link href={course.enterHref} className="flex flex-1 flex-col">
                  <div
                    className="relative flex h-28 items-end p-3"
                    style={{
                      background: course.coverUrl
                        ? undefined
                        : gradientForId(key),
                    }}
                  >
                    {course.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={course.coverUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span className="relative text-[15px] leading-tight font-extrabold text-white/95 uppercase">
                        {course.title}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-[13px] font-semibold text-[#1D1B27]">
                      {course.title}
                    </p>
                    <p className="truncate text-[11px] text-[#8A87A0]">
                      {course.businessName}
                    </p>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F0EEF7]">
                      <div
                        className="h-full rounded-full bg-[#5E2574]"
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
