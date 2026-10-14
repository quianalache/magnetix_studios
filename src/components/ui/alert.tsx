import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertTriangleIcon, CheckCircle2Icon, InfoIcon, XCircleIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Magnetix Alert / callout (design-system Phase 1). Semantic tones only —
 * status colors come from the --ds-status-* tokens. An icon is chosen per tone
 * unless you pass `icon={null}` or your own.
 *
 *   <Alert tone="warning" title="Broadcasts are paused">Add a mailing address first.</Alert>
 */
const alertVariants = cva(
  "relative flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        info: "border-status-info-fg/20 bg-status-info-bg text-status-info-fg",
        warning: "border-status-warning-fg/20 bg-status-warning-bg text-status-warning-fg",
        success: "border-status-success-fg/20 bg-status-success-bg text-status-success-fg",
        danger: "border-status-danger-fg/20 bg-status-danger-bg text-status-danger-fg",
        neutral: "border-border bg-muted text-foreground",
      },
    },
    defaultVariants: { tone: "info" },
  }
)

const TONE_ICON: Record<NonNullable<VariantProps<typeof alertVariants>["tone"]>, LucideIcon | null> = {
  info: InfoIcon,
  warning: AlertTriangleIcon,
  success: CheckCircle2Icon,
  danger: XCircleIcon,
  neutral: InfoIcon,
}

function Alert({
  className,
  tone = "info",
  title,
  icon,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof alertVariants> & {
    title?: React.ReactNode
    /** `null` hides the icon; omit for the tone's default. */
    icon?: LucideIcon | null
  }) {
  const Icon = icon === undefined ? TONE_ICON[tone ?? "info"] : icon
  return (
    <div
      data-slot="alert"
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
    </div>
  )
}

export { Alert, alertVariants }
