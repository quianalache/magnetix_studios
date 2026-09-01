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
 * then navigates. A 404 there is not an error — it means this staff
 * identity genuinely has no MyMagnetix relationships anywhere yet, shown
 * as a small inline note rather than a dead link or a confusing crash.
 */
export function GatewayMyMagnetixButton() {
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
      setError(
        res.status === 404
          ? "Nothing in MyMagnetix for this account yet."
          : (data.error ?? "Couldn't open MyMagnetix. Try again."),
      );
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
