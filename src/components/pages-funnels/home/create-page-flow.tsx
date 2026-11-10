"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, LayoutTemplate, Loader2, Sparkles, SquareDashedMousePointer, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { createPage } from "@/lib/firestore/pages-funnels";
import { PAGE_TEMPLATES, getTemplate } from "@/lib/pages-funnels/templates";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { OptionSelect } from "@/components/system/option-select";
import { Tag } from "@/components/system/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreateWithAiFlow } from "@/components/pages-funnels/create-with-ai-flow";
import { PAGE_TYPE_ICONS } from "@/components/pages-funnels/home/page-type-icons";
import type { PageGoal, PageOrigin, PageType } from "@/types/pages-funnels";
import { PAGE_GOAL_LABELS, PAGE_TYPE_LABELS } from "@/types/pages-funnels";

/** The page types offered when creating a page (unchanged from the previous library). */
const PAGE_TYPE_TILES: { type: PageType; description: string }[] = [
  { type: "landing", description: "Grow your list with a free guide." },
  { type: "sales", description: "Sell your offer with a compelling page." },
  { type: "waitlist", description: "Build interest before launch day." },
  { type: "webinar", description: "Fill your webinar with a registration page." },
  { type: "checkout", description: "A secure checkout experience." },
  { type: "thank_you", description: "Deliver next steps after opt-in." },
  { type: "reading_result", description: "Show a person their Reading after they submit a Reading Tool." },
];
const GOAL_OPTIONS = (Object.keys(PAGE_GOAL_LABELS) as PageGoal[]).map((g) => ({ value: g, label: PAGE_GOAL_LABELS[g] }));

type CreateMethod = "blank" | "template" | "ai";

/**
 * Create Page — the existing three ways to start (Build with AI, Start
 * Blank, Use a Template), unchanged in behaviour. Fixes from the 2026-11
 * home redesign: the Page Setup panel (name, goal, Continue) is shown on
 * every screen size — it used to be hidden below 1024px, so Blank and
 * Template creation couldn't be finished on tablets and phones — and the
 * stale "Funnels are coming soon" field is gone (pages are added to funnels
 * from the funnel's own step list).
 */
