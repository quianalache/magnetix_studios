"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import type { CourseOffer } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";

/**
 * Agency Course Offers — owner list + create. The bundling/cross-sell
 * sibling of Agency Standalone Courses (see agency-course-offer-service.ts
 * for what's ported vs. genuinely excluded — no Booking/Project-Template
 * bundling, no One-Click Upsells, at agency scope).
 */
export default function AgencyCourseOffersPage() {
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const [offers, setOffers] = useState<CourseOffer[] | null>(null);
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);

  function refresh() {
    void fetch("/api/agency/course-offers")
      .then((r) => r.json())
      .then((d: { offers?: CourseOffer[] }) => setOffers(d.offers ?? []))
      .catch(() => setOffers([]));
  }

  useEffect(() => {
    if (!isOwner) return;
    refresh();
    void fetch("/api/agency/standalone-courses")
      .then((r) => r.json())
      .then((d: { courses?: StandaloneCourse[] }) => setCourses(d.courses ?? []))
      .catch(() => {});
  }, [isOwner]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Course Offers is managed by the agency owner.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Course Offers</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Bundle Standalone Courses into a single priced checkout.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/agency/standalone-courses">
            <Button size="sm" variant="outline">Standalone Courses</Button>
          </Link>
          <NewOfferDialog courses={courses} onCreated={refresh} />
        </div>
      </div>

      {!offers ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-[13px] text-muted-foreground">No offers yet. Bundle courses together to sell them as one product.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer: o }: { offer: CourseOffer }) {
  const price =
    o.type === "free"
      ? "Free"
      : o.priceCents != null
        ? formatCurrency(o.priceCents / 100, o.currency ?? "USD") + (o.type === "recurring" ? ` / ${o.recurringInterval ?? "month"}` : "")
        : "—";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <Link href={`/agency/course-offers/${o.id}`} className="block" aria-label={`Open ${o.title}`}>
        {o.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted text-xl font-semibold text-muted-foreground">
            {o.title.charAt(0).toUpperCase()}
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/agency/course-offers/${o.id}`} className="text-[13px] font-medium hover:underline">
            {o.title}
          </Link>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              o.visibility === "published" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
            )}
          >
            {o.visibility}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2.5 text-[12px] text-muted-foreground">
          <span>{o.courseIds.length} course{o.courseIds.length === 1 ? "" : "s"}</span>
          <span>{price}</span>
          <a href={`/offer/agency/${o.id}`} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 hover:text-foreground">
            View <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

function NewOfferDialog({ courses, onCreated }: { courses: StandaloneCourse[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function create() {
    if (!title.trim()) {
      toast.error("Name the offer first");
      return;
    }
    if (selected.length === 0) {
      toast.error("Select at least one course");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agency/course-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, courseIds: selected }),
      });
      if (!res.ok) throw new Error();
      setOpen(false);
      setTitle("");
      setSelected([]);
      onCreated();
      toast.success("Offer created.");
    } catch {
      toast.error("Couldn't create offer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary/90">
        <Plus className="h-3.5 w-3.5" /> New offer
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New Course Offer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Complete Bundle" />
          </div>
          <div className="space-y-1.5">
            <Label>Courses</Label>
            {courses.length === 0 ? (
              <p className="text-xs text-muted-foreground">Create a Standalone Course first.</p>
            ) : (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {courses.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                    {c.title}
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" className="w-full" onClick={create} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create offer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
