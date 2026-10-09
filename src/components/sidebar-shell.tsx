"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { BrandLogo, BrandSeal } from "@/components/brand/logo"
import { Hint } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const LARGURA_ABERTA = "w-[320px] xl:w-[336px]"
const LARGURA_FECHADA = "w-[76px]"

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void; expand: () => void }>({
  collapsed: false,
  toggle: () => {},
  expand: () => {},
})

/** Estado de recolhimento para os filhos client (ex.: ligar tooltips quando recolhida). */
export function useSidebar() {
  return useContext(SidebarContext)
}

/** Estado compartilhado: inicia expandido e só recolhe durante a visita atual. */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const toggle = useCallback(() => setCollapsed((current) => !current), [])
  const expand = useCallback(() => setCollapsed(false), [])
  const context = useMemo(() => ({ collapsed, toggle, expand }), [collapsed, toggle, expand])

  return <SidebarContext.Provider value={context}>{children}</SidebarContext.Provider>
}

/** Casca escura da lateral; publica data-collapsed para os filhos reagirem por CSS. */
export function SidebarShell({ children }: { children: React.ReactNode }) {
  const { collapsed, toggle } = useSidebar()

  return (
      <div
        data-collapsed={collapsed}
        className={cn(
          "dark group/sidebar relative flex h-full flex-col border-r bg-background text-foreground transition-[width] duration-300 ease-out-brand motion-reduce:transition-none",
          collapsed ? LARGURA_FECHADA : LARGURA_ABERTA
        )}
      >
        <div className="relative flex h-[88px] shrink-0 items-center overflow-hidden px-6">
          <Link
            href="/dashboard"
            aria-label="Grupo Studio — início"
            className="relative flex h-10 min-w-0 flex-1 items-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
          >
            <BrandLogo
              tone="white"
              height={38}
              priority
              className="transition-opacity duration-200 group-data-[collapsed=true]/sidebar:pointer-events-none group-data-[collapsed=true]/sidebar:opacity-0"
            />
            <BrandSeal
              tone="white"
              size={34}
              className="absolute left-[-3px] top-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-200 group-data-[collapsed=true]/sidebar:opacity-100"
            />
          </Link>
        </div>

        {/* Filete dourado da marca sob o logo */}
        <div className="mx-6 h-px bg-border" />

        {children}

        {/* Alça de recolher na borda — fica acima do conteúdo vizinho */}
        <Hint label={collapsed ? "Expandir menu" : "Recolher menu"} side="right">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
            aria-expanded={!collapsed}
            className={cn(
              "absolute -right-[18px] top-[26px] z-40 grid size-9 place-items-center rounded-full border bg-card text-foreground shadow-sm outline-none",
              "transition-[color,border-color] hover:border-primary hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/25"
            )}
          >
            <ChevronLeft
              className={cn("size-[18px] transition-transform duration-300 ease-out-brand motion-reduce:transition-none", collapsed && "rotate-180")}
            />
          </button>
        </Hint>
      </div>
  )
}
