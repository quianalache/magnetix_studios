"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { CourseOffer } from "@/types/course-offers";
import type { StandaloneCourse } from "@/types/standalone-courses";

export function AgencyCourseOffersPanel() {
  const [offers, setOffers] = useState<CourseOffer[] | null>(null);
  const [courses, setCourses] = useState<StandaloneCourse[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    const [offerResponse, courseResponse] = await Promise.all([
      fetch("/api/agency/course-offers"),
      fetch("/api/agency/standalone-courses"),
    ]);
    const offerJson = (await offerResponse.json()) as { offers?: CourseOffer[] };
    const courseJson = (await courseResponse.json()) as { courses?: StandaloneCourse[] };
    setOffers((offerJson.offers ?? []).sort((a, b) => a.title.localeCompare(b.title)));
    setCourses((courseJson.courses ?? []).sort((a, b) => a.title.localeCompare(b.title)));
  }

  useEffect(() => { void refresh().catch(() => { setOffers([]); }); }, []);

  async function createOffer() {
    if (!title.trim() || selected.length === 0) {
      toast.error("Add a title and select at least one course.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/agency/course-offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, courseIds: selected }),
      });
      if (!response.ok) throw new Error();
      setDialogOpen(false); setTitle(""); setSelected([]); await refresh();
      toast.success("Offer created.");
    } catch { toast.error("Couldn’t create offer."); } finally { setSaving(false); }
  }

  return <>
    <div className="flex items-center justify-end"><Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-3.5 w-3.5" /> New offer</Button></div>
    {!offers ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : offers.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-[13px] text-muted-foreground">No offers yet. Bundle courses together to sell them as one product.</div> : <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{offers.map((offer) => { const price = offer.type === "free" ? "Free" : offer.priceCents == null ? "—" : `${formatCurrency(offer.priceCents / 100, offer.currency ?? "USD")}${offer.type === "recurring" ? ` / ${offer.recurringInterval ?? "month"}` : ""}`; return <div key={offer.id} className="flex flex-col overflow-hidden rounded-lg border bg-card"><Link href={`/agency/course-offers/${offer.id}`} className="flex aspect-video items-center justify-center bg-muted text-xl font-semibold text-muted-foreground">{offer.title.charAt(0).toUpperCase()}</Link><div className="flex flex-1 flex-col p-3"><div className="flex items-start justify-between gap-2"><Link href={`/agency/course-offers/${offer.id}`} className="text-[13px] font-medium hover:underline">{offer.title}</Link><span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase">{offer.visibility}</span></div><div className="mt-2 flex items-center gap-2.5 text-xs text-muted-foreground"><span>{offer.courseIds.length} course{offer.courseIds.length === 1 ? "" : "s"}</span><span>{price}</span><a href={`/offer/agency/${offer.id}`} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1">View <ExternalLink className="h-3 w-3" /></a></div></div></div>; })}</div>}
    {dialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-sm space-y-4 rounded-xl border bg-background p-5 shadow-xl"><h2 className="font-semibold">New Course Offer</h2><input className="h-9 w-full rounded-md border px-3 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Offer title" />{courses.length === 0 ? <p className="text-xs text-muted-foreground">Create a course first.</p> : <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">{courses.map((course) => <label key={course.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(course.id)} onChange={() => setSelected((current) => current.includes(course.id) ? current.filter((id) => id !== course.id) : [...current, course.id])} />{course.title}</label>)}</div>}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button><Button onClick={createOffer} disabled={saving}>{saving ? "Creating…" : "Create offer"}</Button></div></div></div>}
  </>;
}
