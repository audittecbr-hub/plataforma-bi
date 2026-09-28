import 'server-only'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { dashboardAccessDecision, montarContextoUsuario, type PerfilParaContexto } from '@/lib/permissions'
import { UUID } from './manifest'

export class BiAiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'BiAiError'
  }
}

export interface DashboardRow {
  id: string
  name: string
  department: string
  allowed_departments: string[] | null
  assigned_user_id: string | null
  sub_group: string | null
  dataset_id?: string | null
  workspace_id?: string | null
  report_id?: string | null
  ai_enabled?: boolean | null
  ai_manifest?: unknown
  ai_manifest_version?: string | null
  ai_manifest_hash?: string | null
}

export async function authenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new BiAiError(401, 'UNAUTHENTICATED', 'Entre no portal para usar o Chat IA.')
  return { supabase, user }
}

export async function authorizedDashboard(dashboardId: string) {
  if (!UUID.test(dashboardId)) throw new BiAiError(400, 'INVALID_DASHBOARD', 'dashboardId inválido.')
  const { supabase, user } = await authenticatedUser()
  const [{ data: profile, error: profileError }, { data: dashboard, error: dashboardError }] = await Promise.all([
    supabase.from('profiles').select('department, allowed_sub_departments, is_admin, is_leader').eq('id', user.id).single(),
    createAdminClient().from('dashboards').select('*').eq('id', dashboardId).maybeSingle(),
  ])
  if (profileError) console.error('[bi-ai] profile:', profileError)
  if (dashboardError) {
    console.error('[bi-ai] dashboard:', dashboardError)
    throw new BiAiError(503, 'DATABASE_ERROR', 'Não consegui carregar o dashboard.')
  }
  const decision = dashboardAccessDecision(user.id, profile as PerfilParaContexto | null, dashboard as DashboardRow | null)
  if (decision === 404) throw new BiAiError(404, 'DASHBOARD_NOT_FOUND', 'Dashboard não encontrado.')
  if (decision === 403) throw new BiAiError(403, 'DASHBOARD_FORBIDDEN', 'Você não tem acesso a este dashboard.')
  const context = montarContextoUsuario(user.id, profile as PerfilParaContexto | null)
  return { user, profile: profile as PerfilParaContexto | null, dashboard: dashboard as DashboardRow, context }
}

export function apiError(error: unknown): Response {
  if (error instanceof BiAiError) return Response.json({ error: error.message, code: error.code }, { status: error.status })
  console.error('[bi-ai] unexpected:', error)
  return Response.json({ error: 'Falha temporária no Chat IA.', code: 'INTERNAL_ERROR' }, { status: 500 })
}
