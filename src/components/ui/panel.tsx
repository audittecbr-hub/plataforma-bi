import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { IconBadge } from "@/components/ui/icon-badge"

/**
 * Painel de conteúdo do portal: card de 8px com borda hairline, cabeçalho
 * próprio, barra de ferramentas opcional e corpo sem padding (tabelas encostam
 * nas bordas).
 */
export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn("relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  )
}

export function PanelHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  icon?: LucideIcon
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 px-5 pb-5 pt-6 sm:flex-row sm:items-center sm:justify-between md:px-6",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-4">
        {icon && <IconBadge icon={icon} className="mt-0.5" />}
        <div className="min-w-0 space-y-1.5">
          {eyebrow && <p className="eyebrow text-[10.5px] text-gold-text">{eyebrow}</p>}
          <h2 className="text-xl font-bold leading-tight tracking-[-0.01em] text-foreground">{title}</h2>
          {description && <p className="text-[13.5px] leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">{actions}</div>}
    </div>
  )
}

export function PanelToolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t bg-[var(--gs-gray-50)] px-5 py-3 dark:bg-white/[0.02] sm:flex-row sm:items-center md:px-6",
        className
      )}
      {...props}
    />
  )
}

export function PanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-between gap-4 border-t px-5 py-3 md:px-6", className)}
      {...props}
    />
  )
}
