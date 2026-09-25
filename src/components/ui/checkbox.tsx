"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  onCheckedChange?: (checked: boolean) => void
}

/**
 * Checkbox sobre um `<input type="checkbox">` nativo — continua participando
 * de `<form>` e `FormData` (o login lê `remember === "on"`).
 *
 * O input fica invisível por cima da caixa desenhada; caixa e check são irmãos
 * do input (e não filhos de um irmão) para que `peer-checked:` alcance os dois.
 * `className` estiliza o invólucro.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, ...props }, ref) => (
    <span data-slot="checkbox" className={cn("relative inline-flex size-[18px] shrink-0", className)}>
      <input
        type="checkbox"
        ref={ref}
        className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-[3px] opacity-0 disabled:cursor-not-allowed"
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        {...props}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[3px] border border-input bg-surface",
          "transition-[background-color,border-color,box-shadow] duration-200 ease-out-brand",
          "peer-hover:border-primary",
          "peer-checked:border-primary peer-checked:bg-primary",
          "peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/25",
          "peer-disabled:opacity-40"
        )}
      />
      <Check
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 m-auto size-3 text-primary-foreground [stroke-width:3]",
          "scale-75 opacity-0 transition-[opacity,scale] duration-200 ease-out-brand",
          "peer-checked:scale-100 peer-checked:opacity-100"
        )}
      />
    </span>
  )
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
