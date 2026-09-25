import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const iconBadgeVariants = cva("relative inline-grid shrink-0 place-items-center [&_svg]:pointer-events-none", {
  variants: {
    tone: {
      gold: "bg-gold-wash text-gold-text",
      ink: "bg-ink text-[var(--gs-gold-light)] dark:bg-white/[0.08]",
      neutral: "border bg-surface text-muted-foreground",
      success: "bg-success/10 text-success",
      warning: "bg-warning/10 text-warning",
      danger: "bg-danger/10 text-danger",
      info: "bg-info/10 text-info",
    },
    size: {
      sm: "size-8 rounded-[4px] [&_svg]:size-4",
      md: "size-10 rounded-[4px] [&_svg]:size-[18px]",
      lg: "size-12 rounded-xl [&_svg]:size-5",
      xl: "size-14 rounded-xl [&_svg]:size-6",
    },
  },
  defaultVariants: { tone: "gold", size: "md" },
})

/** Medalhão de ícone — abre cabeçalhos de painel, diálogos e estados vazios. */
export function IconBadge({
  icon: Icon,
  tone,
  size,
  className,
}: { icon: LucideIcon; className?: string } & VariantProps<typeof iconBadgeVariants>) {
  return (
    <span aria-hidden className={cn(iconBadgeVariants({ tone, size }), className)}>
      <Icon />
    </span>
  )
}
