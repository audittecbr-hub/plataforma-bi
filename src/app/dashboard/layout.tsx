import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { signOut } from "@/app/actions/auth"
import { AppBackdrop } from "@/components/app-backdrop"
import { CommandMenu } from "@/components/command-menu"
import { Sidebar } from "@/components/sidebar"
import { Topbar } from "@/components/topbar"
import type { PortalUser } from "@/lib/user-display"

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
    .select('change_password_required, is_admin, is_leader, full_name, department')
    .eq('id', user.id)
    .single()

  if (profile?.change_password_required) {
    redirect('/auth/reset-password')
  }

  const portalUser: PortalUser = {
    email: user.email,
    fullName: profile?.full_name ?? null,
    department: profile?.department ?? null,
    isAdmin: profile?.is_admin || false,
    isLeader: profile?.is_leader || false,
  }

  return (
    <div className="relative isolate flex h-dvh w-full overflow-hidden">
      <AppBackdrop />

      <aside className="relative z-30 hidden h-full shrink-0 lg:flex">
        <Sidebar user={portalUser} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={portalUser} signOutAction={signOut} />

        <main id="conteudo" className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto flex min-h-full w-full max-w-[1760px] flex-col gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-8 lg:py-8 2xl:px-10">
            {children}
          </div>
        </main>
      </div>

      <CommandMenu isAdmin={portalUser.isAdmin} signOutAction={signOut} />
    </div>
  )
}
