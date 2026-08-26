"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Sparkles,
  LayoutTemplate,
  SquareDashedMousePointer,
  Rocket,
  DollarSign,
  Users,
  Presentation,
  ShoppingCart,
  CheckCircle2,
  MoreVertical,
  Pencil,
  ExternalLink,
  Copy,
  Trash2,
  Loader2,
  Check,
  FlaskConical,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToPages,
  createPage,
  deletePage,
  duplicatePage,
} from "@/lib/firestore/pages-funnels";
import { PAGE_TEMPLATES, getTemplate } from "@/lib/pages-funnels/templates";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type {
  PageDoc,
  PageGoal,
  PageOrigin,
  PageType,
} from "@/types/pages-funnels";
import { PAGE_GOAL_LABELS, PAGE_TYPE_LABELS } from "@/types/pages-funnels";

const PAGE_TYPE_TILES: {
  type: PageType;
  label: string;
  description: string;
  icon: typeof Rocket;
}[] = [
  {
    type: "landing",
    label: "Landing Page",
    description: "Grow your list with a free guide.",
    icon: Rocket,
  },
  {
    type: "sales",
    label: "Sales Page",
    description: "Sell your offer with a compelling page.",
    icon: DollarSign,
  },
  {
    type: "waitlist",
    label: "Waitlist Page",
    description: "Build interest before launch day.",
    icon: Users,
  },
  {
    type: "webinar",
    label: "Webinar Registration",
    description: "Fill your webinar with a registration page.",
    icon: Presentation,
  },
  {
    type: "checkout",
    label: "Checkout Page",
    description: "A secure checkout experience.",
    icon: ShoppingCart,
  },
  {
    type: "thank_you",
    label: "Thank You Page",
    description: "Deliver next steps after opt-in.",
    icon: CheckCircle2,
  },
];

type CreateMethod = "blank" | "template" | "ai";

