"use client";

import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ExternalLink,
  GraduationCap,
  Loader2,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { parseVideoUrl } from "@/lib/community/video-embed";
import { uploadAgencyStandaloneCourseImage } from "@/lib/community/upload-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/community/classroom/rich-text-editor";
import { CourseOutlineSidebar } from "@/components/standalone-courses/course-outline-sidebar";
import {
  COURSE_GATE_CHART_RULE_ATTRIBUTES,
  CHART_RULE_OPERATORS,
  type ChartRuleCondition,
} from "@/lib/energetics/chart-rules";
import type { ResourceLink } from "@/types/community";
import type {
  StandaloneCourse,
  StandaloneCourseSection,
  StandaloneLesson,
} from "@/types/standalone-courses";

/**
 * Agency Standalone Course editor — sections/lessons builder. Reuses the
 * exact tenant outline/lesson-editor UI (drag-and-drop, chart-unlock
 * editor) with client-fetch against the agency courses API instead of
 * realtime Firestore subscriptions (see the Classroom builder's own doc
 * comment for why). Theme editor now lives at `./theme` (parity pass,
 * 2026-09-18). "Settings" (language/difficulty/topic/advanced toggles)
 * still deferred, same as tenant's own equivalent gaps. The outline
 * sidebar itself is the shared `CourseOutlineSidebar` (Course Section UX,
 * 2026-09-20) — same component the tenant page uses, wired to this page's
 * fetch-based `refresh()` via the `onChanged` prop instead of a live
 * subscription.
 */
export default function AgencyCourseEditorPage(props: { params: Promise<{ courseId: string }> }) {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <AgencyCourseEditorPageInner {...props} />
    </Suspense>
  );
}

