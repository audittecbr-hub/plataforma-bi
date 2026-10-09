'use client'

import { useEffect } from 'react'
import { ChartColumnBig, ChevronRight, FolderOpen } from 'lucide-react'
import { BiAiChat } from '@/components/bi-ai-chat'
import { DashboardSelector } from '@/components/dashboard-selector'
import { DashboardQuickAccess } from '@/components/dashboard-quick-access'
import { DashboardFavoriteButton } from '@/components/dashboard-favorite-button'
import { openDashboardNavigation, useDashboardNavigation } from '@/components/dashboard-navigation-provider'
import { shortcutLocation } from '@/lib/dashboard-shortcuts'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'

export interface DashboardWelcome {
  greeting: string
  name: string
  date: string
  eyebrow: string
}

export function DashboardPageContent({ welcome }: { welcome: DashboardWelcome }) {
  const { catalog, selection } = useDashboardNavigation()
  const reportName = selection?.dashboard.name
  useEffect(() => {
    document.title = `${reportName ?? 'Dashboards'} · Grupo Studio`
  }, [reportName])

  if (!selection) {
    return (
      <>
        <PageHeader
          eyebrow={welcome.eyebrow}
          title={<>{welcome.greeting}, <span className="text-primary">{welcome.name}</span>.</>}
          description={welcome.date}
          actions={
            <dl className="flex items-stretch divide-x rounded-xl border bg-card shadow-xs">
              <div className="space-y-1.5 px-5 py-3">
                <dt className="eyebrow text-[10px] text-faint">Relatórios</dt>
                <dd className="text-[1.75rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-foreground">{catalog.totalReports}</dd>
              </div>
              <div className="space-y-1.5 px-5 py-3">
                <dt className="eyebrow text-[10px] text-faint">Áreas</dt>
                <dd className="text-[1.75rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums text-foreground">{catalog.areas.length}</dd>
              </div>
            </dl>
          }
        />
        <DashboardQuickAccess />
      </>
    )
  }

  const { area, section, dashboard } = selection
  const hasSubarea = section.label !== 'Visão geral'
  const position = section.dashboards.findIndex((report) => report.id === dashboard.id) + 1
  const individual = !!dashboard.assigned_user_id || !!dashboard.sub_group || dashboard.department === 'Metas Líderes'
  const published = !!dashboard.url && !dashboard.url.includes('mock')

  return (
    <div className="dashboard-report flex flex-1 flex-col gap-4">
      <header className="dashboard-report-header shrink-0 space-y-3">
        <p className="eyebrow flex min-w-0 items-center gap-3 text-gold-text">
          <span aria-hidden className="h-[3px] w-8 shrink-0 bg-gold" />
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><span>{area.label}</span>{hasSubarea && <><ChevronRight aria-hidden className="size-3 shrink-0" /><span className="break-words">{section.label}</span></>}</span>
        </p>
        <div className="flex items-center justify-between gap-3 sm:gap-5">
          <h1 aria-live="polite" className="dashboard-report-title min-w-0 break-words text-2xl font-extrabold leading-[1.12] tracking-[-0.02em] text-foreground sm:text-[2rem] lg:text-[2.25rem]">{dashboard.name}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="Escolher relatório" title="Escolher relatório" onClick={openDashboardNavigation}><FolderOpen aria-hidden className="size-4" /></Button>
            <DashboardFavoriteButton location={shortcutLocation(selection)} name={dashboard.name} className="hidden lg:grid" />
            <BiAiChat key={dashboard.id} dashboardId={dashboard.id} dashboardName={dashboard.name} />
          </div>
        </div>
        <div className="dashboard-report-details flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground sm:text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-[4px] border bg-card px-2 py-1 text-xs font-semibold text-foreground"><ChartColumnBig aria-hidden className="size-3.5 text-gold-text" />{published ? 'Power BI' : 'Aguardando publicação'}</span>
          <span>{individual ? 'Relatório individual' : 'Relatório da área'}</span>
          <span aria-hidden className="text-faint">·</span>
          <span>Relatório {position} de {section.dashboards.length} {hasSubarea ? 'na subárea' : 'na área'}</span>
          <DashboardFavoriteButton location={shortcutLocation(selection)} name={dashboard.name} className="ml-auto lg:hidden" />
        </div>
      </header>
      <div className="dashboard-report-viewer flex-1"><DashboardSelector /></div>
    </div>
  )
}
