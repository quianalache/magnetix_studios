import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { listReadingsForPerson } from "@/lib/server/mymagnetix-readings-service";
import { MailCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { TileCover } from "@/components/mymagnetix/tile-cover";
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

  // Readings are linked by email, so they stay hidden until an instant
  // sign-up has proven it owns that email.
  const readings = person.emailVerified ? await listReadingsForPerson(person.id) : [];

  return (
    <div className="mx-auto max-w-5xl">
      <MyMagnetixBackLink />
      <PageHeader title="My Readings" description="Every reading you&rsquo;ve generated, across every Magnetix business." />

      {!person.emailVerified ? (
        <EmptyState
          className="mt-6"
          icon={MailCheck}
          title="Confirm your email to see your Readings"
          description="Readings are linked to your email address, so they stay private until you confirm it."
          action={
            <Button render={<Link href="/my/login?next=/my/readings" />}>Email me a sign-in link</Button>
          }
        />
      ) : readings.length === 0 ? (
        <EmptyState className="mt-6" icon={Sparkles} title="No Readings yet" description="When a Magnetix business creates a Reading for you, it appears here." />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {readings.map((reading) => (
            <Link
              key={reading.readingId}
              href={reading.viewHref}
              className="flex flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-pop"
            >
              <TileCover id={reading.readingId} icon={Sparkles} className="h-20" />
              <div className="p-3">
                <p className="truncate text-body-sm font-semibold text-foreground">
                  {reading.readingName}
                </p>
                <p className="truncate text-micro text-muted-foreground">
                  {reading.businessName}
                </p>
                {reading.completedAt && (
                  <p className="mt-1.5 text-micro text-muted-foreground">
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
