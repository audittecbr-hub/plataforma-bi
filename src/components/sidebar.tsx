import Link from "next/link"
import { LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { SidebarNav } from "@/components/sidebar-nav"

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
    <div className="flex h-full w-64 flex-col border-r bg-card text-card-foreground relative">
      {/* Accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-primary via-primary/60 to-transparent z-10 pointer-events-none" />
      <div className="flex h-14 items-center justify-center border-b px-4 lg:h-[60px] lg:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-cinzel text-xl tracking-wider">
            <span className="font-extralight text-foreground/70">GRUPO</span>
            <span className="font-black text-primary"> STUDIO</span>
          </span>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <SidebarNav isAdmin={isAdmin} />
      </div>
      <div className="mt-auto p-4">
        <div className="mb-4 flex items-center gap-3 px-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span className="truncate">{userEmail}</span>
        </div>
        <form action={signOut}>
            <Button variant="outline" className="w-full justify-start gap-2 border-primary/20 hover:bg-primary/10 hover:text-primary">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
        </form>
      </div>
    </div>
  )
}
