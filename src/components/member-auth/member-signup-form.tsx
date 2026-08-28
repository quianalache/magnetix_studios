"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

export function MemberSignupForm({
  saId,
  groupId,
  inviteRef,
  accentColor,
  loginHref,
}: {
  saId: string;
  groupId: string;
  inviteRef?: string;
  accentColor: string;
  loginHref: string;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/community/${saId}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          email: email.trim(),
          join: groupId,
          ref: inviteRef,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Couldn't create your account.");
      setMessage(data.message ?? "Check your email to finish joining.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't create your account."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-[#202124]"
            htmlFor="member-name"
          >
            Name
          </label>
          <input
            id="member-name"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Your name"
            maxLength={120}
            required
            className="h-10 w-full rounded-[9px] border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] outline-none placeholder:text-[#909090] focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{ "--tw-ring-color": accentColor } as Record<string, string>}
          />
        </div>
        <div className="space-y-1.5">
          <label
            className="text-sm font-medium text-[#202124]"
            htmlFor="member-email"
          >
            Email
          </label>
          <input
            id="member-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            className="h-10 w-full rounded-[9px] border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] outline-none placeholder:text-[#909090] focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{ "--tw-ring-color": accentColor } as Record<string, string>}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {message && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-[#202124]">
            {message}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-[9px] px-3 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: accentColor }}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Sending link..." : "Create member account"}
        </button>
      </form>
      <p className="mt-5 text-center text-xs text-[#909090]">
        Already have an account?{" "}
        <a
          href={loginHref}
          className="font-medium text-[#202124] underline underline-offset-2"
        >
          Log in
        </a>
      </p>
    </>
  );
}
