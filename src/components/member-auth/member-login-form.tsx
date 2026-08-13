"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

export function MemberLoginForm({
  saId,
  endpoint,
  extraBody,
  accentColor = "#202124",
  compact = false,
  resetNext,
}: {
  saId: string;
  endpoint: string;
  extraBody?: Record<string, string | undefined>;
  accentColor?: string;
  compact?: boolean;
  resetNext?: string;
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
        const data = await postJson(`/api/member-password/${saId}/request`, {
          email: email.trim(),
          next: resetNext,
        });
        setMessage(
          data.message ??
            "If that email belongs to an account, we'll send password instructions."
        );
        return;
      }

      const data = await postJson(endpoint, {
        email: email.trim(),
        ...(mode === "password" ? { password, mode: "password" } : {}),
        ...extraBody,
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

  return (
    <form
      onSubmit={handleSubmit}
      className={compact ? "text-left" : "mt-6 space-y-4"}
    >
      <div className={compact ? "" : "space-y-1.5"}>
        {!compact && (
          <label className="text-sm font-medium text-[#202124]">Email</label>
        )}
        <input
          type="email"
          autoComplete="email"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
          className={`${compact ? "mb-2.5 text-[13px]" : "text-sm"} h-10 w-full rounded-[9px] border border-[#E4E4E4] bg-white px-3 text-[#202124] outline-none placeholder:text-[#909090] focus-visible:ring-2 focus-visible:ring-offset-1`}
          style={
            accentColor
              ? ({ "--tw-ring-color": accentColor } as Record<string, string>)
              : undefined
          }
        />
      </div>

      {mode === "password" && (
        <div className={compact ? "" : "space-y-1.5"}>
          <div className="flex items-center justify-between gap-3">
            {!compact && (
              <label className="text-sm font-medium text-[#202124]">
                Password
              </label>
            )}
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError(null);
                setMessage(null);
              }}
              className={`${compact ? "mb-1.5" : ""} ml-auto text-[11px] font-medium text-[#909090] hover:text-[#202124]`}
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
            className={`${compact ? "mb-2.5 text-[13px]" : "text-sm"} h-10 w-full rounded-[9px] border border-[#E4E4E4] bg-white px-3 text-[#202124] outline-none placeholder:text-[#909090] focus-visible:ring-2 focus-visible:ring-offset-1`}
            style={
              accentColor
                ? ({ "--tw-ring-color": accentColor } as Record<string, string>)
                : undefined
            }
          />
        </div>
      )}

      {error && (
        <p
          className={
            compact ? "mb-2 text-[11px] text-red-600" : "text-xs text-red-600"
          }
        >
          {error}
        </p>
      )}
      {message && (
        <div
          className={`${compact ? "mb-2 p-3 text-[12px]" : "p-4 text-sm"} rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-[#202124]`}
        >
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className={`${compact ? "text-[13px]" : "text-sm"} flex w-full items-center justify-center gap-2 rounded-[9px] px-3 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60`}
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
              : "Send reset link"
            : submitting
              ? "Sending link..."
              : "Email me a sign-in link"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "password" ? "link" : "password");
          setError(null);
          setMessage(null);
        }}
        className={`${compact ? "mt-3.5 text-[10.5px]" : "mt-3 text-xs"} w-full text-center font-medium text-[#909090] hover:text-[#202124]`}
      >
        {mode === "password"
          ? "Sign in with email link"
          : "Back to password sign in"}
      </button>
    </form>
  );
}
