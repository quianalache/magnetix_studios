"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSubAccount } from "@/context/sub-account-context";
import { useAuth } from "@/hooks/use-auth";

type Outcome = "sell_offer" | "collect_leads" | "waitlist" | "registration" | "follow_up" | "something_else";
type Source = { id: string; name: string; visibility?: string; price?: string | number | null; slug?: string; status?: string };

const OUTCOMES: { value: Outcome; label: string; description: string }[] = [
  { value: "sell_offer", label: "Sell an offer", description: "Turn interest into a purchase." },
  { value: "collect_leads", label: "Collect leads", description: "Grow your list with a real Form." },
  { value: "waitlist", label: "Build a waitlist", description: "Create anticipation before launch." },
  { value: "registration", label: "Get registrations", description: "Fill a real Webinar or Event." },
  { value: "follow_up", label: "Follow up after an action", description: "Confirm and guide the next step." },
  { value: "something_else", label: "Something else", description: "Define one clear primary action." },
];

export function CreateWithAiFlow({ onCancel, onCreated, onChooseBlank, onChooseTemplate }: { onCancel: () => void; onCreated: (id: string) => void; onChooseBlank: () => void; onChooseTemplate: () => void }) {
  const { subAccountId } = useSubAccount();
  const { user } = useAuth();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [sources, setSources] = useState<{ forms: Source[]; offers: Source[]; webinars: Source[] }>({ forms: [], offers: [], webinars: [] });
  const [bindingId, setBindingId] = useState("");
  const [previousAction, setPreviousAction] = useState("form_submission");
  const [primaryAction, setPrimaryAction] = useState("");
  const [name, setName] = useState("New AI Page");
  const [prompt, setPrompt] = useState("");
  const [useBrain, setUseBrain] = useState(true);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/pages-funnels/ai`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setSources)
      .catch(() => toast.error("Couldn’t load your workspace sources."))
      .finally(() => setLoading(false));
  }, [subAccountId]);

  const sourceList = outcome === "sell_offer" ? sources.offers : outcome === "registration" ? sources.webinars : sources.forms;
  const requiresSource = outcome === "sell_offer" || outcome === "collect_leads" || outcome === "waitlist" || outcome === "registration";
  const canGenerate = !!user && !!outcome && !!name.trim() && (!requiresSource || !!bindingId) && (outcome !== "something_else" || !!primaryAction.trim()) && !generating;

  async function generate() {
    if (!canGenerate || !subAccountId) return;
    setGenerating(true);
    const binding = outcome === "something_else" ? { type: "primary_action", id: primaryAction.trim() } : outcome === "follow_up" ? { type: "previous_action", id: previousAction } : { type: outcome === "sell_offer" ? "offer" : outcome === "registration" ? "webinar" : "form", id: bindingId };
    try {
      const response = await fetch(`/api/sub-accounts/${subAccountId}/pages-funnels/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, outcome, binding, prompt, useBusinessBrain: useBrain }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Page generation failed.");
      toast.success("Draft created — opening the New Builder");
      onCreated(result.pageId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Page generation failed."); }
    finally { setGenerating(false); }
  }

  const selectedSource = useMemo(() => sourceList.find((item) => item.id === bindingId), [sourceList, bindingId]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1 text-xs font-medium"><ArrowLeft className="h-3 w-3" /> Pages & Funnels</button>
          <h1 {...{ className: "text-2xl font-bold tracking-tight" }}>Create with AI</h1>
          <p className="text-muted-foreground text-sm">Tell Magnetix what the page should do. You’ll get a normal editable draft.</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={onChooseTemplate}>Use a Template</Button><Button variant="outline" onClick={onChooseBlank}>Start Blank</Button></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5"><h2 className="mb-3 text-base font-semibold">What should this page do?</h2><div className="grid gap-3 sm:grid-cols-2">{OUTCOMES.map((item) => <button key={item.value} onClick={() => { setOutcome(item.value); setBindingId(""); }} className={cn("rounded-xl border p-4 text-left transition-colors", outcome === item.value ? "border-primary bg-primary/5" : "hover:border-primary/30")}><div className="flex items-start justify-between gap-2"><span className="font-semibold text-sm">{item.label}</span>{outcome === item.value && <Check className="text-primary h-4 w-4" />}</div><p className="text-muted-foreground mt-1 text-xs">{item.description}</p></button>)}</div></section>

          {outcome && <section className="rounded-2xl border bg-card p-5"><h2 className="mb-1 text-base font-semibold">{outcome === "sell_offer" ? "Which offer are you selling?" : outcome === "registration" ? "Which Webinar or Event?" : outcome === "something_else" ? "What is the ONE thing you want someone to do?" : outcome === "follow_up" ? "What happened immediately before this page?" : "Which Form should this page use?"}</h2><p className="text-muted-foreground mb-4 text-xs">Magnetix uses the real workspace object; AI cannot invent its destination or terms.</p>{outcome === "something_else" ? <Input value={primaryAction} onChange={(e) => setPrimaryAction(e.target.value.slice(0, 240))} placeholder="e.g. Book a clarity call" /> : outcome === "follow_up" ? <Select value={previousAction} onValueChange={(v) => v && setPreviousAction(v)} items={{ form_submission: "Form submission", offer_purchase: "Offer purchase", webinar_registration: "Webinar registration" }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="form_submission">Form submission</SelectItem><SelectItem value="offer_purchase">Offer purchase</SelectItem><SelectItem value="webinar_registration">Webinar registration</SelectItem></SelectContent></Select> : <Select value={bindingId || null} onValueChange={(v) => setBindingId(v ?? "")} items={Object.fromEntries(sourceList.map((item) => [item.id, `${item.name}${item.visibility === "draft" ? " (Draft)" : ""}`]))} disabled={loading}><SelectTrigger className="w-full"><SelectValue placeholder={loading ? "Loading workspace sources…" : `Select a real ${outcome === "sell_offer" ? "Offer" : outcome === "registration" ? "Webinar/Event" : "Form"}`} /></SelectTrigger><SelectContent>{sourceList.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}{item.visibility === "draft" ? " (Draft)" : ""}</SelectItem>)}</SelectContent></Select>}{selectedSource && <p className="text-muted-foreground mt-2 text-xs">Bound to: <span className="text-foreground font-medium">{selectedSource.name}</span></p>}</section>}

          {outcome && <section className="rounded-2xl border bg-card p-5"><Label htmlFor="ai-emphasis">{outcome === "something_else" ? "What should this page emphasize?" : "What should this page emphasize?"}</Label><Textarea id="ai-emphasis" value={prompt} onChange={(e) => setPrompt(e.target.value.slice(0, 4000))} className="mt-2 min-h-28" placeholder="Optional: focus on speed and simplicity, speak to experienced coaches, make this feel premium and direct…" /></section>}
        </div>

        <aside className="h-fit rounded-2xl border bg-card p-5 lg:sticky lg:top-6"><div className="mb-4 flex items-center gap-2"><Sparkles className="text-primary h-4 w-4" /><h2 className="font-semibold">Page setup</h2></div><div className="space-y-4"><div><Label htmlFor="ai-page-name">Page name</Label><Input id="ai-page-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} className="mt-1.5" /></div><label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3"><input type="checkbox" checked={useBrain} onChange={(e) => setUseBrain(e.target.checked)} className="mt-0.5" /><span><span className="block text-sm font-medium">Use Business Brain</span><span className="text-muted-foreground block text-xs">Uses only relevant Vision, Audience, Voice, Positioning, and bound context. Brand identity remains on either way.</span></span></label><div className="bg-primary/5 text-muted-foreground rounded-lg p-3 text-xs">Magnetix will create a Draft and open the existing New Builder. Nothing is published automatically.</div><Button className="w-full" onClick={generate} disabled={!canGenerate}>{generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating your draft…</> : <><Sparkles className="h-4 w-4" /> Generate Page</>}</Button></div></aside>
      </div>
    </div>
  );
}
