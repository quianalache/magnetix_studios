"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

/**
 * MyMagnetix global sign-in form. Deliberate visual/behavioral sibling of
 * `MemberLoginForm` (same password-first + magic-link-fallback pattern the
 * owner already approved for the Client Portal), pointed at the global
 * `/api/my/*` endpoints instead of a sub-account-scoped one.
 */
export function PersonLoginForm({
  accentColor = "#5E2574",
  next,
}: {
  accentColor?: string;
  /** Where to land after sign-in — a specific course/community/etc. from a
   *  deep link, already validated server-side by the page that rendered
   *  this form. Threaded into both the password and magic-link paths so
   *  neither one ever strands the person on the generic gateway. */
  next?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link" | "reset">("password");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function postJson(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
      redirectTo?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
    return data;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!email.trim()) {
      setError("Enter your email.");
      return;
    }
    if (mode === "password" && !password) {
      setError("Enter your password.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "reset") {
        const data = await postJson("/api/my/password/request", { email: email.trim() });
        setMessage(data.message ?? "If that email belongs to a MyMagnetix account, we'll send password instructions.");
        return;
      }

      const data = await postJson("/api/my/login", {
        email: email.trim(),
        ...(mode === "password" ? { password, mode: "password" } : {}),
        ...(next ? { next } : {}),
      });
      if (mode === "password" && data.redirectTo) {
        window.location.href = data.redirectTo;
        return;
      }
      setMessage(
        mode === "link"
          ? "If that email is valid, we've sent a sign-in link. The link expires in 15 minutes."
          : "Signed in.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Email</label>
        <input
          type="email"
          autoComplete="email"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          className="h-10 w-full rounded-[9px] border border-border bg-white px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{ "--tw-ring-color": accentColor } as Record<string, string>}
        />
      </div>

      {mode === "password" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-foreground">Password</label>
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError(null);
                setMessage(null);
              }}
              className="ml-auto text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </button>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="h-10 w-full rounded-[9px] border border-border bg-white px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{ "--tw-ring-color": accentColor } as Record<string, string>}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-foreground">
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
        {mode === "password"
          ? submitting ? "Signing in..." : "Sign in"
          : mode === "reset"
            ? submitting ? "Sending..." : "Send password link"
            : submitting ? "Sending link..." : "Email me a sign-in link"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "password" ? "link" : "password");
          setError(null);
          setMessage(null);
        }}
        className="mt-3 w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {mode === "password" ? "Sign in with email link" : "Back to password sign in"}
      </button>
    </form>
  );
}
