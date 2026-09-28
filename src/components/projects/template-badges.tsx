import { Crown, Users, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TEMPLATE_CATEGORY_LABELS,
  type LibraryTemplate,
} from "@/lib/projects/template-library";

const CATEGORY_TONE: Record<string, string> = {
  launch: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  content_workflow: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  weekly_planning: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  visibility: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  product_creation: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  client_delivery: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  ceo_operations: "bg-yellow-500/15 text-yellow-800 dark:text-yellow-300",
  marketing: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  challenge_event: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  custom: "bg-muted text-foreground",
};

/** Category badge — original Momentum OS label (with its emoji) for known categories, free text otherwise. */
export function CategoryBadge({ template }: { template: LibraryTemplate }) {
  if (template.categoryKey === "uncategorized") return null;
  const label =
    TEMPLATE_CATEGORY_LABELS[template.categoryKey] ?? template.categoryLabel;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
        CATEGORY_TONE[template.categoryKey] ?? "bg-muted text-muted-foreground"
      )}
    >
      {label}
    </span>
  );
}

/** "System" for recovered Momentum OS templates; audience for workspace templates. */
export function SourceBadge({ template }: { template: LibraryTemplate }) {
  if (template.source === "system") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
        <Crown className="h-3 w-3" /> System
      </span>
    );
  }
  const client = template.audience === "client";
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
      {client ? <Users className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}
      {client ? "Clients" : "My business"}
    </span>
  );
}
