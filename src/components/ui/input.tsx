import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

/** Classes compartilhadas por Input e Textarea. */
export const fieldClasses = cn(
  "w-full min-w-0 rounded-[4px] border border-input bg-surface text-sm text-foreground outline-none",
  "transition-[border-color,box-shadow,background-color] duration-200",
  "placeholder:text-faint",
  "hover:border-foreground/30",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20"
)

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldClasses,
        "flex h-10 px-3.5 py-2",
        "file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "[&::-webkit-search-cancel-button]:cursor-pointer",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
