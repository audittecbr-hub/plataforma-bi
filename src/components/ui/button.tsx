import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Botões do Design System: raio de 4px, peso 600, entreletra 0.01em.
 * Primário em dourado escuro que escurece no hover; secundário com borda preta
 * que inverte no hover. Pressionar reduz a escala a 0.98 — sem "squish".
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap",
    "rounded-[4px] border border-transparent text-sm font-semibold tracking-[0.01em] outline-none",
    "transition-[background-color,border-color,color,box-shadow,opacity,scale] duration-200 ease-out-brand",
    "focus-visible:ring-[3px] focus-visible:ring-ring/25",
    "disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-95 focus-visible:ring-destructive/25",
        outline: "border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background",
        secondary: "border-border bg-card text-foreground shadow-xs hover:border-foreground/40",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        subtle: "bg-gold-wash text-gold-text hover:bg-[color-mix(in_oklab,var(--gold-wash)_80%,var(--gold)_20%)]",
        link: "h-auto border-0 px-0 text-gold-text underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-8 px-3.5 text-[13px]",
        lg: "h-12 px-7 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
