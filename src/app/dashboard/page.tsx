import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { DEPARTMENT_GROUPS } from '@/lib/constants'
import { DepartmentView } from '@/components/department-view'
import { CompanyOverview } from '@/components/company-overview'
import { Dashboard } from '@/lib/types'

// A página permanece dinâmica porque renderiza conteúdo específico do usuário autenticado.
// Apenas a lista de dashboards (dado não sensível, igual para todos) é cacheada separadamente.
export const dynamic = 'force-dynamic'

// Cache da lista de dashboards por 5 minutos.
// Invalidado automaticamente via revalidateTag('dashboards') sempre que um dashboard é alterado.
const getCachedDashboards = unstable_cache(
    async () => {
        const supabase = createAdminClient()
        const { data } = await supabase
            .from('dashboards')
            .select('*')
            .order('name', { ascending: true })
        return data ?? []
    },
    ['dashboards-list'],
    { revalidate: 300, tags: ['dashboards'] }
)

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profile }, dbDashboards] = await Promise.all([
    supabase
      .from('profiles')
      .select('department, allowed_sub_departments, is_admin, is_leader')
      .eq('id', user.id)
      .single(),
    getCachedDashboards(),
  ])

  // Reforço da ordenação no Frontend (Garante ordem mesmo se o Cache estiver instável)
  const sortedDashboards = dbDashboards ? [...dbDashboards].sort((a, b) => 
    (a.name || '').trim().localeCompare((b.name || '').trim(), 'pt-BR', { sensitivity: 'base' })
  ) : []

  const department = profile?.department || 'Departamento Desconhecido'
  // Resolve the user's main department group (e.g. 'Expansão' -> 'Comercial')
  const mainUserDepartment = DEPARTMENT_GROUPS[department] || department
  const isDiretoria = mainUserDepartment === 'Diretoria' || profile?.is_admin
  const allowedSubDepartments = profile?.allowed_sub_departments || []
  const isManagerOfGroup = DEPARTMENT_GROUPS[department] === department // e.g. Comercial == Comercial
  const isLeader = profile?.is_leader || false

  // Group dashboards by Department Group (for Tabs)
  const dashboardConfig: Record<string, Dashboard[]> = {}

  if (sortedDashboards && sortedDashboards.length > 0) {
      sortedDashboards.forEach((d) => {
          // CHECK PERMISSIONS
          // 1. If Diretoria/Admin, see everything.
          // 2. If it's an individual dashboard (assigned_user_id exists), only the assigned user sees it.
          //    Managers of the same group can also see their subordinates' dashboards.
          // 3. Else, check if dashboard department equals user's department OR is in allowed list.
          // 4. ALSO check if the dashboard belongs to the user's main group (e.g. Comercial user sees Expansão dash)
          const dashboardGroup = DEPARTMENT_GROUPS[d.department] || d.department

          let hasAccess = false;

          if (isDiretoria) {
              hasAccess = true;
          } else if (d.assigned_user_id) {
              // Individual dashboard: próprio dono, ou líder do mesmo sub-dept, ou líder de grupo
              hasAccess = d.assigned_user_id === user.id
                  || (isLeader && d.department === department)
                  || (isLeader && isManagerOfGroup && dashboardGroup === mainUserDepartment);
          } else {
              hasAccess = d.department === department 
                || allowedSubDepartments.includes(d.department)
                || dashboardGroup === department
                || (d.allowed_departments && d.allowed_departments.includes(department))
          }

          if (!hasAccess) return;

          // Map the dashboard's specific department to its main group for TAB grouping (Directory view)
          // For non-directory view, we just pass the list and the Selector groups it internally by sub-department.
          
          // Um dashboard é "individual" (Metas Líderes) se:
          // 1. Tem assigned_user_id (dono explícito), OU
          // 2. Tem sub_group preenchido (marcado como individual pelo admin), OU
          // 3. Tem department === 'Metas Líderes' (legado)
          const isIndividual = !!d.assigned_user_id || !!d.sub_group || d.department === 'Metas Líderes';
          const relevantGroups = new Set<string>();

          if (!isIndividual) {
              // 1. Primary Group
              relevantGroups.add(DEPARTMENT_GROUPS[d.department] || d.department);

              // 2. Allowed Groups - we map them to their main groups too
              if (d.allowed_departments) {
                  d.allowed_departments.forEach((dept: string) => {
                       relevantGroups.add(DEPARTMENT_GROUPS[dept] || dept);
                  });
              }
          } else {
              // Individual Dashboards (Metas Líderes)
              // Forçamos para a tab principal de Metas Líderes para a Diretoria/Admins
              relevantGroups.add('Metas Líderes');

              // Para que os próprios usuários-alvo (que não são Diretoria) possam ver seus relatórios,
              // precisamos garantir que também caiam no seu grupo original
              if (!isDiretoria) {
                  relevantGroups.add(DEPARTMENT_GROUPS[department] || department);
              }
          }

          relevantGroups.forEach(group => {
               if (!dashboardConfig[group]) {
                   dashboardConfig[group] = []
               }

               dashboardConfig[group].push({
                 id: d.id,
                 name: d.name,
                 url: d.embed_url,
                 department: d.department,
                 allowed_departments: d.allowed_departments,
                 assigned_user_id: d.assigned_user_id,
                 sub_group: d.sub_group ?? null,
               })
          });
      })
  }

  // Determine accessible sub-departments
  const userSubDepts = [department]
  if (allowedSubDepartments && allowedSubDepartments.length > 0) {
      userSubDepts.push(...allowedSubDepartments)
  }

  // If the user's main department is a group (e.g. Comercial), they might see all sub-departments if they are managers/admin?
  // Current logic implies:
  // - "Comercial" user -> isManager -> sees all Comercial sub-menus (handled by defaultSubMenus in DepartmentView)
  // - "Expansão" user -> sees "Expansão" + allowed extras.
  
  // We need to pass the explicit list of allowed sub-departments ONLY if we want to restrict or customize it.
  // If we don't pass it, DepartmentView falls back to "All sub-menus for this group".
  
  // Logic:
  // If user is "Comercial" (the group name), we assume Manager -> Don't pass allowedSubDepartments (show all).
  // If user is "Expansão" (a sub-dept), we pass [Expansão, ...allowedExtras] to RESTRICT the view to just those.
  
  let viewAllowedSubDepartments: string[] | undefined = undefined

  if (!isDiretoria && !isManagerOfGroup) {
      // It's a specific sub-department user (e.g. Expansão)
      // They should see their own department + any allowed extras.
      // We must filter out "Visão Geral" or duplications.
      viewAllowedSubDepartments = Array.from(new Set([department, ...allowedSubDepartments]))
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h1 className="text-lg md:text-2xl font-sans font-bold tracking-tight text-foreground">
          {isDiretoria ? 'Visão Geral' : `Dashboard — ${department}`}
        </h1>
      </div>

      <div className="flex-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        {isDiretoria ? (
            <CompanyOverview dashboardConfig={dashboardConfig} isLeader={isLeader || isDiretoria} />
        ) : (
          <DepartmentView
              department={mainUserDepartment}
              dashboards={dashboardConfig[mainUserDepartment] || []}
              allowedSubDepartments={viewAllowedSubDepartments}
              isLeader={isLeader || isDiretoria}
          />
        )}
      </div>
    </div>
  )
}
