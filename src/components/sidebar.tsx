import { LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { SidebarNav } from "@/components/sidebar-nav"
import { SidebarShell } from "@/components/sidebar-shell"

interface SidebarProps {
  userEmail?: string | null
  isAdmin: boolean
}

export async function Sidebar({ userEmail, isAdmin }: SidebarProps) {
  async function signOut() {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    
    // Clear the session-only preference cookie
    const cookieStore = await cookies()
    cookieStore.delete('sb-session-only')
    
    redirect('/login')
  }

  return (
    <SidebarShell>
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        <SidebarNav isAdmin={isAdmin} />
      </div>
      <div className="mt-auto p-4 group-data-[collapsed=true]/sidebar:px-2">
        <div className="mb-4 flex items-center gap-3 px-2 text-sm text-muted-foreground group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0">
          <User className="h-4 w-4 shrink-0" />
          <span className="truncate group-data-[collapsed=true]/sidebar:hidden">{userEmail}</span>
        </div>
        <form action={signOut}>
            <Button
              variant="outline"
              title="Sair"
              className="w-full justify-start gap-2 border-primary/20 hover:bg-primary/10 hover:text-primary group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="group-data-[collapsed=true]/sidebar:hidden">Sair</span>
            </Button>
        </form>
      </div>
    </SidebarShell>
  )
}
