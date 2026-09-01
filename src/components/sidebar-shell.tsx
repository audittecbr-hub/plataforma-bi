"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "sidebar-collapsed"
const LARGURA_ABERTA = "w-64"
const LARGURA_FECHADA = "w-16"

/**
 * Casca client da sidebar: é ela que guarda o estado de recolhido e a largura.
 *
 * O `Sidebar` continua server component — ele define o server action do signOut
 * e lê cookies, então não pode virar client. Em vez de propagar o estado por
 * contexto (o que obrigaria a converter a árvore inteira), a casca publica um
 * `data-collapsed` e o conteúdo reage por CSS, com as variantes
 * `group-data-[collapsed=true]/sidebar:` do Tailwind. Nada abaixo daqui precisa
 * saber que existe estado.
 *
 * A área principal do dashboard é um flex item com `w-full` e shrink padrão, ou
 * seja, ela ocupa o que sobra: estreitar a sidebar já a faz crescer sozinha.
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

  return (
    <div
      data-collapsed={collapsed}
      className={cn(
        "group/sidebar relative flex h-full flex-col border-r bg-card text-card-foreground",
        collapsed ? LARGURA_FECHADA : LARGURA_ABERTA,
        mounted && "transition-[width] duration-200 ease-out"
      )}
    >
      {/* Accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-primary via-primary/60 to-transparent z-10 pointer-events-none" />

      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4 lg:h-[60px] lg:px-6 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0 group-data-[collapsed=true]/sidebar:lg:px-0">
        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center gap-2 group-data-[collapsed=true]/sidebar:hidden"
        >
          <span className="font-cinzel text-xl tracking-wider whitespace-nowrap">
            <span className="font-extralight text-foreground/70">GRUPO</span>
            <span className="font-black text-primary"> STUDIO</span>
          </span>
        </Link>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expandir menu" : "Minimizar menu"}
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-primary"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {children}
    </div>
  )
}
