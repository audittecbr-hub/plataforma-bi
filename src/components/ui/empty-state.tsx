import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { IconBadge } from "@/components/ui/icon-badge"

/** Estado vazio: medalhão, filete dourado, título firme e uma frase de apoio. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-3 px-6 py-10" : "gap-5 px-6 py-16",
        className
      )}
    >
      <IconBadge icon={icon} size={compact ? "md" : "xl"} />
      {!compact && <span aria-hidden className="h-[3px] w-10 bg-gold" />}
      <div className="max-w-sm space-y-1.5">
        <p className={cn("font-bold tracking-[-0.01em] text-foreground", compact ? "text-base" : "text-xl")}>{title}</p>
        {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
