"use client"

import { MotionConfig } from "framer-motion"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * Provedores globais do portal, num único client boundary.
 *
 * `MotionConfig reducedMotion="user"` faz todas as animações do framer-motion
 * respeitarem `prefers-reduced-motion` sem que cada componente precise checar.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200} skipDelayDuration={120}>
          {children}
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  )
}
