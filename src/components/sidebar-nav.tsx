"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Settings, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarNavProps {
    isAdmin?: boolean
}

export function SidebarNav({ isAdmin }: SidebarNavProps) {
  const pathname = usePathname()

  const navItems = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", active: pathname === "/dashboard" },
    { href: "/dashboard/settings", icon: Settings, label: "Configurações", active: pathname === "/dashboard/settings" },
    ...(isAdmin ? [{ href: "/dashboard/admin", icon: ShieldCheck, label: "Admin", active: pathname === "/dashboard/admin" }] : [])
  ]

  return (
    <nav className="grid items-start px-2 text-sm font-medium lg:px-4 gap-1 group-data-[collapsed=true]/sidebar:px-2 group-data-[collapsed=true]/sidebar:lg:px-2">
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            // O title vira a unica pista do que e o item quando a sidebar esta recolhida.
            title={item.label}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200",
              "group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0",
              item.active
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:bg-card-foreground/5 hover:text-primary"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate group-data-[collapsed=true]/sidebar:hidden">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
