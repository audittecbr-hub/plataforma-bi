import * as React from "react"
import { cn } from "@/lib/utils"

/** Chip de departamento no padrão "dot chip" do DS: ponto dourado + rótulo. */
export function DepartmentChip({
  department,
  label,
  className,
}: {
  department?: string | null
  /** Texto exibido, quando difere da chave do departamento. */
  label?: string | null
  className?: string
}) {
  const text = label ?? department
  if (!text) return <span className="text-faint">—</span>

  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 text-[13px] font-semibold text-foreground", className)}>
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-gold" />
      <span className="truncate">{text}</span>
    </span>
  )
}
