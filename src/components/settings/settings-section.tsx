import * as React from "react"
import { cn } from "@/lib/utils"

/** Linha de configurações: título e contexto à esquerda, conteúdo à direita. */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("grid gap-5 border-t pt-8 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] lg:gap-12", className)}>
      <div className="space-y-2">
        <h2 className="text-lg font-bold tracking-[-0.01em] text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
