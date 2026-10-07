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
      <SidebarNav />
      <SidebarUser user={user} signOutAction={signOut} />
    </SidebarShell>
  )
}
