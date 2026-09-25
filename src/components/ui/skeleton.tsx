import { cn } from "@/lib/utils"

/** Placeholder com varredura de luz — substitui o pulse genérico. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-lg bg-muted/80",
        "before:absolute before:inset-0 before:animate-sweep",
        "before:bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.55),transparent)]",
        "dark:before:bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.045),transparent)]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
