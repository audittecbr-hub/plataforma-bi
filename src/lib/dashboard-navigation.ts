import { DEPARTMENT_GROUPS, DEPARTMENT_SUB_MENUS, MAIN_DEPARTMENTS } from './constants'
import { podeAcessarDashboard, type ContextoUsuario } from './permissions'
import type { Dashboard } from './types'

export interface DashboardSection {
  id: string
  label: string
  dashboards: Dashboard[]
}

export interface DashboardArea {
  id: string
  label: string
  sections: DashboardSection[]
  reportCount: number
}

export interface DashboardCatalog {
  areas: DashboardArea[]
  totalReports: number
  defaultAreaId: string
}

export interface DashboardSelection {
  area: DashboardArea
  section: DashboardSection
  dashboard: Dashboard
}

export interface DashboardLocation {
  areaId?: string | null
  sectionId?: string | null
  dashboardId?: string | null
}

const GENERAL = 'Visão geral'
const LEADER_GOALS = 'Metas Líderes'
const compare = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'pt-BR', { sensitivity: 'base' })
const groupOf = (department: string) => DEPARTMENT_GROUPS[department] || department

/** Monta a hierarquia exclusivamente com os relatórios autorizados no servidor. */
export function buildDashboardCatalog(dashboards: Dashboard[], context: ContextoUsuario): DashboardCatalog {
  const allowedAreas = new Set([context.mainUserDepartment, ...context.allowedSubDepartments.map(groupOf)])
  const allowedSections = new Set([context.department, ...context.allowedSubDepartments])
  const areas = new Map<string, Map<string, Map<string, Dashboard>>>()
  const accessibleIds = new Set<string>()

  for (const dashboard of [...dashboards].sort((a, b) => compare(a.name, b.name))) {
    if (!podeAcessarDashboard(dashboard, context)) continue
    accessibleIds.add(dashboard.id)

    const individual = !!dashboard.assigned_user_id || !!dashboard.sub_group || dashboard.department === LEADER_GOALS
    const relevantAreas = individual
      ? new Set([LEADER_GOALS])
      : new Set([groupOf(dashboard.department), ...(dashboard.allowed_departments ?? []).map(groupOf)])

    if (individual && !context.isDiretoria && dashboard.assigned_user_id === context.userId) {
      relevantAreas.add(context.mainUserDepartment)
    }

    for (const areaId of relevantAreas) {
      if (!context.isDiretoria && areaId !== LEADER_GOALS && !allowedAreas.has(areaId)) continue

      let sectionIds: string[]
      if (areaId === LEADER_GOALS) {
        sectionIds = [dashboard.sub_group || dashboard.department]
      } else if (individual) {
        sectionIds = [LEADER_GOALS]
      } else if (DEPARTMENT_SUB_MENUS[areaId]) {
        sectionIds = [...new Set([dashboard.department, ...(dashboard.allowed_departments ?? [])])]
          .filter((department) => department !== areaId && groupOf(department) === areaId)
          .filter((department) => context.isDiretoria ||
            (context.isManagerOfGroup && areaId === context.mainUserDepartment) || allowedSections.has(department))
        // Relatórios da área inteira continuam acessíveis, mesmo sem uma subárea cadastrada.
        if (sectionIds.length === 0) sectionIds = [GENERAL]
      } else {
        sectionIds = [GENERAL]
      }

      if (!areas.has(areaId)) areas.set(areaId, new Map())
      const sections = areas.get(areaId)!
      for (const sectionId of sectionIds) {
        if (!sections.has(sectionId)) sections.set(sectionId, new Map())
        sections.get(sectionId)!.set(dashboard.id, dashboard)
      }
    }
  }

  const order = [...MAIN_DEPARTMENTS] as string[]
  const catalogAreas = [...areas.entries()]
    .sort(([a], [b]) => {
      const aOrder = order.includes(a) ? order.indexOf(a) : order.length
      const bOrder = order.includes(b) ? order.indexOf(b) : order.length
      return aOrder - bOrder || compare(a, b)
    })
    .map(([id, sectionMap]): DashboardArea => {
      const sectionOrder = [GENERAL, ...(DEPARTMENT_SUB_MENUS[id] ?? [])]
      const sections = [...sectionMap.entries()]
        .sort(([a], [b]) => {
          const aOrder = sectionOrder.includes(a) ? sectionOrder.indexOf(a) : sectionOrder.length
          const bOrder = sectionOrder.includes(b) ? sectionOrder.indexOf(b) : sectionOrder.length
          return aOrder - bOrder || compare(a, b)
        })
        .map(([sectionId, reports]) => ({ id: sectionId, label: sectionId, dashboards: [...reports.values()] }))
      return {
        id,
        label: id === 'Diretoria' ? 'GS — Visão Geral' : id,
        sections,
        reportCount: new Set(sections.flatMap((section) => section.dashboards.map((dashboard) => dashboard.id))).size,
      }
    })

  const preferredArea = context.isDiretoria ? 'Diretoria' : context.mainUserDepartment
  return {
    areas: catalogAreas,
    totalReports: accessibleIds.size,
    defaultAreaId: catalogAreas.find((area) => area.id === preferredArea)?.id ?? catalogAreas[0]?.id ?? '',
  }
}

/** Resolve links e histórico sem aceitar IDs fora do catálogo permitido. */
export function resolveDashboardSelection(catalog: DashboardCatalog, location: DashboardLocation = {}): DashboardSelection | null {
  const preferredArea = catalog.areas.find((area) => area.id === location.areaId)
  if (location.dashboardId) {
    const candidateAreas = preferredArea
      ? [preferredArea, ...catalog.areas.filter((area) => area.id !== preferredArea.id)]
      : catalog.areas
    for (const area of candidateAreas) {
      const preferredSection = area.sections.find((section) => section.id === location.sectionId)
      const sections = preferredSection
        ? [preferredSection, ...area.sections.filter((section) => section.id !== preferredSection.id)]
        : area.sections
      for (const section of sections) {
        const dashboard = section.dashboards.find((report) => report.id === location.dashboardId)
        if (dashboard) return { area, section, dashboard }
      }
    }
  }

  const area = preferredArea ?? catalog.areas.find((item) => item.id === catalog.defaultAreaId) ?? catalog.areas[0]
  if (!area) return null
  const section = area.sections.find((item) => item.id === location.sectionId) ?? area.sections[0]
  if (!section) return null
  const dashboard = section.dashboards.find((item) => item.name.toLowerCase().includes('metas')) ?? section.dashboards[0]
  return dashboard ? { area, section, dashboard } : null
}

export function dashboardHref(areaId: string, sectionId: string, dashboardId: string, basePath = '/dashboard') {
  const params = new URLSearchParams({ area: areaId, subarea: sectionId, report: dashboardId })
  return `${basePath}?${params.toString()}`
}

/** A busca aceita acentos, partes do nome e termos do caminho completo. */
export function filterDashboardAreas(areas: DashboardArea[], query: string): DashboardArea[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return areas
  return areas.flatMap((area) => {
    const sections = area.sections.flatMap((section) => {
      const dashboards = section.dashboards.filter((dashboard) => {
        const path = normalize(`${area.label} ${section.label} ${dashboard.name}`)
        return terms.every((term) => path.includes(term))
      })
      return dashboards.length ? [{ ...section, dashboards }] : []
    })
    return sections.length ? [{
      ...area,
      sections,
      reportCount: new Set(sections.flatMap((section) => section.dashboards.map((dashboard) => dashboard.id))).size,
    }] : []
  })
}
