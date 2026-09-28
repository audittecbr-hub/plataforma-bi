/**
 * Regra de acesso a dashboard — fonte única.
 *
 * Esta lógica vivia dentro do laço de app/dashboard/page.tsx. Foi extraída para
 * cá porque o chat de BI precisa da MESMA regra: o navegador informa qual painel
 * está aberto, mas o servidor tem de conferir por conta própria se aquela pessoa
 * pode ver aquele painel. Regra de acesso duplicada em dois lugares é onde a
 * divergência vira brecha — um lado ganha uma exceção, o outro não.
 *
 * A lógica aqui é cópia fiel da que já rodava na página. Não afrouxei nada.
 */

import { DEPARTMENT_GROUPS } from '@/lib/constants'

/** O que a regra precisa saber sobre o dashboard. */
export interface DashboardParaPermissao {
    department: string
    allowed_departments?: string[] | null
    assigned_user_id?: string | null
    sub_group?: string | null
}

/** O que a regra precisa saber sobre quem está pedindo. */
export interface ContextoUsuario {
    userId: string
    /** Departamento do perfil, como está no banco. */
    department: string
    /** Grupo principal do departamento (ex.: 'Expansão' → 'Comercial'). */
    mainUserDepartment: string
    isDiretoria: boolean
    isLeader: boolean
    /** Gerencia o grupo inteiro (ex.: department 'Comercial' == grupo 'Comercial'). */
    isManagerOfGroup: boolean
    allowedSubDepartments: string[]
}

/** Linha da tabela `profiles` usada para montar o contexto. */
export interface PerfilParaContexto {
    department?: string | null
    allowed_sub_departments?: string[] | null
    is_admin?: boolean | null
    is_leader?: boolean | null
}

/**
 * Deriva o contexto do usuário a partir do perfil. Mantido junto da regra para
 * que chat e página cheguem ao MESMO contexto — derivar isso em dois lugares
 * teria o mesmo problema de duplicar a regra.
 */
export function montarContextoUsuario(
    userId: string,
    profile: PerfilParaContexto | null | undefined
): ContextoUsuario {
    const department = profile?.department || 'Departamento Desconhecido'
    const mainUserDepartment = DEPARTMENT_GROUPS[department] || department
    return {
        userId,
        department,
        mainUserDepartment,
        isDiretoria: mainUserDepartment === 'Diretoria' || !!profile?.is_admin,
        isLeader: !!profile?.is_leader,
        isManagerOfGroup: DEPARTMENT_GROUPS[department] === department,
        allowedSubDepartments: profile?.allowed_sub_departments || [],
    }
}

/**
 * Pode esta pessoa ver este dashboard?
 *
 * 1. Diretoria/admin vê tudo.
 * 2. Dashboard individual (tem assigned_user_id): só o dono, ou líder do mesmo
 *    sub-departamento, ou líder do grupo.
 * 3. Caso geral: departamento igual, ou na lista de sub-departamentos liberados,
 *    ou o grupo do dashboard bate com o departamento, ou o departamento consta
 *    em allowed_departments.
 */
export function podeAcessarDashboard(
    d: DashboardParaPermissao,
    ctx: ContextoUsuario
): boolean {
    const dashboardGroup = DEPARTMENT_GROUPS[d.department] || d.department

    if (ctx.isDiretoria) return true

    if (d.assigned_user_id) {
        return d.assigned_user_id === ctx.userId
            || (ctx.isLeader && d.department === ctx.department)
            || (ctx.isLeader && ctx.isManagerOfGroup && dashboardGroup === ctx.mainUserDepartment)
    }

    return d.department === ctx.department
        || ctx.allowedSubDepartments.includes(d.department)
        || dashboardGroup === ctx.department
        || !!(d.allowed_departments && d.allowed_departments.includes(ctx.department))
}

export function dashboardAccessDecision(
    userId: string | null,
    profile: PerfilParaContexto | null | undefined,
    dashboard: DashboardParaPermissao | null | undefined,
): 200 | 401 | 403 | 404 {
    if (!userId) return 401
    if (!dashboard) return 404
    return podeAcessarDashboard(dashboard, montarContextoUsuario(userId, profile)) ? 200 : 403
}

export function conversationBelongsToDashboard(
    conversation: { user_id: string; dashboard_id: string },
    userId: string,
    dashboardId: string,
): boolean {
    return conversation.user_id === userId && conversation.dashboard_id === dashboardId
}