export function CreatePageFlow({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const [method, setMethod] = useState<CreateMethod>("ai");
  const [pageType, setPageType] = useState<PageType>("landing");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("New Page");
  const [goal, setGoal] = useState<PageGoal>("lead_generation");
  const [creating, setCreating] = useState(false);

  if (method === "ai") {
    return (
      <CreateWithAiFlow onCancel={onCancel} onCreated={onCreated} onChooseBlank={() => setMethod("blank")} onChooseTemplate={() => setMethod("template")} />
    );
  }

  function pickPageType(type: PageType, opts?: { fromTemplate?: string }) {
    setPageType(type);
    // A Reading Result Page starts from its own ready-made New Builder layout.
    if (type === "reading_result") {
      setMethod("blank");
      setGoal("confirmation");
    }
    if (opts?.fromTemplate) {
      setMethod("template");
      setTemplateId(opts.fromTemplate);
      setName(getTemplate(opts.fromTemplate)?.name ?? PAGE_TYPE_LABELS[type]);
    } else {
      setTemplateId(null);
      setName(PAGE_TYPE_LABELS[type]);
    }
  }

  async function handleContinue() {
    if (!user || !agencyId || !name.trim() || creating) return;
    setCreating(true);
    try {
      const origin: PageOrigin = method === "template" ? "template" : "blank";
      const template = templateId ? getTemplate(templateId) : undefined;
      const id = await createPage({ agencyId, subAccountId }, user.uid, {
        name: name.trim(),
        pageType,
        goal,
        origin,
        templateId: templateId ?? null,
        blocks: template?.blocks(),
      });
      toast.success("Page created");
      onCreated(id);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't create the page. Try again.");
      setCreating(false);
    }
  }

  const selectedTemplate = templateId ? getTemplate(templateId) : undefined;

  return (
    <PageShell width="wide">
      <PageHeader
        breadcrumbs={
          <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 text-caption text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Pages &amp; Funnels
          </button>
        }
        title="Create a New Page"
        description="Choose how you want to start building."
      />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <MethodCard icon={SquareDashedMousePointer} title="Start Blank" description="Build from scratch with drag-and-drop blocks." selected={method === "blank"} onClick={() => setMethod("blank")} />
            <MethodCard icon={LayoutTemplate} title="Use a Template" description="Start from a proven page design and customize it." selected={method === "template"} onClick={() => setMethod("template")} />
            <MethodCard icon={Sparkles} title="Build with AI" description="Generate an editable first draft using Magnetix AI." selected={false} onClick={() => setMethod("ai")} />
          </div>

          <section aria-labelledby="create-type-heading" className="flex flex-col gap-3">
            <h2 id="create-type-heading" className="text-body font-semibold">What are you building?</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PAGE_TYPE_TILES.map((tile) => {
                const Icon = PAGE_TYPE_ICONS[tile.type];
                const on = pageType === tile.type && method !== "template";
                return (
                  <button
                    key={tile.type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickPageType(tile.type)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      on ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <Icon className="mt-0.5 size-4.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-body-sm font-semibold">{PAGE_TYPE_LABELS[tile.type]}</span>
                      <span className="text-caption text-muted-foreground">{tile.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="create-templates-heading" className="flex flex-col gap-3">
            <h2 id="create-templates-heading" className="text-body font-semibold">Popular Templates</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {PAGE_TEMPLATES.map((template) => {
                const on = templateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickPageType(template.pageType, { fromTemplate: template.id })}
                    className={cn(
                      "flex flex-col overflow-hidden rounded-xl border text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      on ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40",
                    )}
                  >
                    <span className="flex h-24 items-center justify-center bg-tint-violet text-primary">
                      <LayoutTemplate className="size-6" aria-hidden="true" />
                    </span>
                    <span className="flex flex-col gap-1 p-3">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-body-sm font-semibold">{template.name}</span>
                        {template.badge ? <Tag color="gray">{template.badge}</Tag> : null}
                      </span>
                      <span className="text-caption text-muted-foreground">{template.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Page Setup — visible at every width (below 1024px it follows the choices). */}
        <aside aria-labelledby="page-setup-heading" className="w-full shrink-0 rounded-card border border-border bg-card p-5 shadow-card lg:sticky lg:top-6 lg:w-80">
          <h2 id="page-setup-heading" className="text-body font-semibold">Page Setup</h2>
          <p className="mb-4 text-caption text-muted-foreground">
            {method === "template" && selectedTemplate ? `Template: ${selectedTemplate.name}` : `Type: ${PAGE_TYPE_LABELS[pageType]}`}
          </p>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-page-name">Page name</Label>
              <Input id="create-page-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              <p className="text-right text-caption text-muted-foreground">{name.length} / 60</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-page-goal">Goal</Label>
              <OptionSelect id="create-page-goal" aria-label="Goal" value={goal} onChange={(v) => v && setGoal(v)} options={GOAL_OPTIONS} />
            </div>
            <p className="rounded-lg bg-tint-violet p-3 text-caption text-muted-foreground">
              You can change everything after the page is created. To use the page in a funnel, add it from the funnel&apos;s steps.
            </p>
          </div>
          <Button className="mt-5 w-full" size="lg" onClick={handleContinue} disabled={creating || !name.trim()}>
            {creating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
            Continue
          </Button>
        </aside>
      </div>
    </PageShell>
  );
}

function MethodCard({ icon: Icon, title, description, selected, onClick }: { icon: LucideIcon; title: string; description: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:p-5",
        selected ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40",
      )}
    >
      {selected ? (
        <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" aria-hidden="true" />
        </span>
      ) : null}
      <span className="flex size-10 items-center justify-center rounded-lg bg-tint-violet text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="font-semibold">{title}</span>
      <span className="text-body-sm text-muted-foreground">{description}</span>
    </button>
  );
}
