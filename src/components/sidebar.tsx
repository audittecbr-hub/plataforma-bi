import { signOut } from "@/app/actions/auth"
import { SidebarNav } from "@/components/sidebar-nav"
import { SidebarShell } from "@/components/sidebar-shell"
import { SidebarUser } from "@/components/sidebar-user"
import type { PortalUser } from "@/lib/user-display"

interface SidebarProps {
  user: PortalUser
}

export async function Sidebar({ user }: SidebarProps) {
  return (
    <SidebarShell>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <SidebarNav isAdmin={user.isAdmin} />
      </div>
      <SidebarUser user={user} signOutAction={signOut} />
    </SidebarShell>
  )
}
