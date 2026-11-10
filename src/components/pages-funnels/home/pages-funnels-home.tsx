"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, FileText, Filter, Plus, type LucideIcon } from "lucide-react";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";
import { CreateFunnelDialog } from "@/components/pages-funnels/home/create-funnel-dialog";
import { CreatePageFlow } from "@/components/pages-funnels/home/create-page-flow";
import { FunnelsView } from "@/components/pages-funnels/home/funnels-view";
import { PagesView } from "@/components/pages-funnels/home/pages-view";
import { usePagesLibrary } from "@/components/pages-funnels/home/use-pages-library";

type View = "pages" | "funnels";

/**
 * Pages & Funnels home (2026-11, owner-approved direction D1 = B): one
 * screen with a Pages view and a Funnels view and one shared Create menu.
 * State lives in the URL so links, Back and refresh keep it:
 *   ?view=funnels      the Funnels view (default: Pages)
 *   ?create=page       the Create Page flow (Build with AI / Blank / Template)
 * The old /pages-funnels/funnels address redirects to ?view=funnels.
 */
export function PagesFunnelsHome() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { saPath, isAdmin } = useSubAccount();
  const library = usePagesLibrary();
  const [funnelDialog, setFunnelDialog] = useState(false);

  const view: View = params.get("view") === "funnels" ? "funnels" : "pages";
  const creatingPage = params.get("create") === "page" && isAdmin;

  const go = (next: { view?: View; create?: "page" | null }, mode: "push" | "replace" = "push") => {
    const q = new URLSearchParams();
    const v = next.view ?? view;
    if (v === "funnels") q.set("view", "funnels");
    if (next.create) q.set("create", next.create);
    const url = q.toString() ? `${pathname}?${q}` : pathname;
    if (mode === "push") router.push(url, { scroll: true });
    else router.replace(url, { scroll: false });
  };

  if (creatingPage) {
    return <CreatePageFlow onCancel={() => go({ create: null }, "replace")} onCreated={(id) => router.push(saPath(`/pages-funnels/${id}/new-builder`))} />;
  }

  const createMenu = isAdmin ? (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        <Plus aria-hidden="true" /> Create <ChevronDown className="opacity-80" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5">
        <CreateItem icon={FileText} title="Create Page" description="A landing page, sales page or funnel step. Start with AI, blank or a template." onClick={() => go({ create: "page" })} />
        <CreateItem icon={Filter} title="Create Funnel" description="Put pages and a checkout in order. Starts with a Checkout step." onClick={() => setFunnelDialog(true)} />
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  return (
    <PageShell width="wide">
      <PageHeader title="Pages & Funnels" description="Build landing pages, sales pages, and funnel steps with the native visual editor." actions={createMenu} />

      <nav aria-label="Pages and funnels" className="flex w-fit max-w-full items-center gap-1 rounded-xl border border-border bg-background p-1">
        {(
          [
            { id: "pages", label: "Pages", icon: FileText, count: library.pagesState === "ready" ? library.pages.length : null },
            { id: "funnels", label: "Funnels", icon: Filter, count: library.libraryState === "ready" ? library.funnels.length : null },
          ] as const
        ).map((t) => {
          const on = view === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => !on && go({ view: t.id }, "replace")}
              className={cn(
                "flex h-(--ds-control-md) shrink-0 items-center gap-2 rounded-lg px-3.5 text-body-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                on ? "bg-accent font-semibold text-accent-foreground shadow-[inset_0_0_0_1px_var(--color-violet-ds-100)]" : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <t.icon className={cn("size-4", !on && "opacity-70")} aria-hidden="true" />
              {t.label}
              {t.count !== null ? <span className={cn("rounded-full px-1.5 text-caption tabular-nums", on ? "bg-card" : "bg-muted")}>{t.count}</span> : null}
            </button>
          );
        })}
      </nav>

      {view === "pages" ? (
        <PagesView pages={library.pages} pagesState={library.pagesState} funnels={library.funnels} usage={library.usage} onCreatePage={() => go({ create: "page" })} />
      ) : (
        <FunnelsView funnels={library.funnels} state={library.libraryState} onChanged={library.reloadLibrary} onCreateFunnel={() => setFunnelDialog(true)} />
      )}

      {isAdmin ? <CreateFunnelDialog open={funnelDialog} onOpenChange={setFunnelDialog} /> : null}
    </PageShell>
  );
}

function CreateItem({ icon: Icon, title, description, onClick }: { icon: LucideIcon; title: string; description: string; onClick: () => void }) {
  return (
    <DropdownMenuItem onClick={onClick} className="items-start gap-3 rounded-lg p-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-body-sm font-semibold text-foreground">{title}</span>
        <span className="text-caption whitespace-normal text-muted-foreground">{description}</span>
      </span>
    </DropdownMenuItem>
  );
}
