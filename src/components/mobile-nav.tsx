"use client"

import { useEffect, useState } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useTheme } from "next-themes"
import { Menu, Monitor, Moon, Sun, X } from "lucide-react"

import { BrandLogo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { overlayClasses } from "@/components/ui/dialog"
import { SidebarNav } from "@/components/sidebar-nav"
import { SidebarUser } from "@/components/sidebar-user"
import { DASHBOARD_NAVIGATION_EVENT } from "@/components/dashboard-navigation-provider"
import type { PortalUser } from "@/lib/user-display"
import { cn } from "@/lib/utils"

interface MobileNavProps {
  user: PortalUser
  signOutAction: () => Promise<void>
}

const TEMAS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const

/** Gaveta lateral de navegação para telas abaixo de `lg`. */
export function MobileNav({ user, signOutAction }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const onOpen = () => {
      if (window.matchMedia('(max-width: 1023px)').matches) setOpen(true)
    }
    window.addEventListener(DASHBOARD_NAVIGATION_EVENT, onOpen)
    return () => window.removeEventListener(DASHBOARD_NAVIGATION_EVENT, onOpen)
  }, [])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="size-11 rounded-full lg:hidden" aria-label="Abrir menu">
          <Menu className="size-5" />
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content
          className={cn(
            "dark fixed inset-y-0 left-0 z-50 flex w-[90vw] max-w-[360px] flex-col border-r bg-background text-foreground shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=open]:duration-500 data-[state=open]:ease-out-brand",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=closed]:duration-300"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Menu de navegação</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Acesse as áreas do portal, a aparência e a sua sessão.
          </DialogPrimitive.Description>

          <div className="relative flex items-center justify-between px-5 pb-5 pt-6">
            <BrandLogo tone="white" height={36} />
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="size-11" aria-label="Fechar menu">
                <X className="size-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="mx-5 h-px bg-border" />

          <SidebarNav mobile onNavigate={() => setOpen(false)} />

          <div className="relative shrink-0 space-y-3 border-t border-white/10 p-4">
            <div>
              <p className="eyebrow pb-2 text-xs tracking-[0.12em] text-primary">Aparência</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1">
                {TEMAS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-pressed={theme === value}
                    className={cn(
                      "flex h-11 items-center justify-center gap-1.5 rounded-[4px] text-sm font-semibold outline-none transition-colors",
                      "focus-visible:ring-[3px] focus-visible:ring-ring/25",
                      theme === value
                        ? "bg-white text-ink"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <SidebarUser user={user} signOutAction={signOutAction} mobile onNavigate={() => setOpen(false)} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
