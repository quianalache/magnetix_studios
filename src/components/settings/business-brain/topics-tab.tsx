"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BusinessBrainSubtopic, BusinessBrainTopic } from "@/types/business-brain";

/**
 * Topics + Subtopics — the one Business Brain section with real hierarchy
 * (a Subtopic belongs to exactly one Topic via `parentTopic`). Topics and
 * Subtopics are two separate top-level arrays on the same document (not
 * nested in storage — migration spec §4.7), so any add/edit/delete on
 * either one saves BOTH arrays together in one PATCH, keeping them
 * consistent without needing a second, independent save path.
 */

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function TopicsTab({
  topics,
  subtopics,
  onSave,
}: {
  topics: BusinessBrainTopic[];
  subtopics: BusinessBrainSubtopic[];
  onSave: (next: { topics: BusinessBrainTopic[]; subtopics: BusinessBrainSubtopic[] }) => Promise<void>;
}) {
  const [topicItems, setTopicItems] = useState<BusinessBrainTopic[]>(topics);
  const [subtopicItems, setSubtopicItems] = useState<BusinessBrainSubtopic[]>(subtopics);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function persist(
    nextTopics: BusinessBrainTopic[],
    nextSubtopics: BusinessBrainSubtopic[],
    successMessage: string,
  ) {
    try {
      await onSave({ topics: nextTopics, subtopics: nextSubtopics });
      setTopicItems(nextTopics);
      setSubtopicItems(nextSubtopics);
      toast.success(successMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
      throw err;
    }
  }

  function updateTopicLocal(id: string, next: BusinessBrainTopic) {
    setTopicItems((prev) => prev.map((t) => (t.id === id ? next : t)));
  }

  async function saveTopic(topic: BusinessBrainTopic) {
    setSavingKey(`topic-${topic.id}`);
    try {
      const next = topicItems.map((t) => (t.id === topic.id ? topic : t));
      await persist(next, subtopicItems, "Saved.");
      setExpandedTopicId(null);
    } catch {
      // toast shown
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteTopic(topic: BusinessBrainTopic) {
    const childCount = subtopicItems.filter((s) => s.parentTopic === topic.id).length;
    const warn = childCount
      ? ` This will also delete its ${childCount} subtopic${childCount === 1 ? "" : "s"}.`
      : "";
    if (!confirm(`Delete "${topic.name || "this topic"}"?${warn} This can't be undone.`)) return;
    setSavingKey(`topic-${topic.id}`);
    try {
      const nextTopics = topicItems.filter((t) => t.id !== topic.id);
      const nextSubtopics = subtopicItems.filter((s) => s.parentTopic !== topic.id);
      await persist(nextTopics, nextSubtopics, "Deleted.");
      if (expandedTopicId === topic.id) setExpandedTopicId(null);
    } catch {
      // toast shown
    } finally {
      setSavingKey(null);
    }
  }

  function addTopic() {
    const fresh: BusinessBrainTopic = { id: newId(), name: "", means: "", why: "", relatedOffer: "", notes: "" };
    setTopicItems((prev) => [...prev, fresh]);
    setExpandedTopicId(fresh.id);
  }

  function updateSubtopicLocal(id: string, next: BusinessBrainSubtopic) {
    setSubtopicItems((prev) => prev.map((s) => (s.id === id ? next : s)));
  }

  async function saveSubtopic(subtopic: BusinessBrainSubtopic) {
    setSavingKey(`subtopic-${subtopic.id}`);
    try {
      const next = subtopicItems.map((s) => (s.id === subtopic.id ? subtopic : s));
      await persist(topicItems, next, "Saved.");
    } catch {
      // toast shown
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteSubtopic(subtopic: BusinessBrainSubtopic) {
    if (!confirm(`Delete "${subtopic.name || "this subtopic"}"? This can't be undone.`)) return;
    setSavingKey(`subtopic-${subtopic.id}`);
    try {
      const next = subtopicItems.filter((s) => s.id !== subtopic.id);
      await persist(topicItems, next, "Deleted.");
    } catch {
      // toast shown
    } finally {
      setSavingKey(null);
    }
  }

  function addSubtopic(topicId: string) {
    const fresh: BusinessBrainSubtopic = {
      id: newId(),
      name: "",
      parentTopic: topicId,
      covers: "",
      questions: "",
      relatedOffer: "",
      notes: "",
    };
    setSubtopicItems((prev) => [...prev, fresh]);
  }

  return (
    <div className="space-y-3">
      {topicItems.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No topics yet — the bigger lanes your channel/content returns to.
        </p>
      )}

      {topicItems.map((topic) => {
        const isExpanded = expandedTopicId === topic.id;
        const isSaving = savingKey === `topic-${topic.id}`;
        const children = subtopicItems.filter((s) => s.parentTopic === topic.id);

        return (
          <div key={topic.id} className="rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {topic.name || "(untitled)"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {children.length} subtopic{children.length === 1 ? "" : "s"}
                </span>
              </span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {isExpanded && (
              <div className="space-y-4 border-t p-4">
                <div className="space-y-1.5">
                  <Label htmlFor={`topic-name-${topic.id}`}>Topic Name</Label>
                  <Input
                    id={`topic-name-${topic.id}`}
                    value={topic.name ?? ""}
                    onChange={(e) => updateTopicLocal(topic.id, { ...topic, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`topic-means-${topic.id}`}>What This Topic Means</Label>
                  <Textarea
                    id={`topic-means-${topic.id}`}
                    value={topic.means ?? ""}
                    onChange={(e) => updateTopicLocal(topic.id, { ...topic, means: e.target.value })}
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`topic-why-${topic.id}`}>Why This Topic Matters</Label>
                  <Textarea
                    id={`topic-why-${topic.id}`}
                    value={topic.why ?? ""}
                    onChange={(e) => updateTopicLocal(topic.id, { ...topic, why: e.target.value })}
                    rows={2}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`topic-offer-${topic.id}`}>Related Offer</Label>
                  <Input
                    id={`topic-offer-${topic.id}`}
                    value={topic.relatedOffer ?? ""}
                    onChange={(e) => updateTopicLocal(topic.id, { ...topic, relatedOffer: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`topic-notes-${topic.id}`}>Notes</Label>
                  <Textarea
                    id={`topic-notes-${topic.id}`}
                    value={topic.notes ?? ""}
                    onChange={(e) => updateTopicLocal(topic.id, { ...topic, notes: e.target.value })}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                <div className="rounded-lg border bg-muted/30 p-3">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Subtopics
                  </h4>
                  <div className="space-y-3">
                    {children.length === 0 && (
                      <p className="text-xs text-muted-foreground">No subtopics yet.</p>
                    )}
                    {children.map((sub) => {
                      const subSaving = savingKey === `subtopic-${sub.id}`;
                      return (
                        <div key={sub.id} className="space-y-2 rounded-lg border bg-background p-3">
                          <Input
                            value={sub.name ?? ""}
                            placeholder="Subtopic name"
                            onChange={(e) => updateSubtopicLocal(sub.id, { ...sub, name: e.target.value })}
                          />
                          <Textarea
                            value={sub.covers ?? ""}
                            placeholder="What this subtopic covers"
                            onChange={(e) => updateSubtopicLocal(sub.id, { ...sub, covers: e.target.value })}
                            rows={2}
                            className="text-sm"
                          />
                          <Textarea
                            value={sub.questions ?? ""}
                            placeholder="Common viewer questions"
                            onChange={(e) => updateSubtopicLocal(sub.id, { ...sub, questions: e.target.value })}
                            rows={2}
                            className="text-sm"
                          />
                          <Input
                            value={sub.relatedOffer ?? ""}
                            placeholder="Related offer"
                            onChange={(e) => updateSubtopicLocal(sub.id, { ...sub, relatedOffer: e.target.value })}
                          />
                          <Textarea
                            value={sub.notes ?? ""}
                            placeholder="Notes"
                            onChange={(e) => updateSubtopicLocal(sub.id, { ...sub, notes: e.target.value })}
                            rows={2}
                            className="text-sm"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => deleteSubtopic(sub)}
                              disabled={subSaving}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => saveSubtopic(sub)}
                              disabled={subSaving}
                            >
                              {subSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              Save
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => addSubtopic(topic.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Add Subtopic
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => deleteTopic(topic)}
                    disabled={isSaving}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Topic
                  </Button>
                  <Button type="button" size="sm" onClick={() => saveTopic(topic)} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Button type="button" variant="outline" onClick={addTopic} className="w-full">
        <Plus className="h-4 w-4" />
        Add Topic
      </Button>
    </div>
  );
}