function AgencyCourseEditorPageInner({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";
  const router = useRouter();
  const searchParams = useSearchParams();
  const apiBase = `/api/agency/standalone-courses/${courseId}`;

  const [course, setCourse] = useState<StandaloneCourse | null>(null);
  const [sections, setSections] = useState<StandaloneCourseSection[]>([]);
  const [lessons, setLessons] = useState<StandaloneLesson[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(apiBase);
    if (!res.ok) {
      setCourse(null);
      setLoaded(true);
      return;
    }
    const d = (await res.json()) as { course: StandaloneCourse; sections: StandaloneCourseSection[]; lessons: StandaloneLesson[] };
    setCourse(d.course);
    setSections(d.sections);
    setLessons(d.lessons);
    setLoaded(true);
  }, [apiBase]);

  useEffect(() => {
    if (isOwner) void refresh();
  }, [isOwner, refresh]);

  function selectLesson(id: string | null) {
    setSelectedId(id);
    const qs = new URLSearchParams(searchParams.toString());
    if (id) qs.set("lesson", id);
    else qs.delete("lesson");
    const query = qs.toString();
    router.replace(`/agency/standalone-courses/${courseId}${query ? `?${query}` : ""}`, { scroll: false });
  }

  useEffect(() => {
    if (!loaded) return;
    const ordered = [...lessons].sort((a, b) => a.order - b.order);
    const fromUrl = searchParams.get("lesson");
    const candidate = selectedId ?? fromUrl;
    const resolved = candidate && ordered.some((l) => l.id === candidate) ? candidate : (ordered[0]?.id ?? null);
    if (resolved !== selectedId || resolved !== fromUrl) selectLesson(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, loaded]);

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Standalone Courses is managed by the agency owner.
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!course) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Course not found.{" "}
        <Link href="/agency/standalone-courses" className="underline">
          Back to Courses
        </Link>
      </div>
    );
  }

  async function addSection() {
    await fetch(`${apiBase}/sections`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New section" }) });
    void refresh();
  }
  async function addLesson(sectionId: string | null) {
    const res = await fetch(`${apiBase}/lessons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New lesson", sectionId }) });
    const d = (await res.json().catch(() => ({}))) as { lesson?: { id: string } };
    await refresh();
    if (d.lesson?.id) selectLesson(d.lesson.id);
  }
  async function deleteCourse() {
    if (!confirm("Delete this course and all its lessons?")) return;
    const res = await fetch(apiBase, { method: "DELETE" });
    if (res.ok) {
      toast.success("Course deleted");
      router.push("/agency/standalone-courses");
    }
  }

  const selectedLesson = lessons.find((l) => l.id === selectedId) ?? null;
  const hasLessons = lessons.length > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/agency/standalone-courses" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Courses
        </Link>
        <div className="flex items-center gap-2">
          <a href={`/course/agency/${courseId}`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4" /> View sales page
            </Button>
          </a>
          <Link href={`/agency/standalone-courses/${courseId}/community-groups`}>
            <Button variant="outline" size="sm">Community Groups</Button>
          </Link>
          <Link href={`/agency/standalone-courses/${courseId}/theme`}>
            <Button variant="outline" size="sm">Theme</Button>
          </Link>
          <Link href={`/agency/standalone-courses/${courseId}/purchases`}>
            <Button variant="outline" size="sm">Purchases</Button>
          </Link>
          <Link href={`/agency/standalone-courses/${courseId}/edit`}>
            <Button variant="outline" size="sm">
              <Settings2 className="h-4 w-4" /> Course settings
            </Button>
          </Link>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={deleteCourse}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <CourseOutlineSidebar
          apiBase={apiBase}
          courseId={courseId}
          sections={sections}
          lessons={lessons}
          onSectionsChange={setSections}
          onLessonsChange={setLessons}
          selectedId={selectedId}
          onSelectLesson={selectLesson}
          onAddSection={addSection}
          onAddLesson={addLesson}
          onChanged={refresh}
        />

        <div>
          {selectedLesson ? (
            <LessonEditor apiBase={apiBase} courseId={courseId} lesson={selectedLesson} onDeleted={async () => { selectLesson(null); await refresh(); }} onSaved={refresh} />
          ) : (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center">
              <GraduationCap className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{hasLessons ? "Select a lesson to edit." : "No lessons yet. Create your first lesson to get started."}</p>
              {!hasLessons && (
                <Button onClick={() => addLesson(sections[0]?.id ?? null)}>
                  <Plus className="h-4 w-4" /> Add first lesson
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LessonEditor({
  apiBase, courseId, lesson, onDeleted, onSaved,
}: {
  apiBase: string; courseId: string; lesson: StandaloneLesson; onDeleted: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const [videoUrl, setVideoUrl] = useState(lesson.videoUrl ?? "");
  const [body, setBody] = useState(lesson.bodyHtml);
  const [published, setPublished] = useState(lesson.published);
  const [links, setLinks] = useState<ResourceLink[]>(lesson.resourceLinks ?? []);
  const [unlockCondition, setUnlockCondition] = useState<ChartRuleCondition | null>(lesson.chartUnlockCondition ?? null);
  const [saving, setSaving] = useState(false);

  const parsed = videoUrl.trim() ? parseVideoUrl(videoUrl) : null;
  const videoValid = !videoUrl.trim() || parsed !== null;

  async function save() {
    if (!videoValid) {
      toast.error("Paste a valid YouTube, Vimeo, Loom, Descript, Wistia, or Adilo URL");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, videoUrl: videoUrl.trim() || null, bodyHtml: body, published, resourceLinks: links.filter((l) => l.url.trim()), chartUnlockCondition: unlockCondition }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Couldn't save");
      }
      toast.success("Lesson saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!confirm("Delete this lesson?")) return;
    await fetch(`${apiBase}/lessons/${lesson.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <GraduationCap className="h-4 w-4" /> Lesson
        </div>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label>Video URL (YouTube, Vimeo, Loom, Descript, Wistia, or Adilo)</Label>
        <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
        {!videoValid && <p className="text-xs text-destructive">Not a recognized YouTube, Vimeo, Loom, Descript, Wistia, or Adilo link.</p>}
        {parsed && (
          <div className="aspect-video w-full max-w-md overflow-hidden rounded-lg border bg-black">
            <iframe src={parsed.embedUrl} title="preview" allowFullScreen className="h-full w-full" />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Lesson text</Label>
        <RichTextEditor value={body} onChange={setBody} onUploadImage={(file) => uploadAgencyStandaloneCourseImage(file, courseId, "lesson")} />
      </div>

      <ResourceLinksEditor links={links} onChange={setLinks} />
      <ChartUnlockEditor value={unlockCondition} onChange={setUnlockCondition} />

      <div className="flex items-center justify-between border-t pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-4 w-4" />
          Published
        </label>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          Save lesson
        </Button>
      </div>
    </div>
  );
}

function ChartUnlockEditor({ value, onChange }: { value: ChartRuleCondition | null; onChange: (v: ChartRuleCondition | null) => void }) {
  const enabled = value !== null;
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { attribute: "profileLines", operator: "contains", value: "" } : null)}
          className="h-4 w-4"
        />
        Only unlock this lesson for a matching chart
      </label>
      {enabled && value && (
        <div className="grid grid-cols-1 gap-2 pl-6 sm:grid-cols-3">
          <select value={value.attribute} onChange={(e) => onChange({ ...value, attribute: e.target.value as ChartRuleCondition["attribute"] })} className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm">
            {COURSE_GATE_CHART_RULE_ATTRIBUTES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <select value={value.operator} onChange={(e) => onChange({ ...value, operator: e.target.value as ChartRuleCondition["operator"] })} className="rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm">
            {CHART_RULE_OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Input value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value })} placeholder="e.g. 3, Reflector, Sacral…" />
        </div>
      )}
      {enabled && <p className="pl-6 text-xs text-muted-foreground">Students see this lesson only if their own chart matches. A course with any gated lesson asks for birth details at checkout.</p>}
    </div>
  );
}

function ResourceLinksEditor({ links, onChange }: { links: ResourceLink[]; onChange: (l: ResourceLink[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>Resource links</Label>
      {links.map((l, i) => (
        <div key={i} className="flex gap-2">
          <Input value={l.label} placeholder="Label" onChange={(e) => { const next = [...links]; next[i] = { ...next[i], label: e.target.value }; onChange(next); }} className="h-8 w-1/3" />
          <Input value={l.url} placeholder="https://…" onChange={(e) => { const next = [...links]; next[i] = { ...next[i], url: e.target.value }; onChange(next); }} className="h-8 flex-1" />
          <Button size="sm" variant="ghost" onClick={() => onChange(links.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...links, { label: "", url: "" }])}>
        <Plus className="h-4 w-4" /> Add link
      </Button>
    </div>
  );
}
