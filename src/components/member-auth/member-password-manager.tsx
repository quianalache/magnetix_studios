"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function MemberPasswordManager({
  saId,
  hasPassword,
}: {
  saId: string;
  hasPassword: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/member-password/${saId}/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : undefined,
          newPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save password.");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success(hasPassword ? "Password changed" : "Password set");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save password."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-[#E4E4E4] bg-white p-6">
      <h2 className="text-lg font-semibold text-[#202124]">
        {hasPassword ? "Change password" : "Set password"}
      </h2>
      <p className="mt-1 text-sm text-[#909090]">
        {hasPassword
          ? "Update the password you use for Portal, Community, and Courses."
          : "Create a password for faster future sign-ins across Portal, Community, and Courses."}
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {hasPassword && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#202124]">
              Current password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#202124]">
            New password
          </label>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
          />
          <p className="text-[11px] text-[#909090]">At least 8 characters.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-[#202124]">
            Confirm password
          </label>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-[#E4E4E4] bg-white px-3 text-sm text-[#202124] outline-none placeholder:text-[#909090]"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-md bg-[#202124] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving
              ? "Saving..."
              : hasPassword
                ? "Change password"
                : "Set password"}
          </button>
        </div>
      </form>
    </div>
  );
}
