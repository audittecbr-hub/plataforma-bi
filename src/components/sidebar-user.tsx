"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronsUpDown, LogOut } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"
import { Hint } from "@/components/ui/tooltip"
import { useSidebar } from "@/components/sidebar-shell"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { NAV_ITEMS, isNavActive } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { describeRole, displayName, type PortalUser } from "@/lib/user-display"

interface SidebarUserProps {
  user: PortalUser
  signOutAction: () => Promise<void>
  mobile?: boolean
  onNavigate?: () => void
}

/** O nome e o avatar abrem as opções da conta; o logout continua ao lado. */
export function SidebarUser({ user, signOutAction, mobile = false, onNavigate }: SidebarUserProps) {
  const sidebar = useSidebar()
  const collapsed = !mobile && sidebar.collapsed
  const pathname = usePathname()
  const nome = displayName(user)
  const accountItems = NAV_ITEMS.filter((item) => item.href !== '/dashboard' && (!item.adminOnly || user.isAdmin))

  /**
   * Precisa ser uma FUNÇÃO, não um elemento compartilhado.
   * O botão é renderizado em dois formulários (aberto e recolhido); reutilizar o
   * mesmo objeto de elemento faria o `asChild` do Radix prender o mesmo ref em
   * dois nós do DOM — o que bagunça a reconciliação no momento da hidratação.
   */
  const botaoSair = () => (
    <Hint label="Sair do portal" side={collapsed ? "right" : "top"}>
      <button
        type="submit"
        aria-label="Sair"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[4px] text-muted-foreground outline-none transition-colors",
          "hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25"
        )}
      >
        <LogOut className="size-4" />
      </button>
    </Hint>
  )

  return (
    <div className={cn("mt-auto shrink-0", mobile ? "pt-1" : "border-t border-white/10 p-3")}>
      <div
        className={cn(
          "flex items-center gap-1 overflow-hidden rounded-xl border bg-card p-1.5",
          collapsed && "justify-center p-1"
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Menu da conta de ${nome}`}
              title={collapsed ? `Menu da conta de ${nome}` : undefined}
              className={cn(
                "group/account flex min-w-0 flex-1 items-center gap-2.5 rounded-[4px] p-1 text-left outline-none transition-colors",
                "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/25 data-[state=open]:bg-accent",
                collapsed && "flex-none justify-center"
              )}
            >
              <Avatar name={user.fullName} email={user.email} size={mobile ? 38 : 34} brand />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">{nome}</span>
                    <span className="block truncate text-[11.5px] leading-tight text-muted-foreground">{describeRole(user)}</span>
                  </span>
                  <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-faint transition-colors group-hover/account:text-primary" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top" align="start" sideOffset={10} collisionPadding={12}
            aria-label="Opções da conta"
            className="dark w-[280px] max-w-[calc(100vw-24px)] border-white/10"
          >
            <DropdownMenuLabel className="pb-2 text-primary">Minha conta</DropdownMenuLabel>
            {accountItems.map((item) => {
              const Icon = item.icon
              const active = isNavActive(pathname, item.href)
              return (
                <DropdownMenuItem key={item.href} asChild className={cn(active && "bg-gold-wash text-primary")}>
                  <Link href={item.href} prefetch={false} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
                    <Icon aria-hidden />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {!collapsed && <form action={signOutAction}>{botaoSair()}</form>}
      </div>
      {collapsed && <form action={signOutAction} className="mt-2 flex justify-center">{botaoSair()}</form>}
    </div>
  )
}
