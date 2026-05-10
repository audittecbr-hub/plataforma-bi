import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getUsers, getDashboards, getAllUsersSimple } from './actions'
import { getContacts, getSchedules, getTemplates, getDefinitions, getAccessLogs } from '@/app/actions/automation'
import { AdminTabsNav } from '@/components/admin/admin-tabs-nav'
import { UsersTab } from '@/components/admin/tabs/users-tab'
import { DashboardsTab } from '@/components/admin/tabs/dashboards-tab'
import { AutomationTab } from '@/components/admin/tabs/automation-tab'
import { TemplatesTab } from '@/components/admin/tabs/templates-tab'
import { AccessLogsTab } from '@/components/admin/tabs/access-logs-tab'
import { Suspense } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

function LoadingSpinner() {
    return (
        <div className="flex flex-col gap-4 mt-4 animate-pulse">
            <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-9 w-48 bg-[#D5AE77]/10" />
                <Skeleton className="h-9 w-32 bg-[#D5AE77]/10" />
            </div>
            
            <div className="rounded-md border border-[#D5AE77]/10 overflow-hidden">
                <div className="h-10 bg-[#D5AE77]/5 w-full border-b border-[#D5AE77]/10" />
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-16 w-full border-b border-[#D5AE77]/10 flex items-center px-4 gap-4">
                        <Skeleton className="h-4 w-1/4 bg-[#D5AE77]/5" />
                        <Skeleton className="h-4 w-1/4 bg-[#D5AE77]/5" />
                        <Skeleton className="h-4 w-1/4 bg-[#D5AE77]/5" />
                        <Skeleton className="h-4 w-1/6 bg-[#D5AE77]/5 ml-auto" />
                    </div>
                ))}
            </div>
        </div>
    )
}

// Separate components for data fetching to allow streaming (if we moved this to loading.tsx/layout, but for now conditional rendering is enough)
async function UsersContent({ page, search }: { page: number, search: string }) {
    const [{ users, totalPages, error }, allUsers] = await Promise.all([
        getUsers(page, 10, search),
        getAllUsersSimple()
    ])
    return <UsersTab users={users} totalPages={totalPages} currentPage={page} search={search} error={error} allUsers={allUsers} />
}

async function DashboardsContent({ page, search }: { page: number; search: string }) {
    const [{ dashboards, totalPages, error }, allUsers] = await Promise.all([
        getDashboards(page, 10, search),
        getAllUsersSimple()
    ])
    return (
        <DashboardsTab
            dashboards={dashboards}
            allUsers={allUsers}
            error={error}
            totalPages={totalPages ?? 1}
            currentPage={page}
            search={search}
        />
    )
}

async function AutomationContent() {
    const [
        { contacts, error: contactsError },
        { schedules, error: schedulesError },
        { definitions }
    ] = await Promise.all([
        getContacts(),
        getSchedules(),
        getDefinitions()
    ])

    // Fetch templates too for passing to Schedule list (if needed) - assumes templates are needed here
    const { templates } = await getTemplates()

    return (
        <AutomationTab 
            schedules={schedules} schedulesError={schedulesError}
            contacts={contacts} contactsError={contactsError}
            definitions={definitions}
            templates={templates}
        />
    )
}

async function TemplatesContent() {
    const { templates, error } = await getTemplates()
    return <TemplatesTab templates={templates} error={error} />
}

async function AccessLogsContent() {
    const { accessLogs, error } = await getAccessLogs()
    return <AccessLogsTab accessLogs={accessLogs} error={error} />
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if current user is admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) {
      redirect('/dashboard')
  }

  const resolvedSearchParams = await searchParams
  const tab = typeof resolvedSearchParams.tab === 'string' ? resolvedSearchParams.tab : 'users'
  const page = typeof resolvedSearchParams.page === 'string' ? parseInt(resolvedSearchParams.page) : 1
  const search = typeof resolvedSearchParams.search === 'string' ? resolvedSearchParams.search : ''

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Painel Administrativo</h1>
      </div>

      <AdminTabsNav />

      <Suspense fallback={<LoadingSpinner />}>
        {tab === 'users' && <UsersContent page={page} search={search} />}
        {tab === 'dashboards' && <DashboardsContent page={page} search={search} />}
        {tab === 'automation' && <AutomationContent />}
        {tab === 'templates' && <TemplatesContent />}
        {tab === 'accessLogs' && <AccessLogsContent />}
      </Suspense>
    </div>
  )
}