export default function PagesFunnelsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const router = useRouter();

  const [pages, setPages] = useState<PageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"library" | "create">("library");

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setLoading(true);
    const unsub = subscribeToPages({ agencyId, subAccountId }, (list) => {
      setPages(list);
      setLoading(false);
    });
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  async function handleDelete(page: PageDoc) {
    if (!confirm(`Delete "${page.name}"? This can't be undone.`)) return;
    try {
      await deletePage(page.id);
      toast.success("Page deleted");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't delete page.");
    }
  }

  async function handleDuplicate(page: PageDoc) {
    if (!agencyId || !user) return;
    try {
      const id = await duplicatePage(
        { agencyId, subAccountId },
        user.uid,
        page
      );
      toast.success("Page duplicated");
      router.push(saPath(`/pages-funnels/${id}`));
    } catch (err) {
      console.error(err);
      toast.error("Couldn't duplicate page.");
    }
  }

  if (mode === "create") {
    return (
      <CreatePageFlow
        onCancel={() => setMode("library")}
        onCreated={(id) => router.push(saPath(`/pages-funnels/${id}`))}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pages & Funnels</h1>
          <p className="text-muted-foreground text-sm">
            Build landing pages, sales pages, and funnel steps with the native
            visual editor.
          </p>
        </div>
        <Button onClick={() => setMode("create")}>
          <Plus className="h-4 w-4" /> New Page
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : pages.length === 0 ? (
        <div className="mx-hero-gradient border-border flex flex-col items-center gap-3 rounded-2xl border bg-gradient-to-br from-rose-100 via-fuchsia-50 to-violet-100 p-12 text-center">
          <LayoutTemplate className="text-primary h-8 w-8" />
          <p className="text-base font-semibold">No pages yet</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Create your first landing page, sales page, or funnel step — start
            blank, from a template, or with AI.
          </p>
          <Button onClick={() => setMode("create")}>
            <Plus className="h-4 w-4" /> Create your first page
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((page) => (
            <PageCard
              key={page.id}
              page={page}
              editHref={saPath(`/pages-funnels/${page.id}`)}
              newBuilderHref={saPath(`/pages-funnels/${page.id}/new-builder`)}
              onDuplicate={() => handleDuplicate(page)}
              onDelete={() => handleDelete(page)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PageCard({
  page,
  editHref,
  newBuilderHref,
  onDuplicate,
  onDelete,
}: {
  page: PageDoc;
  editHref: string;
  newBuilderHref: string;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const updated = toDate(page.updatedAt);
  return (
    <div className="group border-border bg-card hover:border-primary/30 flex flex-col rounded-2xl border p-5 transition-all hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-500 to-purple-700 text-white">
          <FileText className="h-4.5 w-4.5" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <MoreVertical className="h-4 w-4" />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<a href={editHref} />}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <a href={`/p/${page.id}`} target="_blank" rel="noreferrer" />
              }
            >
              <ExternalLink className="h-3.5 w-3.5" /> Preview
            </DropdownMenuItem>
            {/* Phase 2A temporary testing entry point (master spec §6/§13,
                Phase 2A task §5) — the real, CRM-integrated, Magnetix-styled
                Puck editor, session-local safe-testing only. Not gated
                behind any admin/internal-user check: no such pattern exists
                elsewhere in this repo, this CRM currently has a single
                real user, and the entry is clearly labeled/non-destructive
                (reads the real page, writes nothing). Remove this item (and
                only this item) once Puck is approved for production
                cutover and V1's own "Edit" becomes the Puck editor. */}
            <DropdownMenuItem render={<a href={newBuilderHref} />}>
              <FlaskConical className="h-3.5 w-3.5" /> Try New Builder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <a href={editHref} className="mt-3">
        <h3 className="leading-snug font-semibold hover:underline">
          {page.name}
        </h3>
      </a>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Badge variant={page.status === "published" ? "default" : "secondary"}>
          {page.status === "published" ? "Published" : "Draft"}
        </Badge>
        <Badge variant="outline">{PAGE_TYPE_LABELS[page.pageType]}</Badge>
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        Edited {updated ? updated.toLocaleDateString() : "just now"}
      </p>
    </div>
  );
}

function CreatePageFlow({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();

  const [method, setMethod] = useState<CreateMethod>("blank");
  const [pageType, setPageType] = useState<PageType>("landing");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("New Page");
  const [goal, setGoal] = useState<PageGoal>("lead_generation");
  const [creating, setCreating] = useState(false);

  function pickPageType(type: PageType, opts?: { fromTemplate?: string }) {
    setPageType(type);
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
      toast.error("Couldn't create page. Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-6">
      <div className="min-w-0 flex-1 space-y-8">
        <div>
          <button
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground mb-3 text-xs font-medium"
          >
            ← Pages & Funnels
          </button>
          <h1 className="text-2xl font-bold tracking-tight">
            Create a New Page
          </h1>
          <p className="text-muted-foreground text-sm">
            Choose how you want to start building.
          </p>
        </div>

        {/* Start Blank / Use a Template / Build with AI */}
        <div className="grid gap-4 sm:grid-cols-3">
          <MethodCard
            icon={SquareDashedMousePointer}
            title="Start Blank"
            description="Build from scratch with drag-and-drop blocks."
            selected={method === "blank"}
            onClick={() => setMethod("blank")}
          />
          <MethodCard
            icon={LayoutTemplate}
            title="Use a Template"
            description="Start from a proven page design and customize it."
            selected={method === "template"}
            onClick={() => setMethod("template")}
          />
          <MethodCard
            icon={Sparkles}
            title="Build with AI"
            description="Generate an editable first draft using Magnetix AI."
            selected={false}
            disabled
            badge="Coming soon"
            onClick={() => toast("Build with AI is coming soon.")}
          />
        </div>

        {/* What are you building? */}
        <div>
          <h2 className="mb-3 text-base font-semibold">
            What are you building?
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PAGE_TYPE_TILES.map((tile) => (
              <button
                key={tile.type}
                onClick={() => pickPageType(tile.type)}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                  pageType === tile.type && method !== "template"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/30"
                )}
              >
                <tile.icon className="text-primary mt-0.5 h-4.5 w-4.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">{tile.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {tile.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Popular Templates */}
        <div>
          <h2 className="mb-3 text-base font-semibold">Popular Templates</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PAGE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() =>
                  pickPageType(template.pageType, { fromTemplate: template.id })
                }
                className={cn(
                  "flex flex-col overflow-hidden rounded-xl border text-left transition-colors",
                  templateId === template.id
                    ? "border-primary ring-primary ring-1"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="mx-wash-gradient text-primary flex h-28 items-center justify-center bg-gradient-to-br from-rose-100 to-violet-100">
                  <LayoutTemplate className="h-6 w-6" />
                </div>
                <div className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{template.name}</p>
                    {template.badge && (
                      <Badge variant="secondary">{template.badge}</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {template.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Page Setup */}
      <div className="hidden w-[340px] shrink-0 lg:block">
        <div className="border-border bg-card sticky top-6 rounded-2xl border p-5">
          <h2 className="text-base font-semibold">Page Setup</h2>
          <p className="text-muted-foreground mb-4 text-xs">
            Configure the basics for your new page.
          </p>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Page Name
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
              <p className="text-muted-foreground text-right text-[11px]">
                {name.length} / 60
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Funnel
              </Label>
              <select
                disabled
                className="border-input bg-muted text-muted-foreground h-9 w-full rounded-md border px-2 text-sm"
              >
                <option>New Funnel</option>
              </select>
              <p className="text-muted-foreground text-[11px]">
                Funnels are coming soon — this page stands alone for now.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Goal
              </Label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as PageGoal)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {Object.entries(PAGE_GOAL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-primary/20 bg-primary/5 text-foreground/80 rounded-lg border p-3 text-xs">
              <p className="text-primary mb-1 flex items-center gap-1.5 font-semibold">
                <Sparkles className="h-3.5 w-3.5" /> Pro tip
              </p>
              You can customize all settings and content after your page is
              created.
            </div>
          </div>

          <Button
            className="mt-5 w-full"
            onClick={handleContinue}
            disabled={creating || !name.trim()}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

function MethodCard({
  icon: Icon,
  title,
  description,
  selected,
  disabled,
  badge,
  onClick,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start gap-2 rounded-xl border p-5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary/30",
        disabled && "opacity-80"
      )}
    >
      {badge && (
        <span className="bg-muted text-muted-foreground absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
          {badge}
        </span>
      )}
      {selected && (
        <span className="bg-primary text-primary-foreground absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full">
          <Check className="h-3 w-3" />
        </span>
      )}
      <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-lg">
        <Icon className="h-5 w-5" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground text-sm">{description}</p>
    </button>
  );
}
