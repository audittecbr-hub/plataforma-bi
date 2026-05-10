import { Sidebar } from "@/components/sidebar"
import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { MobileNav } from "@/components/mobile-nav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if password change is required and get admin status
  const { data: profile } = await supabase
    .from('profiles')
    .select('change_password_required, is_admin')
    .eq('id', user.id)
    .single()

  if (profile?.change_password_required) {
    redirect('/auth/reset-password')
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background relative">
      <aside className="hidden lg:flex h-full">
         <Sidebar userEmail={user.email} isAdmin={profile?.is_admin || false} />
      </aside>
      <div className="flex flex-col w-full h-full">
        {/* Mobile Header - Glassmorphism & Floating */}
        <div className="lg:hidden fixed top-4 left-4 right-4 z-50 flex items-center justify-between px-4 py-2 bg-card/80 backdrop-blur-md border border-primary/20 rounded-2xl shadow-lg">
            <span className="font-cinzel text-xl text-primary font-bold flex items-center h-10">
                 <span className="text-foreground mr-1">GRUPO</span> STUDIO
            </span>
            <MobileNav isAdmin={profile?.is_admin || false} />
        </div>
        
        <main className="flex flex-1 flex-col gap-4 p-4 pt-24 lg:gap-6 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
