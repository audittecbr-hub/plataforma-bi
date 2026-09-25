import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Cabeçalho de página no padrão do DS: sobrelinha dourada precedida pelo
 * filete da marca, título em ExtraBold com entreletra fechada e descrição.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header
      className={cn("flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-8", className)}
    >
      <div className="min-w-0 space-y-3">
        {eyebrow && (
          <p className="eyebrow flex animate-rise items-center gap-3 text-gold-text">
            <span aria-hidden className="h-[3px] w-8 bg-gold" />
            {eyebrow}
          </p>
        )}
        <h1 className="animate-rise text-[2rem] font-extrabold leading-[1.04] tracking-[-0.02em] text-foreground [animation-delay:60ms] sm:text-[2.5rem]">
          {title}
        </h1>
        {description && (
          <div className="max-w-2xl animate-rise text-sm text-muted-foreground [animation-delay:120ms] md:text-[15px]">
            {description}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 animate-rise flex-wrap items-center gap-2 [animation-delay:160ms]">{actions}</div>
      )}
    </header>
  )
}
