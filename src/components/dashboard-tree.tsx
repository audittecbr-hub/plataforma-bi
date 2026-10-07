"use client"

import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { ChartColumnBig, Check, ChevronRight, Folder, Search, SearchX, X } from 'lucide-react'
import { DASHBOARD_NAVIGATION_EVENT, openDashboardNavigation, useDashboardNavigation } from '@/components/dashboard-navigation-provider'
import { useSidebar } from '@/components/sidebar-shell'
import { Hint } from '@/components/ui/tooltip'
import { GROUP_META } from '@/lib/department-meta'
import { filterDashboardAreas, type DashboardArea, type DashboardSection } from '@/lib/dashboard-navigation'
import { cn } from '@/lib/utils'

interface DashboardTreeProps {
  mobile?: boolean
  onNavigate?: () => void
}

/** Navegação por disclosure: área → subárea → relatório, compartilhada com o celular. */
export function DashboardTree({ mobile = false, onNavigate }: DashboardTreeProps) {
  const { catalog, selection, isDashboardPage, hrefFor, selectDashboard } = useDashboardNavigation()
  const sidebar = useSidebar()
  const expandSidebar = sidebar.expand
  const collapsed = !mobile && sidebar.collapsed
  const [query, setQuery] = useState('')
  const id = useId()
  const activeLink = useRef<HTMLAnchorElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const current = isDashboardPage ? selection : null
  const selectionKey = current ? `${current.area.id}/${current.section.id}/${current.dashboard.id}` : ''
  const [expanded, setExpanded] = useState({ selectionKey, areaId: current?.area.id ?? '', sectionId: current?.section.id ?? '' })
  // Uma nova seleção (inclusive voltar/avançar) revela seu caminho. O usuário
  // pode recolher um ramo manualmente enquanto o relatório não muda.
  const openArea = expanded.selectionKey === selectionKey ? expanded.areaId : current?.area.id ?? ''
  const openSection = expanded.selectionKey === selectionKey ? expanded.sectionId : current?.section.id ?? ''
  const searching = query.trim().length > 0
  const areas = useMemo(() => filterDashboardAreas(catalog.areas, query), [catalog.areas, query])
  const resultCount = new Set(areas.flatMap((area) => area.sections.flatMap((section) => section.dashboards.map((report) => report.id)))).size

  useEffect(() => {
    if (!collapsed && !searching) activeLink.current?.scrollIntoView({ block: 'nearest' })
  }, [selectionKey, collapsed, searching])

  useEffect(() => {
    const onOpen = () => {
      if (mobile || !window.matchMedia('(min-width: 1024px)').matches) return
      expandSidebar()
      requestAnimationFrame(() => searchInput.current?.focus())
    }
    window.addEventListener(DASHBOARD_NAVIGATION_EVENT, onOpen)
    return () => window.removeEventListener(DASHBOARD_NAVIGATION_EVENT, onOpen)
  }, [mobile, expandSidebar])

  const toggleArea = (areaId: string, forceOpen?: boolean) => {
    if (collapsed) sidebar.expand()
    setExpanded({
      selectionKey,
      areaId: forceOpen || collapsed || openArea !== areaId ? areaId : '',
      sectionId: current?.area.id === areaId ? current.section.id : '',
    })
  }
  const toggleSection = (areaId: string, sectionId: string, forceOpen?: boolean) => {
    setExpanded({ selectionKey, areaId, sectionId: forceOpen || openSection !== sectionId ? sectionId : '' })
  }
  const disclosureKey = (event: KeyboardEvent<HTMLButtonElement>, toggle: (open: boolean) => void) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      toggle(event.key === 'ArrowRight')
    }
  }
  const navigate = (event: MouseEvent<HTMLAnchorElement>, area: DashboardArea, section: DashboardSection, reportId: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    selectDashboard(area.id, section.id, reportId)
    setQuery('')
    setExpanded({ selectionKey: `${area.id}/${section.id}/${reportId}`, areaId: area.id, sectionId: section.id })
    onNavigate?.()
  }
  const renderReports = (area: DashboardArea, section: DashboardSection) => (
    <ul aria-label={`Relatórios de ${area.label} · ${section.label}`} className="max-h-[min(28dvh,208px)] space-y-0.5 overflow-y-auto overscroll-contain py-1 pr-1">
      {section.dashboards.map((report) => {
        const active = current?.dashboard.id === report.id && current.area.id === area.id && current.section.id === section.id
        return (
          <li key={report.id}>
            <Link
              ref={active ? activeLink : undefined}
              href={hrefFor(area.id, section.id, report.id)} prefetch={false}
              onClick={(event) => navigate(event, area, section, report.id)}
              aria-current={active ? 'page' : undefined} title={report.name}
              className={cn(
                'group/report relative flex min-h-9 items-start gap-2 rounded-[4px] px-2.5 py-2 text-[12.5px] leading-[1.4] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-gold-wash font-semibold text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
              <ChartColumnBig aria-hidden className="mt-px size-3.5 shrink-0 opacity-70" />
              <span className="min-w-0 flex-1 break-words">{report.name}</span>
              {active && <Check aria-hidden className="mt-px size-3.5 shrink-0" />}
            </Link>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('shrink-0 px-3 pb-2 pt-4', collapsed && 'px-0')}>
        <div className="mb-2 flex h-5 items-center justify-between px-2">
          <p className={cn('eyebrow whitespace-nowrap text-[9px] text-primary', collapsed && 'sr-only')}>Áreas e projetos</p>
          {!collapsed && <span className="text-[10px] tabular-nums text-faint">{catalog.areas.length} áreas</span>}
        </div>
        {collapsed ? (
          <Hint label="Buscar áreas e relatórios" side="right">
            <button type="button" onClick={openDashboardNavigation} aria-label="Buscar áreas e relatórios" className="mx-auto grid size-10 place-items-center rounded-[4px] text-muted-foreground outline-none hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
              <Search aria-hidden className="size-4" />
            </button>
          </Hint>
        ) : (
          <div className="relative flex h-9 items-center gap-2 rounded-[4px] border border-white/10 bg-white/[0.035] px-2.5 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10">
            <Search aria-hidden className="size-3.5 shrink-0 text-faint" />
            <input
              ref={searchInput}
              type="search" aria-label="Buscar áreas e relatórios" placeholder="Buscar área ou relatório…"
              value={query} onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setQuery('') }}
              className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca" className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><X aria-hidden className="size-3" /></button>}
          </div>
        )}
        {!collapsed && searching && <p role="status" className="px-1 pt-2 text-[11px] text-muted-foreground">{resultCount} {resultCount === 1 ? 'relatório encontrado' : 'relatórios encontrados'}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
        <ul aria-label="Áreas, subáreas e relatórios" className="space-y-1">
          {areas.map((area, areaIndex) => {
            const Icon = GROUP_META[area.id]?.icon ?? Folder
            const active = current?.area.id === area.id
            const areaOpen = !collapsed && (searching || openArea === area.id)
            const areaContentId = `${id}-area-${areaIndex}`
            const directReports = area.sections.length === 1 && area.sections[0].id === 'Visão geral'
            return (
              <li key={area.id}>
                <Hint label={area.label} side="right" disabled={!collapsed}>
                  <button
                    type="button" aria-label={area.label} aria-expanded={areaOpen} aria-controls={areaContentId}
                    onClick={() => toggleArea(area.id)}
                    onKeyDown={(event) => disclosureKey(event, (open) => {
                      if (open) toggleArea(area.id, true)
                      else setExpanded({ selectionKey, areaId: '', sectionId: '' })
                    })}
                    className={cn(
                      'group/area flex min-h-10 w-full items-center gap-2.5 rounded-[4px] px-3 text-left text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      active ? 'bg-white/[0.055] text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon aria-hidden className={cn('size-[17px] shrink-0', active ? 'text-primary' : 'text-faint group-hover/area:text-primary')} />
                    {!collapsed && <>
                      <span className="min-w-0 flex-1">{area.label}</span>
                      <span className={cn('min-w-5 text-center text-[10px] font-medium tabular-nums', active ? 'text-primary' : 'text-faint')}>{area.reportCount}</span>
                      <ChevronRight aria-hidden className={cn('size-3.5 shrink-0 text-faint transition-transform duration-200 motion-reduce:transition-none', areaOpen && 'rotate-90')} />
                    </>}
                  </button>
                </Hint>
                <div id={areaContentId} hidden={!areaOpen} className="ml-5 border-l border-white/10 pl-2 motion-safe:animate-[fade_180ms_ease-out]">
                  {areaOpen && (directReports ? renderReports(area, area.sections[0]) : (
                    <ul className="space-y-0.5 py-1">
                      {area.sections.map((section, sectionIndex) => {
                        const sectionActive = active && current.section.id === section.id
                        const sectionOpen = searching || openSection === section.id
                        const sectionContentId = `${areaContentId}-section-${sectionIndex}`
                        return (
                          <li key={section.id}>
                            <button
                              type="button" aria-label={`${area.label} — ${section.label}`} aria-expanded={sectionOpen} aria-controls={sectionContentId}
                              onClick={() => toggleSection(area.id, section.id)}
                              onKeyDown={(event) => disclosureKey(event, (open) => {
                                if (open) toggleSection(area.id, section.id, true)
                                else setExpanded({ selectionKey, areaId: area.id, sectionId: '' })
                              })}
                              className={cn(
                                'flex min-h-9 w-full items-start gap-2 rounded-[4px] px-2 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                                sectionActive ? 'font-semibold text-primary' : 'font-medium text-muted-foreground hover:bg-accent hover:text-foreground',
                              )}
                            >
                              <ChevronRight aria-hidden className={cn('mt-px size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none', sectionOpen && 'rotate-90')} />
                              <span className="min-w-0 flex-1 break-words leading-[1.4]">{section.label}</span>
                              <span className="text-[10px] font-normal tabular-nums text-faint">{section.dashboards.length}</span>
                            </button>
                            <div id={sectionContentId} hidden={!sectionOpen} className="ml-3.5 border-l border-white/10 pl-1.5 motion-safe:animate-[fade_180ms_ease-out]">{sectionOpen && renderReports(area, section)}</div>
                          </li>
                        )
                      })}
                    </ul>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
        {!collapsed && areas.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <SearchX aria-hidden className="size-5 text-faint" />
            <p className="text-xs font-medium text-muted-foreground">{searching ? 'Nenhum relatório encontrado' : 'Nenhum relatório disponível'}</p>
            <p className="text-[11px] leading-relaxed text-faint">{searching ? 'Tente outro nome de área, subárea ou projeto.' : 'Os relatórios liberados para você aparecerão aqui.'}</p>
            {searching && <button type="button" onClick={() => setQuery('')} className="mt-1 rounded px-2 py-1 text-xs font-semibold text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">Limpar busca</button>}
          </div>
        )}
      </div>
    </div>
  )
}
