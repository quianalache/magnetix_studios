"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The registration form — same request and responses as before; only the presentation moved onto the tenant surface. */
export function WebinarRegistrationForm({ subAccountId, webinarSlug }: { subAccountId: string; webinarSlug: string }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ title: string; joinUrl: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const res = await fetch(`/api/webinar/${subAccountId}/${webinarSlug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Unable to register.");
        return;
      }
      setResult({ title: data.webinar.title, joinUrl: data.joinUrl });
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <span className="public-tone-success flex size-11 items-center justify-center rounded-full">
          <CalendarCheck className="size-5" aria-hidden="true" />
        </span>
        <p className="public-ink text-base font-semibold">You&rsquo;re registered</p>
        <p className="public-body text-sm leading-relaxed">The join button becomes available when the webinar is live. Keep this link to join when the host starts.</p>
        <a href={result.joinUrl} className="tenant-button mt-1 inline-flex h-11 w-full items-center justify-center border px-5 text-sm font-semibold">
          Open secure join page
        </a>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="webinar-first">First name</Label>
          <Input id="webinar-first" required autoComplete="given-name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="webinar-last">Last name</Label>
          <Input id="webinar-last" required autoComplete="family-name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="webinar-email">Email</Label>
        <Input id="webinar-email" required type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      {message && (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
      <button type="submit" disabled={busy} className="tenant-button inline-flex h-11 w-full items-center justify-center border px-5 text-sm font-semibold disabled:opacity-60">
        {busy ? "Registering…" : "Register"}
      </button>
    </form>
  );
}
