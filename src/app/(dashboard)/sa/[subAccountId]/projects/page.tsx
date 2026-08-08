"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderKanban, Plus, LayoutTemplate, Package, Archive } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import {
  subscribeToProjects,
  subscribeToProjectTemplates,
} from "@/lib/firestore/projects";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { TemplateDialog } from "@/components/projects/template-dialog";
import { AssetsTab } from "@/components/projects/assets-tab";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contacts";
import type { Project, ProjectTemplate } from "@/types/projects";

type ProjectTab = "active" | "templates" | "assets" | "archived";

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProjectTab>("active");

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ProjectTemplate | null>(null);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let projectsReady = false;
    let templatesReady = false;
    let contactsReady = false;
    const settle = () => {
      if (projectsReady && templatesReady && contactsReady) setLoading(false);
    };
    const unsubP = subscribeToProjects(scope, (l) => {
      setProjects(l);
      projectsReady = true;
      settle();
    });
    const unsubT = subscribeToProjectTemplates(scope, (l) => {
      setTemplates(l);
      templatesReady = true;
      settle();
    });
    const unsubC = subscribeToContacts(scope, (l) => {
      setContacts(l);
      contactsReady = true;
      settle();
    });
    return () => {
      unsubP();
      unsubT();
      unsubC();
    };
  }, [user, agencyId, subAccountId, authLoading]);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === "active"),
    [projects],
  );
  const archivedProjects = useMemo(
    () => projects.filter((p) => p.status === "archived"),
    [projects],
  );

  function openNewProject() {
    setEditProject(null);
    setProjectDialogOpen(true);
  }
  function openEditProject(p: Project) {
    setEditProject(p);
    setProjectDialogOpen(true);
  }
  function openNewTemplate() {
    setEditTemplate(null);
    setTemplateDialogOpen(true);
  }
  function openEditTemplate(t: ProjectTemplate) {
    setEditTemplate(t);
    setTemplateDialogOpen(true);
  }

  // Locked-in pattern from Growth (2026-08-08): momentum-scope on the root
  // wrapper + plain text-primary icons (never per-tab hue) + rounded-full
  // bg-muted pill container with hover:bg-background/60. Same rules, same
  // reasons — see Growth's own comments for the real-markup sourcing.
  const TABS: { id: ProjectTab; label: string; count?: number; icon: typeof FolderKanban }[] = [
    { id: "active", label: "Active Projects", count: activeProjects.length, icon: FolderKanban },
    { id: "templates", label: "Templates", icon: LayoutTemplate },
    { id: "assets", label: "Assets", icon: Package },
    { id: "archived", label: "Archived", icon: Archive },
  ];

  return (
    <div className="momentum-scope mx-auto w-full max-w-6xl space-y-6 rounded-2xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Your systems hub — projects, templates, and client deliverables.
          </p>
        </div>
        {tab === "active" && (
          <Button onClick={openNewProject}>
            <Plus className="mr-1 h-4 w-4" />
            New Project
          </Button>
        )}
        {tab === "templates" && (
          <Button onClick={openNewTemplate}>
            <Plus className="mr-1 h-4 w-4" />
            New Template
          </Button>
        )}
      </div>

      <div className="flex w-fit flex-wrap gap-1 rounded-full bg-muted p-1">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", isActive ? "text-primary" : "opacity-60")} />
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[11px] tabular-nums",
                    isActive ? "bg-muted" : "bg-background/80",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <GridSkeleton />
      ) : tab === "active" ? (
        activeProjects.length === 0 ? (
          <EmptyState
            title="No active projects"
            desc="Start one for yourself, or assign one to a client."
            onAdd={openNewProject}
            addLabel="New project"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {activeProjects.map((p) => (
              <ProjectCard key={p.id} project={p} onClick={() => openEditProject(p)} />
            ))}
          </div>
        )
      ) : tab === "templates" ? (
        templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            desc="Build a repeatable project once, spawn it for every client."
            onAdd={openNewTemplate}
            addLabel="New template"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => openEditTemplate(t)}
                className="rounded-xl border bg-card p-4 text-left shadow-xs transition-colors hover:border-primary/40"
              >
                <p className="text-[15px] font-semibold">{t.title}</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {[t.category, t.durationDays != null ? `${t.durationDays} days` : null]
                    .filter(Boolean)
                    .join(" · ") || "No category set"}
                </p>
                {t.steps.length > 0 && (
                  <p className="mt-2 text-[11.5px] text-muted-foreground">
                    {t.steps.length} step{t.steps.length === 1 ? "" : "s"}
                  </p>
                )}
              </button>
            ))}
          </div>
        )
      ) : tab === "assets" ? (
        <AssetsTab />
      ) : archivedProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
          <p className="text-sm text-muted-foreground">No archived projects yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {archivedProjects.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => openEditProject(p)} />
          ))}
        </div>
      )}

      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        contacts={contacts}
        templates={templates}
        project={editProject}
      />
      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={editTemplate}
      />
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl border bg-muted/30" />
      ))}
    </div>
  );
}

function EmptyState({
  title,
  desc,
  onAdd,
  addLabel,
}: {
  title: string;
  desc: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <FolderKanban className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      <div className="mt-6 flex justify-center">
        <Button onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" />
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
