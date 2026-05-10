'use server'

import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"
import { revalidatePath, revalidateTag } from "next/cache"

export type AdminUser = {
  id: string
  email: string
  full_name: string | null
  department: string | null
  is_admin: boolean | null
  is_leader: boolean
  allowed_dashboards: string[] | null
  allowed_sub_departments: string[] | null
  created_at: string
}

export type PowerBIRefreshLog = {
    id: string
    created_at: string
    details: Record<string, unknown> | null
    event_type: string
}

// Verifica se o usuário da sessão atual é administrador
async function requireAdmin(): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single()

    if (!profile?.is_admin) {
        throw new Error('Acesso negado: permissão de administrador necessária')
    }
}

export async function getAllUsersSimple(): Promise<{ id: string; name: string }[]> {
    const supabase = createAdminClient()
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name', { ascending: true })
    if (!data) return []
    return data.map(d => ({ id: d.id, name: d.full_name || 'N/A' }))
}

export async function getUsers(
    page = 1, 
    limit = 10, 
    search = ''
): Promise<{ success: boolean; users?: AdminUser[]; totalPages?: number; totalCount?: number; error?: string }> {
  try {
    const supabase = createAdminClient()
    
    // Pagination calculation
    const from = (page - 1) * limit
    const to = from + limit - 1

    // 1. Fetch Profiles with Pagination & Search
    let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('full_name', { ascending: true })
    
    if (search) {
        query = query.ilike('full_name', `%${search}%`)
    }

    const { data: profiles, count, error } = await query.range(from, to)

    if (error) {
        console.error('Error fetching profiles:', error)
        return { success: false, error: 'Falha ao buscar usuários' }
    }
    
    if (!profiles || profiles.length === 0) {
        return { success: true, users: [], totalPages: 0, totalCount: 0 }
    }

    // 2. Busca dados de auth em lote — uma única chamada em vez de N requisições individuais
    const { data: authData, error: listError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
    })

    if (listError) {
        console.error('Error fetching auth users list:', listError)
    }

    // Mapa para lookup O(1) por ID de usuário
    const authUserMap = new Map(
        (authData?.users ?? []).map(u => [u.id, u])
    )

    const combinedUsers: AdminUser[] = profiles.map((profile) => {
        const authUser = authUserMap.get(profile.id)

        // Se o usuário foi removido do auth mas o perfil ainda existe, trata graciosamente
        const email = authUser?.email ?? ''
        const createdAt = authUser?.created_at ?? new Date().toISOString()

        return {
            id: profile.id,
            email,
            full_name: profile.full_name || 'N/A',
            department: profile.department || 'N/A',
            is_admin: profile.is_admin || false,
            is_leader: profile.is_leader || false,
            allowed_dashboards: profile.allowed_dashboards || [],
            allowed_sub_departments: profile.allowed_sub_departments || [],
            created_at: createdAt,
        }
    })

    const totalCount = count || 0
    const totalPages = Math.ceil(totalCount / limit)

    return { 
        success: true, 
        users: combinedUsers,
        totalPages,
        totalCount
    }

  } catch (error: unknown) {
    console.error('Admin getUsers error:', error)
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    return { success: false, error: message }
  }
}

