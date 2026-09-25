import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Tags do Design System: pílula, caixa alta, peso 700, entreletra 0.14em.
 * `solid` (preto), `gold` (lavado dourado) e `outline` são as três oficiais;
 * os tons de estado (sucesso, alerta, erro, info) são funcionais — só para
 * indicar status em telas operacionais.
 */
const badgeVariants = cva(
  [
    "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap",
    "rounded-full border px-2.5 py-[3px] text-[10px] font-bold uppercase leading-4 tracking-[0.14em]",
    "transition-[color,background-color] [&>svg]:pointer-events-none [&>svg]:size-3",
    "focus-visible:ring-[3px] focus-visible:ring-ring/25",
  ],
  {
    variants: {
      variant: {
        default: "border-transparent bg-gold-wash text-gold-text",
        gold: "border-transparent bg-gold-wash text-gold-text",
        solid: "border-transparent bg-ink text-white dark:bg-white dark:text-ink",
        secondary: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border bg-transparent text-muted-foreground",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/25 bg-warning/10 text-warning",
        danger: "border-danger/25 bg-danger/10 text-danger",
        destructive: "border-danger/25 bg-danger/10 text-danger",
        info: "border-info/25 bg-info/10 text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  dot = false,
  pulse = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
    /** Ponto de status à esquerda, na cor do texto. */
    dot?: boolean
    /** Anima o ponto (estados em andamento). */
    pulse?: boolean
  }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span className="relative inline-flex size-1.5 shrink-0">
          {pulse && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-current" />}
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </Comp>
  )
}

export { Badge, badgeVariants }
