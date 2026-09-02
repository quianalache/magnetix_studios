import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { listReadingsForPerson } from "@/lib/server/mymagnetix-readings-service";
import { gradientForId } from "@/lib/mymagnetix/visuals";
import { MyMagnetixBackLink } from "@/components/mymagnetix/back-link";

export const dynamic = "force-dynamic";

/**
 * My Readings — Reading Ready loop (2026-08-26). The discovery surface a
 * customer needs once their Reading Ready notification has scrolled out
 * of the bell's bounded history (see notification-service.ts's own
 * "no infinite archive" note) — readings are durable, non-expiring
 * artifacts, unlike a booking's rotating token, so unlike booking this
 * pass genuinely needed a real list, not just the notification's own
 * click-through. Mirrors My Courses' structure (mymagnetix-service.ts's
 * Member-fan-out list pages) but reads from its own small service —
 * see mymagnetix-readings-service.ts for why.
 */
export default async function MyMagnetixReadingsPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");

  const readings = await listReadingsForPerson(person.id);

  return (
    <div className="mx-auto max-w-5xl">
      <MyMagnetixBackLink />
      <h1 className="text-[20px] font-bold text-[#1D1B27]">My Readings</h1>
      <p className="mt-1 text-[13px] text-[#84809A]">
        Every reading you&rsquo;ve generated, across every Magnetix business.
      </p>

      {readings.length === 0 ? (
        <p className="mt-6 text-[13px] text-[#909090]">No readings yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {readings.map((reading) => (
            <Link
              key={reading.readingId}
              href={reading.viewHref}
              className="flex flex-col overflow-hidden rounded-xl border border-[#ECE9F5] bg-white transition-transform hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className="flex h-20 items-end p-3"
                style={{ background: gradientForId(reading.readingId) }}
              >
                <span className="text-[15px] leading-tight font-extrabold text-white/95 uppercase">
                  {reading.readingName}
                </span>
              </div>
              <div className="p-3">
                <p className="truncate text-[13px] font-semibold text-[#1D1B27]">
                  {reading.readingName}
                </p>
                <p className="truncate text-[11px] text-[#8A87A0]">
                  {reading.businessName}
                </p>
                {reading.completedAt && (
                  <p className="mt-1.5 text-[11px] text-[#B4B0C6]">
                    {new Date(reading.completedAt).toLocaleDateString(
                      undefined,
                      { month: "short", day: "numeric", year: "numeric" }
                    )}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
