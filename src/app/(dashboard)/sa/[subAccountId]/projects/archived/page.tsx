"use client";

import { useMemo, useState } from "react";
import { useProjectsData } from "@/hooks/use-projects-data";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { ProjectsShell } from "@/components/projects/projects-shell";
import {
  ProjectsEmptyState,
  ProjectsList,
} from "@/components/projects/projects-list";
import type { Project } from "@/types/projects";

/** Projects → Archived. Same list component as Overview; Reactivate lives in each row's menu (and in the edit sheet, as before). */
export default function ArchivedProjectsPage() {
  const { projects, templates, contacts, loading } = useProjectsData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const archived = useMemo(
    () => projects.filter((p) => p.status === "archived"),
    [projects]
  );

  return (
    <ProjectsShell active="archived">
      <ProjectsList
        projects={archived}
        mode="archived"
        loading={loading}
        onEdit={(p) => {
          setEditProject(p);
          setDialogOpen(true);
        }}
        emptyState={
          <ProjectsEmptyState
            title="No archived projects yet"
            desc="Archive a project from its menu once the work is wrapped."
          />
        }
      />
      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={contacts}
        templates={templates}
        project={editProject}
      />
    </ProjectsShell>
  );
}
