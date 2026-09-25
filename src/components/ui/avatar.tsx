import * as React from "react"
import { cn } from "@/lib/utils"

/** Iniciais a partir do nome ("Maria Clara Souza" → "MS") ou do e-mail ("joao.silva@" → "JS"). */
export function getInitials(name?: string | null, email?: string | null) {
  const source = (name && name.trim()) || (email ? email.split("@")[0].replace(/[._-]+/g, " ") : "")
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "GS"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Avatar de iniciais dentro da paleta: neutro para listas; `brand` (preto com
 * iniciais em dourado claro) reservado ao usuário logado.
 */
export function Avatar({
  name,
  email,
  size = 36,
  brand = false,
  className,
}: {
  name?: string | null
  email?: string | null
  size?: number
  brand?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-grid shrink-0 select-none place-items-center rounded-full font-bold tracking-[0.04em]",
        brand
          ? "bg-ink text-[var(--gs-gold-light)] ring-1 ring-[var(--gs-gold-light)]/40 dark:bg-white/[0.08]"
          : "bg-muted text-foreground",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)) }}
    >
      {getInitials(name, email)}
    </span>
  )
}
