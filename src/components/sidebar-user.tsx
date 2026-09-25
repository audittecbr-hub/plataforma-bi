"use client"

import { LogOut } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"
import { Hint } from "@/components/ui/tooltip"
import { useSidebar } from "@/components/sidebar-shell"
import { cn } from "@/lib/utils"
import { describeRole, displayName, type PortalUser } from "@/lib/user-display"

/** Cartão do usuário no rodapé da sidebar, com o logout ao lado. */
export function SidebarUser({ user, signOutAction }: { user: PortalUser; signOutAction: () => Promise<void> }) {
  const { collapsed } = useSidebar()
  const nome = displayName(user)

  const botaoSair = (
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
    <div className="mt-auto p-3">
      <div
        className={cn(
          "flex items-center gap-3 overflow-hidden rounded-xl border bg-card p-2"
        )}
      >
        <Hint label={nome} side="right" disabled={!collapsed}>
          <span className="shrink-0 pl-px">
            <Avatar name={user.fullName} email={user.email} size={34} brand />
          </span>
        </Hint>
        <div className="min-w-0 flex-1 transition-opacity duration-200 group-data-[collapsed=true]/sidebar:opacity-0">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{nome}</p>
          <p className="truncate text-[11.5px] leading-tight text-muted-foreground">{describeRole(user)}</p>
        </div>
        <form action={signOutAction} className="group-data-[collapsed=true]/sidebar:hidden">
          {botaoSair}
        </form>
      </div>
      <form action={signOutAction} className="mt-2 hidden justify-center group-data-[collapsed=true]/sidebar:flex">
        {botaoSair}
      </form>
    </div>
  )
}
