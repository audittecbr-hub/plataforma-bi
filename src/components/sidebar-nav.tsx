"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { NAV_ITEMS, isNavActive } from "@/lib/navigation"
import { Hint } from "@/components/ui/tooltip"
import { useSidebar } from "@/components/sidebar-shell"

interface SidebarNavProps {
  isAdmin?: boolean
}

export function SidebarNav({ isAdmin }: SidebarNavProps) {
  const pathname = usePathname()
  const { collapsed } = useSidebar()

  const portal = NAV_ITEMS.filter((item) => !item.adminOnly)
  const gestao = isAdmin ? NAV_ITEMS.filter((item) => item.adminOnly) : []

  const renderGroup = (titulo: string, itens: typeof NAV_ITEMS) => (
    <div className="space-y-1">
      <p className="eyebrow h-6 overflow-hidden whitespace-nowrap px-[17px] text-[10px] leading-6 text-primary transition-opacity duration-200 group-data-[collapsed=true]/sidebar:opacity-0">
        {titulo}
      </p>
      {itens.map((item) => {
        const Icon = item.icon
        const active = isNavActive(pathname, item.href)
        return (
          <Hint key={item.href} label={item.label} side="right" disabled={!collapsed}>
            <Link
              href={item.href}
              prefetch={true}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group/item relative flex h-10 items-center gap-3 overflow-hidden rounded-[4px] pl-[17px] pr-3 text-[14px] font-semibold outline-none",
                "transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/25",
                active ? "text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  aria-hidden
                  className="absolute inset-0 rounded-[4px] bg-white/[0.07]"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="absolute inset-y-2 left-0 w-[3px] bg-primary" />
                </motion.span>
              )}
              <Icon
                className={cn(
                  "relative size-[18px] shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover/item:text-foreground"
                )}
              />
              <span className="relative truncate transition-opacity duration-200 group-data-[collapsed=true]/sidebar:opacity-0">
                {item.label}
              </span>
            </Link>
          </Hint>
        )
      })}
    </div>
  )

  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-6 px-3 py-5">
      {renderGroup("Portal", portal)}
      {gestao.length > 0 && renderGroup("Gestão", gestao)}
    </nav>
  )
}