export async function createUser(formData: FormData) {
  await requireAdmin()
  const supabase = createAdminClient()
  
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string
  const department = formData.get('department') as string
  const allowedSubDepartments = formData.get('allowedSubDepartments')?.toString().split(',').filter(Boolean) || []
  const isAdmin = formData.get('isAdmin') === 'on'
  const is_leader = formData.get('isLeader') === 'on'
  
  if (!email || !password || !fullName) {
      return { success: false, error: 'Campos obrigatórios ausentes' }
  }

  try {
    // 1. Create Auth User
    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName }
    })

    if (createError || !user) {
        console.error('Auth create error:', createError)
        return { success: false, error: createError?.message || 'Falha ao criar usuário' }
    }

    // 2. Create/Update Profile
    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            id: user.id,
            full_name: fullName,
            department: department,
            is_admin: isAdmin,
            is_leader,
            allowed_sub_departments: allowedSubDepartments,
            change_password_required: true
        })

    if (profileError) {
        console.error('Profile create error:', profileError)
        return { success: false, error: 'Usuário criado, mas falha no perfil: ' + profileError.message }
    }

    // 3. Generate secure password-setup link and send welcome email (never send raw password)
    const { sendEmail, getWelcomeEmailTemplate } = await import('@/lib/email');
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const { data: linkData } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${siteUrl}/auth/callback?next=/dashboard` },
    });

    const setupLink = linkData?.properties?.action_link ?? `${siteUrl}/login`;

    await sendEmail({
        to: email,
        subject: 'Bem-vindo ao Portal Grupo Studio',
        html: getWelcomeEmailTemplate(fullName, setupLink, email)
    })

    revalidatePath('/dashboard/admin')
    return { success: true, message: 'Usuário criado com sucesso' }

  } catch (e: unknown) {
      console.error('Create User Error:', e)
      const message = e instanceof Error ? e.message : 'Unknown error'
      return { success: false, error: 'Erro inesperado: ' + message }
  }
}

export async function updateUser(formData: FormData) {
    await requireAdmin()
    const supabase = createAdminClient()
    
    const userId = formData.get('id') as string
    const fullName = formData.get('fullName') as string
    const department = formData.get('department') as string
    const allowedSubDepartments = formData.get('allowedSubDepartments')?.toString().split(',').filter(Boolean) || []
    const isAdmin = formData.get('isAdmin') === 'on'
    const is_leader = formData.get('isLeader') === 'on'

    if (!userId) return { success: false, error: 'ID do usuário ausente' }

    try {
        // 1. Update Profile
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                full_name: fullName,
                department: department,
                allowed_sub_departments: allowedSubDepartments,
                is_admin: isAdmin,
                is_leader,
            })
            .eq('id', userId)

        if (profileError) {
            return { success: false, error: profileError.message }
        }

        revalidatePath('/dashboard/admin')
        return { success: true }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        return { success: false, error: message }
    }
}

export async function deleteUser(userId: string) {
    await requireAdmin()
    const supabase = createAdminClient()
    
    try {
        // 1. Delete profile first (to avoid FK constraints if ON DELETE CASCADE is missing)
        const { error: profileError } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId)

        if (profileError) {
            console.error('Error deleting profile:', profileError)
            return { success: false, error: 'Falha ao excluir perfil do usuário: ' + profileError.message }
        }

        // 2. Delete Auth User
        const { error } = await supabase.auth.admin.deleteUser(userId)
        
        if (error) {
            console.error('Error deleting auth user:', error)
            return { success: false, error: 'Falha ao excluir conta de autenticação: ' + error.message }
        }
        
        revalidatePath('/dashboard/admin')
        return { success: true }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        return { success: false, error: message }
    }
}

// --- Dashboard Actions ---

export type Dashboard = {
    id: string
    name: string
    department: string
    embed_url: string
    allowed_departments: string[] | null
    assigned_user_id: string | null
    sub_group: string | null // Sub-categoria dentro de "Metas Líderes" (ex: 'Franchising', 'Tecnologia')
    created_at: string
}

export async function getDashboards(
    page = 1,
    limit = 10,
    search = ''
): Promise<{ success: boolean; dashboards?: Dashboard[]; totalPages?: number; totalCount?: number; error?: string }> {
    try {
        const supabase = createAdminClient()

        // Cálculo de paginação
        const from = (page - 1) * limit
        const to = from + limit - 1

        let query = supabase
            .from('dashboards')
            .select('*', { count: 'exact' })
            .order('department', { ascending: true })
            .order('name', { ascending: true })

        // Filtra por nome ou departamento se houver busca
        if (search) {
            query = query.or(`name.ilike.%${search}%,department.ilike.%${search}%`)
        }

        const { data, count, error } = await query.range(from, to)

        if (error) {
            console.error('Error fetching dashboards:', error)
            return { success: false, error: error.message }
        }

        const totalCount = count || 0
        const totalPages = Math.ceil(totalCount / limit)

        return { success: true, dashboards: data as Dashboard[], totalPages, totalCount }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Erro interno do servidor'
        return { success: false, error: message }
    }
}

export async function manageDashboard(formData: FormData) {
    await requireAdmin()
    const supabase = createAdminClient()
    
    const id = formData.get('id') as string | null
    const name = formData.get('name') as string
    const department = formData.get('department') as string
    const embedUrl = formData.get('embedUrl') as string
    const allowedDepartments = formData.get('allowedDepartments')?.toString().split(',').filter(Boolean) || []
    const assignedUserIdRaw = formData.get('assignedUserId') as string
    const assigned_user_id = assignedUserIdRaw === 'none' || !assignedUserIdRaw ? null : assignedUserIdRaw
    const subGroupRaw = formData.get('subGroup') as string
    const sub_group = subGroupRaw && subGroupRaw.trim() && subGroupRaw !== 'none' ? subGroupRaw.trim() : null
    const actionType = formData.get('actionType') as string // 'create', 'update', 'delete'

    if (actionType === 'delete' && id) {
         const { error } = await supabase.from('dashboards').delete().eq('id', id)
         if (error) return { success: false, error: error.message }
         revalidatePath('/dashboard/admin')
         revalidatePath('/dashboard')
         revalidateTag('dashboards', 'max')
         return { success: true }
    }

    if (!name || !department || !embedUrl) {
        return { success: false, error: 'Campos obrigatórios ausentes' }
    }

    try {
        if (id) {
            // Update
            const { error } = await supabase
                .from('dashboards')
                .update({
                    name,
                    department,
                    embed_url: embedUrl,
                    allowed_departments: allowedDepartments,
                    assigned_user_id,
                    sub_group
                })
                .eq('id', id)

            if (error) return { success: false, error: error.message }

        } else {
            // Create
            const { error } = await supabase
                .from('dashboards')
                .insert({
                    name,
                    department,
                    embed_url: embedUrl,
                    allowed_departments: allowedDepartments,
                    assigned_user_id,
                    sub_group
                })
            
            if (error) return { success: false, error: error.message }
        }


        revalidatePath('/dashboard/admin')
        revalidatePath('/dashboard')
        revalidateTag('dashboards', 'max')
        return { success: true }

    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Erro inesperado'
        return { success: false, error: message }
    }
}

export async function deleteDashboard(id: string) {
    await requireAdmin()
    const supabase = createAdminClient()

    try {
        const { error } = await supabase.from('dashboards').delete().eq('id', id)

        if (error) {
            return { success: false, error: error.message }
        }

        revalidatePath('/dashboard/admin')
        revalidatePath('/dashboard')
        revalidateTag('dashboards', 'max')
        return { success: true }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Erro inesperado'
        return { success: false, error: message }
    }
}

export async function refreshDashboards(names: string[]) {
    await requireAdmin()
    try {
        const { triggerDatasetRefresh, PBI_DATASETS, PBI_WORKSPACE_ID } = await import('@/lib/powerbi')
        const supabase = createAdminClient()

        // Expande "all" para todos os dashboards mapeados
        const targets = names.includes('all') ? Object.keys(PBI_DATASETS) : names

        // Valida os nomes antes de chamar a API
        const invalidos = targets.filter(n => !PBI_DATASETS[n])
        if (invalidos.length > 0) {
            return { success: false, error: `Dashboards desconhecidos: ${invalidos.join(', ')}` }
        }

        const results: Record<string, boolean> = {}

        for (const name of targets) {
            const datasetId = PBI_DATASETS[name]
            try {
                const ok = await triggerDatasetRefresh(PBI_WORKSPACE_ID, datasetId)
                results[name] = ok

                // Grava log de sucesso ou falha no Supabase
                await supabase.from('automation_logs').insert({
                    event_type: ok ? 'job_success' : 'job_error',
                    details: { job: 'pbi_refresh_dashboards', dashboard: name },
                })
            } catch (e) {
                results[name] = false
                await supabase.from('automation_logs').insert({
                    event_type: 'job_error',
                    details: {
                        job: 'pbi_refresh_dashboards',
                        dashboard: name,
                        error: e instanceof Error ? e.message : String(e),
                    },
                })
            }
        }

        return { success: true, results }
    } catch (error: unknown) {
        console.error('Refresh Dashboards Error:', error)
        const message = error instanceof Error ? error.message : 'Erro ao disparar atualização'
        return { success: false, error: message }
    }
}


export async function getPowerBIRefreshLogs() {
    try {
        const supabase = createAdminClient()
        // Busca tanto erros quanto sucessos do job de refresh de dashboards
        const { data, error } = await supabase
            .from('automation_logs')
            .select('*')
            .in('event_type', ['job_success', 'job_error'])
            .or(`details->>job.eq.pbi_refresh_dashboards,details->>job.eq.pbi_refresh_dashboards`)
            .filter('details->>job', 'eq', 'pbi_refresh_dashboards')
            .order('created_at', { ascending: false })
            .limit(30)

        if (error) {
            console.error('getPowerBIRefreshLogs query error:', error)
        }

        return { success: true, logs: data ?? [] }
    } catch (error: unknown) {
        console.error('getPowerBIRefreshLogs error:', error)
        return { success: false, error: 'Falha ao buscar logs', logs: [] }
    }
}

export async function getDashboardsRefreshStatus() {
    try {
        const { getAllDatasetsRefreshStatus, PBI_WORKSPACE_ID } = await import('@/lib/powerbi')
        const status = await getAllDatasetsRefreshStatus(PBI_WORKSPACE_ID)
        return { success: true, status }
    } catch (error: unknown) {
        console.error('getDashboardsRefreshStatus error:', error)
        return { success: false, error: 'Falha ao consultar status dos dashboards', status: {} }
    }
}

export async function listWorkspaceDatasetsAction() {
    await requireAdmin()
    try {
        const { listWorkspaceDatasets, PBI_WORKSPACE_ID } = await import('@/lib/powerbi')
        const datasets = await listWorkspaceDatasets(PBI_WORKSPACE_ID)
        return { success: true, datasets }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message, datasets: [] }
    }
}

export async function resetUserPassword(userId: string) {
    await requireAdmin()
    const supabase = createAdminClient()
    
    try {
        // 1. Reset password in Auth to "123456"
        const { error: authError } = await supabase.auth.admin.updateUserById(
            userId,
            { password: '123456' }
        )

        if (authError) {
            console.error('Reset password auth error:', authError)
            return { success: false, error: 'Falha ao redefinir senha no Auth: ' + authError.message }
        }

        // 2. Mark profile as change_password_required
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ change_password_required: true })
            .eq('id', userId)

        if (profileError) {
            console.error('Reset password profile update error:', profileError)
            return { success: false, error: 'Senha redefinida, mas falha ao marcar obrigatoriedade de troca: ' + profileError.message }
        }

        revalidatePath('/dashboard/admin')
        return { success: true, message: 'Senha redefinida para 123456 com sucesso' }
    } catch (e: unknown) {
        console.error('Reset User Password error:', e)
        const message = e instanceof Error ? e.message : 'Erro inesperado'
        return { success: false, error: message }
    }
}
