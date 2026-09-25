"use client"

import { useTheme } from "next-themes"
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { useIsClient } from "@/hooks/use-is-client"
import { cn } from "@/lib/utils"

type ThemeValue = "light" | "dark" | "system"

/** Miniatura do portal pintada com a paleta de cada tema. */
function ThemePreview({ variant }: { variant: "light" | "dark" }) {
  const dark = variant === "dark"
  return (
    <div className={cn("flex h-full", dark ? "bg-[#1f1f1f]" : "bg-[#f6f6f6]")}>
      <div className="w-[26%] space-y-1.5 bg-[#1f1f1f] p-2">
        <div className="h-1.5 w-8 rounded-[1px] bg-white/80" />
        <div className="mt-3 h-1 w-10 rounded-[1px] bg-[#d5ae77]" />
        <div className="h-1 w-7 rounded-[1px] bg-white/30" />
        <div className="h-1 w-9 rounded-[1px] bg-white/30" />
      </div>
      <div className="flex-1 space-y-2 p-2.5">
        <div className={cn("h-1 w-8 rounded-[1px]", dark ? "bg-[#d5ae77]" : "bg-[#927245]")} />
        <div className={cn("h-2 w-16 rounded-[1px]", dark ? "bg-white" : "bg-[#1f1f1f]")} />
        <div className={cn("space-y-1 rounded-[3px] border p-1.5", dark ? "border-[#3a3a3a] bg-[#262626]" : "border-[#d8d8d8] bg-white")}>
          <div className={cn("h-1 w-12 rounded-[1px]", dark ? "bg-white/40" : "bg-[#5c5c5c]/50")} />
          <div className="flex gap-1">
            <div className={cn("h-4 flex-1 rounded-[1px]", dark ? "bg-white/10" : "bg-[#ebebeb]")} />
            <div className={cn("h-4 flex-1 rounded-[1px]", dark ? "bg-white/10" : "bg-[#ebebeb]")} />
          </div>
        </div>
      </div>
    </div>
  )
}

const OPTIONS: { value: ThemeValue; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "light", label: "Claro", hint: "Branco e cinza claro", icon: Sun },
  { value: "dark", label: "Escuro", hint: "Preto premium", icon: Moon },
  { value: "system", label: "Sistema", hint: "Segue o dispositivo", icon: Monitor },
]

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const isClient = useIsClient()
  // Antes da hidratação o tema salvo é desconhecido: nenhum cartão aparece marcado.
  const current = isClient ? (theme as ThemeValue | undefined) : undefined

  return (
    <div role="radiogroup" aria-label="Tema do portal" className="grid gap-4 sm:grid-cols-3">
      {OPTIONS.map((option) => {
        const selected = current === option.value
        const Icon = option.icon
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              "group relative overflow-hidden rounded-xl border bg-card text-left outline-none transition-[border-color,box-shadow] duration-200",
              "focus-visible:ring-[3px] focus-visible:ring-ring/25",
              selected ? "border-primary shadow-md" : "hover:border-foreground/30"
            )}
          >
            <div className="h-28 overflow-hidden border-b">
              {option.value === "system" ? (
                <div className="grid h-full grid-cols-2">
                  <ThemePreview variant="light" />
                  <ThemePreview variant="dark" />
                </div>
              ) : (
                <ThemePreview variant={option.value} />
              )}
            </div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <Icon className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.hint}</p>
                </div>
              </div>
              <span
                aria-hidden
                className={cn(
                  "grid size-5 place-items-center rounded-full border transition-colors",
                  selected ? "border-primary bg-primary text-primary-foreground" : "bg-surface"
                )}
              >
                {selected && <Check className="size-3 [stroke-width:3]" />}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
