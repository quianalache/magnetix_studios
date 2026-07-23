"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PurchaseButton } from "@/components/community/purchase-button";

/**
 * Sales-page CTA. Behavior depends on the viewer:
 *  - not signed in → link to course login (carries `course` so verify
 *    redirects back here — no auto-enroll/purchase side effect on verify,
 *    the buyer completes the action themselves after signing in)
 *  - signed in, "open" access → POSTs enroll, then enters the classroom
 *  - signed in, "purchase" access → the generalized PurchaseButton
 */
export function EnrollButton({
  saId,
  courseId,
  access,
  signedIn,
  priceLabel,
  brand,
}: {
  saId: string;
  courseId: string;
  access: "open" | "purchase";
  signedIn: boolean;
  priceLabel: string;
  brand: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base =
    "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold text-white disabled:opacity-60";

  if (!signedIn) {
    return (
      <a
        href={`/course/${saId}/login?course=${courseId}`}
        className={base}
        style={{ backgroundColor: brand }}
      >
        {access === "purchase" ? `Enroll Now — ${priceLabel}` : "Enroll Now"}
      </a>
    );
  }

  if (access === "purchase") {
    return (
      <PurchaseButton
        endpoint={`/api/course/${saId}/${courseId}/purchase`}
        label={`Enroll Now — ${priceLabel}`}
        brand={brand}
        className={base}
      />
    );
  }

  async function enroll() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/course/${saId}/${courseId}/enroll`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      router.push(`/course/${saId}/${courseId}/classroom`);
    } catch {
      setError("Couldn't enroll. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <button
        onClick={enroll}
        disabled={busy}
        className={base}
        style={{ backgroundColor: brand }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Enroll Now
      </button>
      {error && <p className="text-center text-xs text-destructive">{error}</p>}
    </div>
  );
}
