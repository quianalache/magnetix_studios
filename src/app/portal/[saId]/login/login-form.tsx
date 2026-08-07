"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

export function PortalLoginForm({ saId, accentColor }: { saId: string; accentColor?: string }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter your email");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/${saId}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-left text-[12px] text-[#202124]">
        <p className="font-semibold">Check your inbox.</p>
        <p className="mt-1 text-[#909090]">
          If that email is valid, we&apos;ve sent a one-tap sign-in link to{" "}
          <span className="font-medium text-[#202124]">{email.trim()}</span>. The
          link expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="text-left">
      <input
        id="email"
        type="email"
        autoComplete="email"
        aria-label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        autoFocus
        className="mb-2.5 w-full rounded-[9px] border border-[#E4E4E4] bg-white px-3 py-2.5 text-[13px] text-[#202124] outline-none placeholder:text-[#909090] focus-visible:ring-2 focus-visible:ring-offset-1"
        style={accentColor ? ({ "--tw-ring-color": accentColor } as Record<string, string>) : undefined}
      />
      {error && <p className="mb-2 text-[11px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-[9px] px-3 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: accentColor || "#202124" }}
      >
        {submitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Sending link…
          </>
        ) : (
          "Send sign-in link"
        )}
      </button>
      <p className="mt-3.5 text-center text-[10.5px] leading-relaxed text-[#909090]">
        No password needed — we&apos;ll email you a one-time sign-in link.
      </p>
    </form>
  );
}
