"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

export function PersonResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/my/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not set password.");
      }
      window.location.href = data.redirectTo ?? "/gateway";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[#202124]">New password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          className="h-10 w-full rounded-[9px] border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
        />
        <p className="text-[11px] text-[#909090]">At least 8 characters.</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-[#202124]">Confirm password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={8}
          required
          className="h-10 w-full rounded-[9px] border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="flex w-full items-center justify-center gap-2 rounded-[9px] bg-[#5E2574] px-3 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Saving..." : "Save password"}
      </button>
    </form>
  );
}
