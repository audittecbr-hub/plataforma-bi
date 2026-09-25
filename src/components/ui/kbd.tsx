import * as React from "react"
import { cn } from "@/lib/utils"

/** Tecla de atalho com relevo discreto. */
export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded-md border bg-surface px-1.5",
        "font-mono text-[10.5px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]",
        className
      )}
      {...props}
    />
  )
}
