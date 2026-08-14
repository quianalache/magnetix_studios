"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import {
  subscribeToProjectsForContact,
  subscribeToProjectTemplates,
} from "@/lib/firestore/projects";
import { toDate } from "@/lib/format";
import {
  projectProgressPct,
  projectTemplateAudience,
  type Project,
  type ProjectTemplate,
} from "@/types/projects";
import type { Contact } from "@/types/contacts";

function formatDate(value: Parameters<typeof toDate>[0]): string | null {
  const date = toDate(value);
  if (!date) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ContactProjects({ contact }: { contact: Contact }) {
  const { user } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !agencyId) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    const unsubProjects = subscribeToProjectsForContact(
      scope,
      contact.id,
      (list) => {
        setProjects([...list].sort((a, b) => a.title.localeCompare(b.title)));
        setLoading(false);
      }
    );
    const unsubTemplates = subscribeToProjectTemplates(scope, setTemplates);
    return () => {
      unsubProjects();
      unsubTemplates();
    };
  }, [contact.id, user, agencyId, subAccountId]);

  const clientTemplates = useMemo(
    () => templates.filter((t) => projectTemplateAudience(t) === "client"),
    [templates]
  );
  const activeCount = projects.filter((p) => p.status === "active").length;
  const selectedTemplate =
    clientTemplates.find((t) => t.id === templateId) ?? null;

  async function addProject() {
    const finalTitle = selectedTemplate?.title ?? title.trim();
    if (!finalTitle) {
      toast.error("Enter a project title or choose a template");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
          description: selectedTemplate?.description ?? "",
          assignedContactId: contact.id,
          templateId: selectedTemplate?.id ?? null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't add project");
      toast.success("Project added");
      setAddOpen(false);
      setTemplateId("");
      setTitle("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Projects
          </p>
          <p className="mt-0.5 text-sm font-semibold">
            {loading
              ? "..."
              : activeCount === 0
                ? "No active projects"
                : `${activeCount} active`}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen((v) => !v)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add project
        </Button>
      </div>

      {addOpen && (
        <div className="mb-3 space-y-2 rounded-lg border p-3">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2"
          >
            <option value="">Blank project</option>
            {clientTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
          {!templateId && (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Project title"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAddOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={addProject} disabled={saving}>
              {saving ? "Adding..." : "Add Project"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/40 h-16 animate-pulse rounded-lg border"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-6 text-center text-xs">
          <FolderKanban className="mx-auto mb-1 h-4 w-4" />
          No assigned projects yet.
        </div>
      ) : (
        <div className="space-y-2">
          {projects.slice(0, 5).map((project) => {
            const due = formatDate(project.dueAt);
            return (
              <div key={project.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {project.title}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {project.status}
                      {due ? ` · due ${due}` : ""}
                    </p>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {projectProgressPct(project)}%
                  </span>
                </div>
                <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${projectProgressPct(project)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <Button
            render={<Link href={`/sa/${subAccountId}/projects`} />}
            size="sm"
            variant="ghost"
            className="w-full"
          >
            Open Projects
          </Button>
        </div>
      )}
    </div>
  );
}
