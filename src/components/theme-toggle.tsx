"use client"

import { flushSync } from "react-dom"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Hint } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown
}

/**
 * Alterna claro/escuro com um fade curto da página inteira (View Transitions,
 * 240ms no globals.css). Sem suporte — ou com movimento reduzido — troca direto.
 *
 * Os dois ícones são renderizados e o CSS decide qual aparece pela classe
 * `.dark` que o next-themes aplica antes da pintura: sem flash e sem esperar a
 * hidratação.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  function toggle() {
    const next = resolvedTheme === "dark" ? "light" : "dark"
    const doc = document as ViewTransitionDocument
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (!doc.startViewTransition || reduceMotion) {
      setTheme(next)
      return
    }
    doc.startViewTransition(() => {
      flushSync(() => setTheme(next))
    })
  }

  return (
    <Hint label="Alternar tema" side="bottom">
      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label="Alternar tema claro/escuro"
        className={cn("relative size-9", className)}
      >
        <Sun className="size-[18px] opacity-100 transition-opacity duration-300 ease-out-brand dark:opacity-0" />
        <Moon className="absolute size-[18px] opacity-0 transition-opacity duration-300 ease-out-brand dark:opacity-100" />
      </Button>
    </Hint>
  )
}
