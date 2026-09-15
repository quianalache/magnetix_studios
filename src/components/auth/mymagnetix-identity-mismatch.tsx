"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Cross-identity session mismatch (2026-09-15 incident): the browser's
 * existing `mm_session` cookie belongs to a real, different MyMagnetix
 * Person than the one the currently-authenticated CRM staff login
 * actually resolves to — /gateway detected this server-side (see
 * resolveStaffPersonId in person-identity-service.ts) and renders THIS
 * instead of a bare "MyMagnetix" link that would silently cross into the
 * wrong account.
 *
 * Neither session is touched just by rendering this — both stay exactly
 * as they are until the person picks one of the two explicit actions:
 *   - "Continue as {mymagnetixEmail}" — a plain navigation into /my,
 *     unchanged from today's existing (correct, once there's no
 *     mismatch) behavior. The existing MyMagnetix session is untouched.
 *   - "Switch MyMagnetix account" — clears ONLY the mm_session cookie
 *     (/api/my/logout, which already deliberately never touches the
 *     Business Center __session — see that route's own doc comment),
 *     then sends them to /my/login with the CRM email prefilled so they
 *     can sign in as the correct Person (password or the email-link
 *     option already on that form) without retyping it.
 */
export function MyMagnetixIdentityMismatch({
  crmEmail,
  mymagnetixEmail,
}: {
  crmEmail: string;
  mymagnetixEmail: string;
}) {
  const [switching, setSwitching] = useState(false);

  async function handleSwitch() {
    setSwitching(true);
    try {
      await fetch("/api/my/logout", { method: "POST" });
    } catch {
      // Best-effort — even if the clear fails, /my/login below will still
      // show the form; a stale mm_session just means getCurrentPerson()
      // there would redirect straight back into /my as usual, so nothing
      // is unsafe about proceeding either way.
    }
    window.location.href = `/my/login?email=${encodeURIComponent(crmEmail)}`;
  }

  return (
    <div className="rounded-[9px] border border-[#E4E4E4] bg-white p-4 text-left">
      <p className="text-sm font-semibold text-[#202124]">
        MyMagnetix is signed in as a different account
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[#909090]">
        You are signed into Business Center as{" "}
        <span className="font-medium text-[#202124]">{crmEmail}</span>.
        MyMagnetix is currently signed in as{" "}
        <span className="font-medium text-[#202124]">{mymagnetixEmail}</span>.
        Which account would you like to use?
      </p>
      <div className="mt-3.5 flex flex-col gap-2">
        <Link
          href="/my"
          className="rounded-[9px] px-4 py-2.5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "#5E2574" }}
        >
          Continue as {mymagnetixEmail}
        </Link>
        <button
          type="button"
          onClick={() => void handleSwitch()}
          disabled={switching}
          className="rounded-[9px] border border-[#E4E4E4] px-4 py-2.5 text-sm font-semibold text-[#202124] transition-colors hover:border-[#5E2574] disabled:opacity-60"
        >
          {switching ? "Switching…" : "Switch MyMagnetix account"}
        </button>
      </div>
    </div>
  );
}
