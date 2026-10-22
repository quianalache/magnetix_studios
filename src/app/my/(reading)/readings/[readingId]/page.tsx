import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentPerson } from "@/lib/server/person-session";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { personOwnsReading } from "@/lib/server/reading-access";
import { buildReadingBlockContext } from "@/lib/server/reading-block-context";
import { MyMagnetixReadingView } from "@/components/mymagnetix/reading-view";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your Reading · MyMagnetix", robots: { index: false, follow: false } };

/**
 * A Reading's permanent home (2026-10-21). Signed-out visitors go to the
 * MyMagnetix sign-in with this Reading as the destination (kept outside the
 * (app) group for exactly that — its layout can't preserve a deep link).
 * Signed in, the person sees it only if their verified email is the
 * Reading's Contact email; anyone else gets a neutral "not yours" state,
 * never the Reading.
 */
export default async function MyMagnetixReadingPage({ params }: { params: Promise<{ readingId: string }> }) {
  const { readingId } = await params;
  const next = `/my/readings/${encodeURIComponent(readingId)}`;
  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(next)}`);
  if (!person.emailVerified) redirect(`/my/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(person.primaryEmail)}`);

  const raw = /^[A-Za-z0-9_-]{1,64}$/.test(readingId) ? await getAdminDb().doc(`energeticDecoderReadings/${readingId}`).get() : null;
  const subAccountId = raw?.exists ? (raw.get("subAccountId") as string) : null;
  const reading = subAccountId ? await getReadingById(subAccountId, readingId) : null;

  if (!reading || !(await personOwnsReading(person, reading))) return <NotYours />;

  const sub = (await getAdminDb().doc(`subAccounts/${reading.subAccountId}`).get()).data();
  const ctx = await buildReadingBlockContext({ subAccountId: reading.subAccountId, reading, mode: "live" });
  // Already home — no MyMagnetix button, no Reading Report detour.
  const pageCtx = { ...ctx, access: { ...ctx.access, myMagnetix: null, reportHref: null } };

  return <MyMagnetixReadingView ctx={pageCtx} businessName={(sub?.name as string) || "Magnetix"} />;
}

function NotYours() {
  return (
    <div className="min-h-screen bg-[#F5F4FB] px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-[#ECE9F5] bg-white p-6 text-center sm:p-8">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F4FB]">
          <Lock className="h-5 w-5 text-[#84809A]" />
        </span>
        <h1 className="text-lg font-semibold text-[#1D1B27]">We couldn’t open this Reading</h1>
        <p className="mt-2 text-sm text-[#84809A]">
          It isn’t linked to the email you’re signed in with. If it’s yours, sign in with the email you used when you got it.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/my/readings" className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1D1B27] px-4 py-2.5 text-sm font-semibold text-white">
            <ArrowLeft className="h-4 w-4" />
            My Readings
          </Link>
        </div>
      </div>
    </div>
  );
}
