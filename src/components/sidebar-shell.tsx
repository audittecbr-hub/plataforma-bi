"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { BrandLogo, BrandSeal } from "@/components/brand/logo"
import { Hint } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "sidebar-collapsed"
const LARGURA_ABERTA = "w-[272px]"
const LARGURA_FECHADA = "w-[76px]"

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
})

/** Estado de recolhimento para os filhos client (ex.: ligar tooltips quando recolhida). */
export function useSidebar() {
  return useContext(SidebarContext)
}

/**
 * Casca client da sidebar: guarda o estado de recolhido e a largura.
 *
 * O `Sidebar` continua server component (lê a sessão e usa o server action de
 * signOut). A casca publica um `data-collapsed` para o layout reagir por CSS
 * (variantes `group-data-[collapsed=true]/sidebar:`) e um contexto para os
 * filhos client que precisam do valor em JS — como os tooltips da navegação.
 *
 * Ícones e avatar ficam no mesmo x nos dois estados: o recolhimento só anima a
 * largura e esmaece os rótulos, sem nada "pular" no fim.
 *
 * A sidebar é sempre em preto premium (a classe `dark` troca os tokens só aqui
 * dentro), com o logo oficial em branco — nos dois temas.
 */
export function SidebarShell({ children }: { children: React.ReactNode }) {
  // Os dois valores vivem no mesmo state para que restaurar a preferência seja
  // um único setState. `mounted` existe porque a preferência só é conhecida no
  // cliente: sem ela, restaurar "recolhido" animaria a largura na carga.
  const [{ collapsed, mounted }, setEstado] = useState({ collapsed: false, mounted: false })

  useEffect(() => {
    let salvo = false
    try {
      salvo = window.localStorage.getItem(STORAGE_KEY) === "true"
    } catch {
      // Modo privado ou storage bloqueado: segue expandido, sem persistir.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado({ collapsed: salvo, mounted: true })
  }, [])

  const toggle = useCallback(() => {
    setEstado((atual) => {
      const proximo = !atual.collapsed
      try {
        window.localStorage.setItem(STORAGE_KEY, String(proximo))
      } catch {
        // Preferência não persiste; o estado da sessão continua valendo.
      }
      return { ...atual, collapsed: proximo }
    })
  }, [])

  // Atalho "[" (fora de campos de texto) — o mesmo de Linear e Figma.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return
      const alvo = e.target as HTMLElement | null
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return
      toggle()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [toggle])

  return (
    <SidebarContext.Provider value={{ collapsed, toggle }}>
      <div
        data-collapsed={collapsed}
        className={cn(
          "dark group/sidebar relative flex h-full flex-col border-r bg-background text-foreground",
          collapsed ? LARGURA_FECHADA : LARGURA_ABERTA,
          mounted && "transition-[width] duration-300 ease-out-brand"
        )}
      >
        <div className="relative flex h-[84px] shrink-0 items-center overflow-hidden px-6">
          <Link
            href="/dashboard"
            aria-label="Grupo Studio — início"
            className="relative flex h-10 min-w-0 flex-1 items-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
          >
            <BrandLogo
              tone="white"
              height={36}
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
        <Hint label={collapsed ? "Expandir menu" : "Recolher menu"} side="right" shortcut="[">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
            aria-expanded={!collapsed}
            className={cn(
              "absolute -right-3 top-[30px] z-40 grid size-6 place-items-center rounded-full border bg-card text-muted-foreground shadow-sm outline-none",
              "transition-[color,border-color] hover:border-primary hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/25"
            )}
          >
            <ChevronLeft
              className={cn("size-3.5 transition-transform duration-300 ease-out-brand", collapsed && "rotate-180")}
            />
          </button>
        </Hint>
      </div>
    </SidebarContext.Provider>
  )
}
