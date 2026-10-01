"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 45_000;

/** Agency Standalone Course sibling of the tenant purchase-complete
 *  status poller — same polling behavior, agency-scoped API path. */
export function AgencyPurchaseCompleteStatus({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/course/agency/${courseId}/purchase-status`);
        const data = (await res.json().catch(() => ({}))) as { paid?: boolean };
        if (cancelled) return;
        if (data.paid) {
          router.push(`/course/agency/${courseId}/classroom`);
          return;
        }
      } catch {
        // Transient network blip — keep polling until the timeout.
      }
      if (cancelled) return;
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [courseId, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F7F5] px-4">
      <div className="max-w-sm space-y-3 rounded-xl border border-[#E4E4E4] bg-white p-6 text-center shadow-sm">
        {timedOut ? (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-[#909090]" />
            <p className="text-sm font-medium text-[#202124]">Payment received — finishing up</p>
            <p className="text-xs text-[#909090]">This is taking longer than usual. Refresh in a moment, or check your email — access unlocks automatically.</p>
            <button onClick={() => window.location.reload()} className="text-sm font-medium text-[#202124] underline">
              Refresh
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#202124]" />
            <p className="text-sm font-medium text-[#202124]">Payment received — unlocking your course</p>
            <p className="text-xs text-[#909090]">Just a moment…</p>
          </>
        )}
      </div>
    </div>
  );
}
