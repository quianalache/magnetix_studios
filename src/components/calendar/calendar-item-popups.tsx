"use client";

import { useState } from "react";
import {
  CalendarDays,
  Check,
  Clipboard,
  Clock3,
  ExternalLink,
  Folder,
  MapPin,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TaskDetailModal } from "@/components/tasks/detail/task-detail-modal";
import { setTaskCompleted } from "@/lib/client/task-detail-api";
import { eventStatus, type CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";
import type { Project } from "@/types/projects";
import type { Task } from "@/types/tasks";
import { toDate } from "@/lib/format";
import type { ReactNode } from "react";

function dateTime(start: Date | null, end: Date | null) {
  if (!start) return "Date not set";
  const date = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endTime = end?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}${endTime ? ` – ${endTime}` : ""}`;
}

function DetailRow({ icon: Icon, children, className }: { icon: typeof CalendarDays; children: ReactNode; className?: string }) {
  return <div className={`flex items-start gap-3 text-sm ${className ?? ""}`}><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{children}</div>;
}

export function CalendarTaskPopup({
  task,
  project,
  routineName,
  contacts,
  open,
  onOpenChange,
  onEdit,
}: {
  task: Task | null;
  project: Project | null;
  routineName?: string | null;
  contacts: Contact[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  if (!task) return null;
  const currentTask = task;
  const due = toDate(currentTask.dueAt);
  const parent = routineName || project?.title;
  const assignee = contacts.find((c) => c.id === currentTask.assigneeContactId)?.name;

  async function complete() {
    try {
      await setTaskCompleted(currentTask.id, true);
      toast.success("Task marked complete");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-xl overflow-hidden rounded-2xl p-0">
        <DialogTitle className="sr-only">{currentTask.title}</DialogTitle>
        <div className="border-b bg-primary/5 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{currentTask.title}</h2><p className="text-sm text-muted-foreground">Task</p></div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="space-y-4 px-5 py-5">
          <DetailRow icon={CalendarDays}>{dateTime(due, null)}</DetailRow>
          {assignee && <DetailRow icon={UserRound}>Assignee: {assignee}</DetailRow>}
          {parent && <DetailRow icon={Folder}><span className="text-primary">{parent}</span></DetailRow>}
          {currentTask.notes && <DetailRow icon={Clipboard}><p className="whitespace-pre-wrap text-muted-foreground">{currentTask.notes}</p></DetailRow>}
        </div>
        <div className="flex flex-wrap gap-2 border-t bg-muted/20 px-5 py-4">
          <Button onClick={() => setDetailOpen(true)}><ExternalLink className="mr-2 h-4 w-4" />Open Task</Button>
          <Button variant="outline" onClick={() => { onOpenChange(false); onEdit(); }}>Edit Task</Button>
          {!currentTask.completed && <Button variant="outline" onClick={() => void complete()}><Check className="mr-2 h-4 w-4" />Mark Complete</Button>}
        </div>
      </DialogContent>
    </Dialog>
    <TaskDetailModal taskId={currentTask.id} open={detailOpen} onOpenChange={setDetailOpen} />
  </>;
}

export function CalendarMeetingPopup({
  event,
  contact,
  open,
  onOpenChange,
  onReschedule,
}: {
  event: CalendarEvent | null;
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReschedule: () => void;
}) {
  if (!event) return null;
  const start = toDate(event.startAt);
  const end = toDate(event.endAt);
  const meetingLink = event.meetingUrl;
  const copyLink = () => {
    if (!meetingLink) return;
    void navigator.clipboard.writeText(meetingLink).then(() => toast.success("Meeting link copied"));
  };
  const isCancelled = eventStatus(event) === "cancelled";

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} className="max-w-xl overflow-hidden rounded-2xl p-0">
      <DialogTitle className="sr-only">{event.title}</DialogTitle>
      <div className="border-b bg-blue-500/5 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600"><CalendarDays className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1"><h2 className="truncate text-lg font-semibold">{event.title}</h2><p className="text-sm text-muted-foreground">Meeting or session</p></div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="space-y-4 px-5 py-5">
        <DetailRow icon={Clock3}>{dateTime(start, end)}</DetailRow>
        {contact && <DetailRow icon={UserRound}>{contact.name}</DetailRow>}
        {event.location && <DetailRow icon={MapPin}>{event.location}</DetailRow>}
        {event.notes && <DetailRow icon={Clipboard}><p className="whitespace-pre-wrap text-muted-foreground">{event.notes}</p></DetailRow>}
        {meetingLink && <DetailRow icon={Video}><a className="truncate text-primary hover:underline" href={meetingLink} target="_blank" rel="noreferrer">{meetingLink}</a></DetailRow>}
      </div>
      <div className="flex flex-wrap gap-2 border-t bg-muted/20 px-5 py-4">
        {meetingLink && <Button onClick={() => window.open(meetingLink, "_blank", "noopener,noreferrer")} disabled={isCancelled}><Video className="mr-2 h-4 w-4" />Open Session</Button>}
        {meetingLink && <Button variant="outline" onClick={copyLink}><Clipboard className="mr-2 h-4 w-4" />Copy Link</Button>}
        {!isCancelled && <Button variant="outline" onClick={() => { onOpenChange(false); onReschedule(); }}>Reschedule</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
