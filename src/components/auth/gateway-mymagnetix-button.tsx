"use client";

import { useState } from "react";

/**
 * 2026-09-01: the "MyMagnetix" choice on /gateway, for a staff identity
 * that hasn't separately signed into MyMagnetix yet (no mm_session/Person
 * session exists) — the common case for most staff, who never visit
 * /my/login directly. Rather than link straight to /my (which would just
 * bounce back to a login screen with nothing established), this uses the
 * exact same "switch to MyMagnetix" bridge the header's own control
 * already uses (/api/my/bridge-from-staff) to mint the session first,
 * then navigates.
 *
 * 2026-09-15 correction: a 404 here (this staff identity's linked Person
 * has no Member relationship anywhere yet) previously dead-ended with an
 * inline "nothing here" note and no way forward. That's not actually a
 * dead end — the person can still sign in through the normal MyMagnetix
 * login (password, or the existing email-link option) with THIS SAME
 * email; a real Member relationship just hasn't been linked to their
 * Person yet (see person-identity-service.ts's lazy-reconciliation
 * design). So a 404 now sends them to /my/login with this staff email
 * prefilled instead — never auto-creates a Person or grants anything on
 * its own, just removes the retyping step. Any OTHER failure (network,
 * unexpected error) still shows an inline retry message, since that one
 * genuinely isn't actionable by navigating anywhere.
 */
export function GatewayMyMagnetixButton({
  staffEmail,
}: {
  staffEmail: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my/bridge-from-staff", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirectTo?: string;
        error?: string;
      };
      if (res.ok && data.ok && data.redirectTo) {
        window.location.href = data.redirectTo;
        return;
      }
      if (res.status === 404) {
        window.location.href = `/my/login?email=${encodeURIComponent(staffEmail)}`;
        return;
      }
      setError(data.error ?? "Couldn't open MyMagnetix. Try again.");
    } catch {
      setError("Couldn't open MyMagnetix. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="w-full rounded-[9px] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: "#5E2574" }}
      >
        {loading ? "Loading…" : "MyMagnetix"}
      </button>
      {error && <p className="mt-2 text-xs text-[#909090]">{error}</p>}
    </div>
  );
}
