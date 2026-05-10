"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, ...props }, ref) => (
    <div className="relative flex items-center justify-center w-4 h-4">
      <input
        type="checkbox"
        ref={ref}
        className={cn(
          "peer h-4 w-4 shrink-0 appearance-none rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 checked:bg-[#D5AE77] checked:text-primary-foreground cursor-pointer z-10 opacity-0 absolute inset-0",
          className
        )}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        {...props}
      />
      <div className={cn(
          "h-4 w-4 shrink-0 rounded-sm border border-primary flex items-center justify-center pointer-events-none",
          "peer-checked:bg-[#D5AE77] peer-checked:text-black bg-transparent"
      )}>
          <Check className="h-3 w-3 hidden peer-checked:block stroke-[3]" />
      </div>
    </div>
  )
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
