import { ArrowDown, ArrowRight, type LucideIcon } from "lucide-react";

export interface WorkflowStep {
  icon: LucideIcon;
  label: string;
  /** Optional 1-line subtitle shown under the label. */
  detail?: string;
  /** Tailwind colour token suffix (e.g. "indigo", "violet"). Drives the icon tint. */
  tone?: WorkflowTone;
}

export type WorkflowTone =
  | "indigo"
  | "violet"
  | "pink"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "slate";

interface WorkflowDiagramProps {
  steps: WorkflowStep[];
}

/**
 * Lightweight HTML/CSS workflow diagram. Renders steps as bordered cards
 * connected by chevrons — flex-row at md+ with right arrows, flex-col on
 * mobile with down arrows. No SVG, no extra deps.
 */
export function WorkflowDiagram({ steps }: WorkflowDiagramProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-stretch md:gap-1">
        {steps.map((step, i) => (
          <div
            key={`${step.label}-${i}`}
            className="flex flex-col items-center gap-2 md:flex-row md:items-stretch md:gap-1"
          >
            <StepCard step={step} />
            {i < steps.length - 1 && (
              <>
                <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground md:hidden" />
                <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 self-center text-muted-foreground md:block" />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepCard({ step }: { step: WorkflowStep }) {
  const Icon = step.icon;
  const tone = TONE_CLASSES[step.tone ?? "slate"];
  return (
    <div className="flex w-[8.5rem] shrink-0 flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-3 text-center md:w-[7.25rem]">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-chip ${tone.bg} ${tone.text}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <p className="text-micro font-semibold leading-tight text-foreground">{step.label}</p>
      {step.detail && (
        <p className="text-overline leading-tight text-muted-foreground">
          {step.detail}
        </p>
      )}
    </div>
  );
}

// Static class map so Tailwind's JIT keeps these utilities. Don't switch to
// dynamic concatenation.
const TONE_CLASSES: Record<WorkflowTone, { bg: string; text: string }> = {
  indigo: {
    bg: "bg-tag-blue-bg",
    text: "text-tag-blue-fg",
  },
  violet: {
    bg: "bg-tag-violet-bg",
    text: "text-tag-violet-fg",
  },
  pink: {
    bg: "bg-tag-pink-bg",
    text: "text-tag-pink-fg",
  },
  emerald: {
    bg: "bg-tag-aqua-bg",
    text: "text-tag-aqua-fg",
  },
  amber: {
    bg: "bg-tag-gold-bg",
    text: "text-tag-gold-fg",
  },
  rose: {
    bg: "bg-tag-pink-bg",
    text: "text-tag-pink-fg",
  },
  sky: {
    bg: "bg-tag-blue-bg",
    text: "text-tag-blue-fg",
  },
  slate: {
    bg: "bg-tag-gray-bg",
    text: "text-tag-gray-fg",
  },
};
