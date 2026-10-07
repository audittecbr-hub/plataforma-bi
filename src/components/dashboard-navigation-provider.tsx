"use client"

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  dashboardHref,
  resolveDashboardSelection,
  type DashboardCatalog,
  type DashboardSelection,
} from '@/lib/dashboard-navigation'

interface NavigationContextValue {
  catalog: DashboardCatalog
  selection: DashboardSelection | null
  isDashboardPage: boolean
  hrefFor: (areaId: string, sectionId: string, dashboardId: string) => string
  selectDashboard: (areaId: string, sectionId: string, dashboardId: string) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export const DASHBOARD_NAVIGATION_EVENT = 'gs:dashboard-navigation'

/** Abre a navegação adequada ao tamanho da tela e focaliza a busca no desktop. */
export function openDashboardNavigation() {
  window.dispatchEvent(new Event(DASHBOARD_NAVIGATION_EVENT))
}

export function useDashboardNavigation() {
  const context = useContext(NavigationContext)
  if (!context) throw new Error('DashboardNavigationProvider ausente')
  return context
}

/** A URL guarda a seleção; voltar, avançar e compartilhar preservam o relatório. */
export function DashboardNavigationProvider({
  catalog,
  children,
  basePath = '/dashboard',
}: { catalog: DashboardCatalog; children: ReactNode; basePath?: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const router = useRouter()
  const areaId = params.get('area')
  const sectionId = params.get('subarea')
  const dashboardId = params.get('report')
  const isDashboardPage = pathname === basePath
  const selection = useMemo(
    () => areaId || sectionId || dashboardId
      ? resolveDashboardSelection(catalog, { areaId, sectionId, dashboardId })
      : null,
    [catalog, areaId, sectionId, dashboardId],
  )
  const hrefFor = useCallback(
    (area: string, section: string, report: string) => dashboardHref(area, section, report, basePath),
    [basePath],
  )
  const selectDashboard = useCallback((area: string, section: string, report: string) => {
    const href = hrefFor(area, section, report)
    if (isDashboardPage) {
      // Integrado ao App Router: troca o painel sem refazer sessão e consultas no servidor.
      if (`${window.location.pathname}${window.location.search}` !== href) window.history.pushState(null, '', href)
    } else {
      router.push(href)
    }
  }, [hrefFor, isDashboardPage, router])

  return (
    <NavigationContext.Provider value={{ catalog, selection, isDashboardPage, hrefFor, selectDashboard }}>
      {children}
    </NavigationContext.Provider>
  )
}
