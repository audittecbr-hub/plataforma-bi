"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronRight, Search } from "lucide-react"

import { BrandLogo, BrandSeal } from "@/components/brand/logo"
import { MobileNav } from "@/components/mobile-nav"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Hint } from "@/components/ui/tooltip"
import { useIsClient } from "@/hooks/use-is-client"
import { ADMIN_SECTIONS, NAV_ITEMS } from "@/lib/navigation"
import type { PortalUser } from "@/lib/user-display"

export const COMMAND_MENU_EVENT = "gs:command-menu"

export function openCommandMenu() {
  window.dispatchEvent(new Event(COMMAND_MENU_EVENT))
}

function AdminCrumb() {
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") || "users"
  const section = ADMIN_SECTIONS.find((s) => s.tab === tab)
  if (!section) return null
  return (
    <>
      <li aria-hidden>
        <ChevronRight className="size-3.5 text-faint" />
      </li>
      <li className="font-semibold text-foreground">{section.label}</li>
    </>
  )
}

function Breadcrumb() {
  const pathname = usePathname()
  const atual = NAV_ITEMS.find((item) => item.href === pathname)
  const isAdmin = pathname === "/dashboard/admin"

  return (
    <nav aria-label="Trilha de navegação" className="hidden min-w-0 lg:block">
      <ol className="flex items-center gap-2 text-sm">
        <li>
          <Link href="/dashboard" className="font-medium text-muted-foreground transition-colors hover:text-foreground">
            Grupo Studio
          </Link>
        </li>
        {atual && (
          <>
            <li aria-hidden>
              <ChevronRight className="size-3.5 text-faint" />
            </li>
            <li className={isAdmin ? "font-medium text-muted-foreground" : "font-semibold text-foreground"}>{atual.label}</li>
          </>
        )}
        {isAdmin && (
          <Suspense fallback={null}>
            <AdminCrumb />
          </Suspense>
        )}
      </ol>
    </nav>
  )
}

function CommandTrigger() {
  const isClient = useIsClient()
  const isMac = isClient && /Mac|iPhone|iPad/.test(navigator.userAgent)

  return (
    <>
      <button
        type="button"
        onClick={openCommandMenu}
        className="group hidden h-9 w-64 items-center gap-2.5 rounded-[4px] border bg-card pl-3 pr-1.5 text-sm text-muted-foreground outline-none transition-[border-color,color] duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 md:flex xl:w-72"
      >
        <Search className="size-4 text-faint transition-colors group-hover:text-primary" />
        <span className="flex-1 text-left">Buscar ou ir para…</span>
        <Kbd className="h-6 px-2">{isMac ? "⌘ K" : "Ctrl K"}</Kbd>
      </button>
      <Hint label="Buscar" side="bottom">
        <Button
          variant="ghost"
          size="icon"
          onClick={openCommandMenu}
          aria-label="Abrir busca"
          className="size-9 rounded-full md:hidden"
        >
          <Search className="size-[18px]" />
        </Button>
      </Hint>
    </>
  )
}

/** Barra superior do portal: trilha, busca (⌘K) e tema; no mobile, também o menu. */
export function Topbar({ user, signOutAction }: { user: PortalUser; signOutAction: () => Promise<void> }) {
  return (
    <header className="glass relative z-20 flex h-16 shrink-0 items-center gap-2 border-b px-3 sm:px-5 lg:h-[72px] lg:px-8">
      <MobileNav user={user} signOutAction={signOutAction} />

      <Link href="/dashboard" aria-label="Grupo Studio — início" className="flex items-center lg:hidden">
        <BrandLogo height={30} className="hidden min-[360px]:inline-flex" />
        <BrandSeal size={30} alt="Grupo Studio" className="min-[360px]:hidden" />
      </Link>

      <Breadcrumb />

      <div className="ml-auto flex items-center gap-1.5">
        <CommandTrigger />
        <ThemeToggle />
      </div>
    </header>
  )
}
