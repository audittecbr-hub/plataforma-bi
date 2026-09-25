"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useTheme } from "next-themes"
import { LogOut, Menu, Monitor, Moon, Sun, X } from "lucide-react"

import { BrandLogo } from "@/components/brand/logo"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { overlayClasses } from "@/components/ui/dialog"
import { NAV_ITEMS, isNavActive } from "@/lib/navigation"
import { describeRole, displayName, type PortalUser } from "@/lib/user-display"
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
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const itens = NAV_ITEMS.filter((item) => !item.adminOnly || user.isAdmin)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="size-9 rounded-full lg:hidden" aria-label="Abrir menu">
          <Menu className="size-5" />
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content
          className={cn(
            "dark fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-[340px] flex-col border-r bg-background text-foreground shadow-xl outline-none",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=open]:duration-500 data-[state=open]:ease-out-brand",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=closed]:duration-300"
          )}
        >
          <DialogPrimitive.Title className="sr-only">Menu de navegação</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Acesse as áreas do portal, a aparência e a sua sessão.
          </DialogPrimitive.Description>

          <div className="relative flex items-center justify-between px-5 pb-5 pt-6">
            <BrandLogo tone="white" height={34} />
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Fechar menu">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="mx-5 h-px bg-border" />

          <nav aria-label="Navegação principal" className="relative flex-1 space-y-1 overflow-y-auto px-3 py-4">
            <p className="eyebrow px-3 pb-2 pt-1 text-[10px] text-primary">Navegação</p>
            {itens.map((item, i) => {
              const Icon = item.icon
              const active = isNavActive(pathname, item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex animate-rise items-center gap-3.5 rounded-[4px] p-3 outline-none transition-colors",
                    "focus-visible:ring-[3px] focus-visible:ring-ring/25",
                    active ? "bg-white/[0.07]" : "hover:bg-accent"
                  )}
                  style={{ animationDelay: `${80 + i * 50}ms` }}
                >
                  {active && <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] bg-primary" />}
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-[4px]",
                      active ? "bg-gold-wash text-primary" : "bg-card text-muted-foreground"
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                </Link>
              )
            })}
          </nav>

          <div className="relative space-y-4 border-t p-4">
            <div>
              <p className="eyebrow pb-2 text-[10px] text-primary">Aparência</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1">
                {TEMAS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    aria-pressed={theme === value}
                    className={cn(
                      "flex h-9 items-center justify-center gap-1.5 rounded-[4px] text-xs font-semibold outline-none transition-colors",
                      "focus-visible:ring-[3px] focus-visible:ring-ring/25",
                      theme === value
                        ? "bg-white text-ink"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border bg-card p-2.5">
              <Avatar name={user.fullName} email={user.email} size={38} brand />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{displayName(user)}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email ?? describeRole(user)}</p>
              </div>
              <form action={signOutAction}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Sair do portal"
                  className="hover:bg-accent hover:text-foreground"
                >
                  <LogOut className="size-4" />
                </Button>
              </form>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
