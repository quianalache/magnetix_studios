"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

type LoginMode = "password" | "link" | "reset";

/**
 * The secondary action shown below the primary submit button, per mode.
 * Owner QA (2026-09-15): the email-link option must be a permanently
 * visible, obviously-interactive secondary CTA on the normal password
 * view — NOT something discovered only after a failed password attempt,
 * and NOT hidden inside clickable text inside an error message (the prior
 * fix, 2026-09-14, made the error's own wording clickable; this replaces
 * that pattern entirely per this task's explicit instruction not to
 * maintain two competing interaction patterns).
 */
const SECONDARY_ACTION: Record<
  LoginMode,
  { label: string; nextMode: LoginMode }
> = {
  password: { label: "Email me a sign-in link", nextMode: "link" },
  link: { label: "Use password instead", nextMode: "password" },
  reset: { label: "Back to password sign in", nextMode: "password" },
};

/**
 * MyMagnetix global sign-in form. Deliberate visual/behavioral sibling of
 * `MemberLoginForm` (same password-first + magic-link-fallback pattern the
 * owner already approved for the Client Portal), pointed at the global
 * `/api/my/*` endpoints instead of a sub-account-scoped one.
 */
export function PersonLoginForm({
  accentColor = "#5E2574",
  next,
  initialMode = "password",
}: {
  accentColor?: string;
  /** Where to land after sign-in — a specific course/community/etc. from a
   *  deep link, already validated server-side by the page that rendered
   *  this form. Threaded into both the password and magic-link paths so
   *  neither one ever strands the person on the generic gateway. */
  next?: string | null;
  /** Test-only escape hatch: every real caller renders the default
   *  ("password") and reaches the other modes exclusively via the secondary
   *  button click, exactly like a real user — this just lets
   *  scripts/test-mymagnetix-login-ux.tsx render "link" and "reset" mode's
   *  actual output directly, without a DOM to click through. */
  initialMode?: LoginMode;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchMode(nextMode: LoginMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

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
    if (!res.ok)
      throw new Error(data.error ?? "Something went wrong. Try again.");
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
        const data = await postJson("/api/my/password/request", {
          email: email.trim(),
        });
        setMessage(
          data.message ??
            "If that email belongs to a MyMagnetix account, we'll send password instructions."
        );
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
          : "Signed in."
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const secondary = SECONDARY_ACTION[mode];

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label className="text-foreground text-sm font-medium">Email</label>
        <input
          type="email"
          autoComplete="email"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          className="border-border text-foreground placeholder:text-muted-foreground h-10 w-full rounded-[9px] border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{ "--tw-ring-color": accentColor } as Record<string, string>}
        />
      </div>

      {mode === "password" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <label className="text-foreground text-sm font-medium">
              Password
            </label>
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="text-muted-foreground hover:text-foreground ml-auto text-[11px] font-medium"
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
            className="border-border text-foreground placeholder:text-muted-foreground h-10 w-full rounded-[9px] border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{ "--tw-ring-color": accentColor } as Record<string, string>}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && (
        <div className="text-foreground rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
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
          ? submitting
            ? "Signing in..."
            : "Sign in"
          : mode === "reset"
            ? submitting
              ? "Sending..."
              : "Send password link"
            : submitting
              ? "Sending link..."
              : "Email me a sign-in link"}
      </button>

      {/* Permanently visible secondary action — this is the ONLY way the
       *  email-link option is discoverable now; it must look like a real,
       *  clickable button, not a muted afterthought, and it must be here
       *  on every render of this mode, not conditional on an error. */}
      <button
        type="button"
        onClick={() => switchMode(secondary.nextMode)}
        className="border-border text-foreground hover:bg-muted flex w-full items-center justify-center rounded-[9px] border px-3 py-2.5 text-sm font-semibold transition-colors"
      >
        {secondary.label}
      </button>
    </form>
  );
}
