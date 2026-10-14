import { Crown, Users, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TEMPLATE_CATEGORY_LABELS,
  type LibraryTemplate,
} from "@/lib/projects/template-library";

const CATEGORY_TONE: Record<string, string> = {
  launch: "bg-tag-pink-bg text-tag-pink-fg",
  content_workflow: "bg-tag-aqua-bg text-tag-aqua-fg",
  weekly_planning: "bg-tag-violet-bg text-tag-violet-fg",
  visibility: "bg-tag-blue-bg text-tag-blue-fg",
  product_creation: "bg-tag-gold-bg text-tag-gold-fg",
  client_delivery: "bg-tag-green-bg text-tag-green-fg",
  ceo_operations: "bg-tag-gray-bg text-tag-gray-fg",
  marketing: "bg-tag-pink-bg text-tag-pink-fg",
  challenge_event: "bg-tag-gold-bg text-tag-gold-fg",
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
        "inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-micro font-medium",
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
      <span className="inline-flex items-center gap-1 rounded-full bg-tint-violet px-2 py-0.5 text-micro font-medium text-tag-violet-fg">
        <Crown className="h-3 w-3" /> System
      </span>
    );
  }
  const client = template.audience === "client";
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium">
      {client ? <Users className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}
      {client ? "Clients" : "My business"}
    </span>
  );
}
