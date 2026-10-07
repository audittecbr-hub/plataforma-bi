import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { buildDashboardCatalog } from '@/lib/dashboard-navigation'
import { montarContextoUsuario } from '@/lib/permissions'
import type { Dashboard } from '@/lib/types'

const getCachedDashboards = unstable_cache(
  async () => {
    const { data, error } = await createAdminClient()
      .from('dashboards')
      .select('id, name, embed_url, department, allowed_departments, assigned_user_id, sub_group')
      .order('name', { ascending: true })
    if (error) throw error
    return (data ?? []).map((row): Dashboard => ({
      id: row.id,
      name: row.name,
      url: row.embed_url,
      department: row.department,
      allowed_departments: row.allowed_departments,
      assigned_user_id: row.assigned_user_id,
      sub_group: row.sub_group ?? null,
    }))
  },
  ['dashboard-navigation-list'],
  { revalidate: 300, tags: ['dashboards'] },
)

/** Compartilha sessão, perfil e catálogo entre layout e página na mesma requisição. */
export const getDashboardData = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile, error }, dashboards] = await Promise.all([
    supabase.from('profiles')
      .select('department, allowed_sub_departments, is_admin, is_leader, full_name, change_password_required')
      .eq('id', user.id)
      .single(),
    getCachedDashboards(),
  ])
  if (error) throw error
  if (profile?.change_password_required) redirect('/auth/reset-password')

  const permissionContext = montarContextoUsuario(user.id, profile)
  return { user, profile, permissionContext, catalog: buildDashboardCatalog(dashboards, permissionContext) }
})
