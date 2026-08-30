"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Video, Plus, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Webinar } from "@/types/webinar";
import { validateWebinarSchedule } from "@/lib/webinar/scheduling";

function dateLabel(value: number | null) {
  return value ? new Date(value).toLocaleString() : "—";
}
export default function WebinarsPage() {
  const { subAccountId, saPath, isAdmin } = useSubAccount();
  const [items, setItems] = useState<Webinar[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    startAt: "",
    endAt: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/sub-accounts/${subAccountId}/webinars`);
    const data = await res.json();
    setItems(data.webinars ?? []);
    setLoading(false);
  }, [subAccountId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create() {
    setError("");
    const schedule = validateWebinarSchedule(form);
    if (!schedule.ok) {
      setError(schedule.error);
      return;
    }
    const res = await fetch(`/api/sub-accounts/${subAccountId}/webinars`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Unable to create webinar.");
      return;
    }
    setOpen(false);
    setForm({
      title: "",
      description: "",
      startAt: "",
      endAt: "",
      timezone: form.timezone,
    });
    void load();
  }
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Video className="h-6 w-6" /> Webinars
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Schedule a live webinar powered by Magnetix Live.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New webinar
          </Button>
        )}
      </div>
      {loading ? (
        <Loader2 className="mx-auto animate-spin" />
      ) : items.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-12 text-center text-sm">
          No webinars yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((w) => (
            <Link
              key={w.id}
              href={saPath(`/webinars/${w.id}`)}
              className="bg-card hover:border-primary rounded-xl border p-5 transition"
            >
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{w.title}</h2>
                <span className="bg-muted rounded-full px-2 py-1 text-xs">
                  {w.status}
                </span>
              </div>
              <p className="text-muted-foreground mt-2 line-clamp-2 text-sm">
                {w.description || "No description"}
              </p>
              <p className="text-muted-foreground mt-4 text-xs">
                {dateLabel(w.startAt as unknown as number)}
              </p>
            </Link>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-background w-full max-w-lg space-y-4 rounded-xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Create live webinar</h2>
            <div>
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Starts</Label>
                <Input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) =>
                    setForm({ ...form, startAt: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Ends</Label>
                <Input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Timezone: {form.timezone}. Attendees join as viewers; the host can
              manage the LiveSession from the webinar detail page.
            </p>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void create()}>Create webinar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
