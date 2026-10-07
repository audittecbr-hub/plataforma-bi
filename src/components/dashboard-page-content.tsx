'use client'

import { useEffect } from 'react'
import { ArrowRight, ChartColumnBig, ChevronRight, FolderOpen, Search } from 'lucide-react'
import { BiAiChat } from '@/components/bi-ai-chat'
import { DashboardSelector } from '@/components/dashboard-selector'
import { openDashboardNavigation, useDashboardNavigation } from '@/components/dashboard-navigation-provider'
import { openCommandMenu } from '@/components/topbar'
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
        <section className="relative overflow-hidden rounded-xl border bg-card shadow-sm">
          <span aria-hidden className="absolute left-6 top-0 h-[3px] w-10 bg-gold sm:left-8" />
          <div className="flex flex-col gap-6 px-6 py-8 sm:px-8 sm:py-10 lg:py-12">
            <span className="grid size-12 place-items-center rounded-xl border border-primary/15 bg-gold-wash text-gold-text"><ChartColumnBig aria-hidden className="size-6" /></span>
            <div className="max-w-2xl space-y-3">
              <p className="eyebrow text-[10px] text-gold-text">Portal de inteligência</p>
              <h2 className="text-2xl font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-3xl">Sua visão do negócio começa aqui.</h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">Escolha uma área no menu lateral para acessar seus relatórios, acompanhar metas e consultar resultados.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={openDashboardNavigation} disabled={catalog.totalReports === 0}>Explorar relatórios <ArrowRight aria-hidden className="size-4" /></Button>
              <Button variant="ghost" onClick={openCommandMenu}><Search aria-hidden className="size-4" /> Buscar um relatório</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t bg-background/50 px-6 py-5 text-xs sm:px-8">
            {['Escolha a área', 'Abra a subárea', 'Selecione o relatório'].map((step, index) => (
              <span key={step} className="flex items-center gap-2.5 text-muted-foreground">
                <span className="grid size-6 place-items-center rounded-full border text-[10px] font-bold text-gold-text">{index + 1}</span>{step}
                {index < 2 && <ChevronRight aria-hidden className="ml-1 hidden size-3 text-faint sm:block" />}
              </span>
            ))}
          </div>
        </section>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-2"><FolderOpen aria-hidden className="size-3.5 text-gold-text" />{catalog.totalReports} {catalog.totalReports === 1 ? 'relatório disponível' : 'relatórios disponíveis'} para seu perfil</span>
          <span className="flex items-center gap-2"><Search aria-hidden className="size-3.5 text-gold-text" />A busca encontra áreas, subáreas e projetos.</span>
        </div>
      </>
    )
  }

  const { area, section, dashboard } = selection
  const hasSubarea = section.label !== 'Visão geral'
  const position = section.dashboards.findIndex((report) => report.id === dashboard.id) + 1
  const individual = !!dashboard.assigned_user_id || !!dashboard.sub_group || dashboard.department === 'Metas Líderes'
  const published = !!dashboard.url && !dashboard.url.includes('mock')

  return (
    <div className="flex flex-1 flex-col gap-4">
      <header className="space-y-3">
        <p className="eyebrow flex min-w-0 items-center gap-3 text-gold-text">
          <span aria-hidden className="h-[3px] w-8 shrink-0 bg-gold" />
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><span>{area.label}</span>{hasSubarea && <><ChevronRight aria-hidden className="size-3 shrink-0" /><span className="break-words">{section.label}</span></>}</span>
        </p>
        <div className="flex items-center justify-between gap-3 sm:gap-5">
          <h1 aria-live="polite" className="min-w-0 break-words text-2xl font-extrabold leading-[1.12] tracking-[-0.02em] text-foreground sm:text-[2rem] lg:text-[2.25rem]">{dashboard.name}</h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="outline" size="icon-sm" className="lg:hidden" aria-label="Escolher relatório" title="Escolher relatório" onClick={openDashboardNavigation}><FolderOpen aria-hidden className="size-4" /></Button>
            <BiAiChat key={dashboard.id} dashboardId={dashboard.id} dashboardName={dashboard.name} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground sm:text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-[4px] border bg-card px-2 py-1 text-xs font-semibold text-foreground"><ChartColumnBig aria-hidden className="size-3.5 text-gold-text" />{published ? 'Power BI' : 'Aguardando publicação'}</span>
          <span>{individual ? 'Relatório individual' : 'Relatório da área'}</span>
          <span aria-hidden className="text-faint">·</span>
          <span>Relatório {position} de {section.dashboards.length} {hasSubarea ? 'na subárea' : 'na área'}</span>
        </div>
      </header>
      <div className="flex-1"><DashboardSelector /></div>
    </div>
  )
}
