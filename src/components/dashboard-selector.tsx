'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChartColumnBig, Inbox, Link2Off } from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { PowerBIEmbed } from '@/components/powerbi-embed'
import { departmentGroup, GROUP_META } from '@/lib/department-meta'
import { Gem } from 'lucide-react'

import { Dashboard } from '@/lib/types'

interface DashboardSelectorProps {
  department: string
  dashboards: Dashboard[]
  headerContent?: React.ReactNode // Optional header content (e.g. Sub-department select)
}

/**
 * Altura do palco do relatório. Com a página rolada até o visualizador, palco
 * e barra de controles cabem juntos na janela (descontando topbar e o
 * cabeçalho do card); nunca fica menor que um relatório legível.
 */
const REPORT_HEIGHT = 'max(540px, calc(100dvh - 16rem))'

function ViewerTitle({ department, count }: { department: string; count: number }) {
  const meta = GROUP_META[departmentGroup(department) ?? department]
  const Icon = meta?.icon ?? Gem
  const label = meta?.label ?? department
  return (
    <div className="flex min-w-0 items-center gap-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-[4px] bg-gold-wash text-gold-text">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 space-y-0.5 leading-tight">
        <p className="truncate text-base font-bold tracking-[-0.01em] text-foreground">{label}</p>
        <p className="eyebrow text-[10px] text-faint">
          {count} {count === 1 ? 'relatório' : 'relatórios'}
        </p>
      </div>
    </div>
  )
}

export function DashboardSelector({ department, dashboards, headerContent }: DashboardSelectorProps) {
  const [selectedId, setSelectedId] = useState<string>('')
  const prefersReducedMotion = useReducedMotion()

  // Set default to first dashboard when department or dashboards change
  useEffect(() => {
    if (dashboards.length > 0) {
        // If we have a previously selected ID and it's still in the list, keep it.
        const stillExists = dashboards.find(d => d.id === selectedId)
        if (!selectedId || !stillExists) {
            const defaultDash = dashboards.find(d => d.name.toLowerCase().includes('metas')) || dashboards[0]
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSelectedId(defaultDash.id)
        }
    } else {
        setSelectedId('')
    }
  }, [dashboards, selectedId])

  // Agrupa dashboards por sub_group (se existir) ou department
  const groupedDashboards = useMemo(() => {
    const groups: Record<string, Dashboard[]> = {}
    dashboards.forEach(d => {
      const key = d.sub_group || d.department
      if (!groups[key]) groups[key] = []
      groups[key].push(d)
    })

    // Garante que cada grupo esteja ordenado internamente e que os grupos também sigam ordem alfabética
    return Object.entries(groups)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB, 'pt-BR'))
      .map(([key, items]) => {
        const sortedItems = [...items].sort((a, b) =>
          (a.name || '').trim().localeCompare((b.name || '').trim(), 'pt-BR', { sensitivity: 'base' })
        )
        return [key, sortedItems] as [string, Dashboard[]]
      })
  }, [dashboards])

  const currentDashboard = dashboards.find(d => d.id === selectedId)
  const selectedUrl = currentDashboard?.url || ''

  // Determine if we show the real embed or a placeholder
  const showEmbed = selectedUrl && !selectedUrl.includes('mock')

  const orderedIds = groupedDashboards.flatMap(([, items]) => items.map((d) => d.id))
  const position = currentDashboard ? orderedIds.indexOf(currentDashboard.id) + 1 : 0
  const groupOfCurrent = currentDashboard ? currentDashboard.sub_group || currentDashboard.department : ''
  const caption = currentDashboard ? `${groupOfCurrent} · ${currentDashboard.name}` : undefined

  return (
    <section className="relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Filete dourado do DS no topo do card */}
      <span aria-hidden className="pointer-events-none absolute left-5 top-0 z-10 h-[3px] w-10 bg-gold" />
      <header className="flex flex-col gap-2 border-b px-3 pb-3 md:min-h-[64px] md:flex-row md:items-center md:justify-between md:gap-6 md:px-5 md:pb-0">
        <div className="min-w-0 flex-1 self-stretch">
          {headerContent ?? <ViewerTitle department={department} count={dashboards.length} />}
        </div>

        {dashboards.length > 1 && (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger
              aria-label="Selecionar relatório"
              className="h-11 w-full shrink-0 pl-1.5 pr-3 md:w-[340px]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-[3px] bg-gold-wash text-gold-text">
                  <ChartColumnBig className="size-4 text-gold-text" />
                </span>
                <span className="flex min-w-0 flex-col items-start gap-0.5 leading-none">
                  <span className="eyebrow text-[9px] leading-none text-faint">
                    Relatório {position > 0 && `· ${position} de ${dashboards.length}`}
                  </span>
                  <span className="max-w-full truncate text-[13.5px] font-semibold text-foreground">
                    <SelectValue placeholder="Selecione um relatório" />
                  </span>
                </span>
              </span>
            </SelectTrigger>
            <SelectContent position="popper" align="end" className="max-h-[min(60vh,440px)] w-[var(--radix-select-trigger-width)] min-w-[300px]">
              {groupedDashboards.map(([groupName, groupDashboards]) => (
                <SelectGroup key={groupName}>
                  <SelectLabel className="flex items-center gap-2">
                    <span aria-hidden className="size-1.5 rounded-full bg-gold" />
                    {groupName}
                  </SelectLabel>
                  {groupDashboards.map((dashboard) => (
                    <SelectItem key={dashboard.id} value={dashboard.id}>
                      {dashboard.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}

        {dashboards.length === 1 && currentDashboard && (
          <div className="flex h-11 w-full shrink-0 items-center gap-2.5 rounded-[4px] border bg-surface pl-1.5 pr-4 md:w-auto md:max-w-[340px]">
            <span className="grid size-8 shrink-0 place-items-center rounded-[3px] bg-gold-wash text-gold-text">
              <ChartColumnBig className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 leading-none">
              <span className="eyebrow text-[9px] leading-none text-faint">Relatório único</span>
              <span className="truncate text-[13.5px] font-semibold text-foreground">{currentDashboard.name}</span>
            </span>
          </div>
        )}
      </header>

      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selectedUrl || 'empty'}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {showEmbed ? (
              <PowerBIEmbed
                src={selectedUrl}
                title={`${department} - ${currentDashboard?.name}`}
                caption={caption}
                height={REPORT_HEIGHT}
              />
            ) : (
              <div className="grid place-items-center bg-grid" style={{ minHeight: REPORT_HEIGHT }}>
                {dashboards.length === 0 ? (
                  <EmptyState
                    icon={Inbox}
                    title="Nenhum relatório por aqui"
                    description="Ainda não há dashboards publicados para esta área. Assim que forem cadastrados, eles aparecem aqui automaticamente."
                  />
                ) : (
                  <EmptyState
                    icon={Link2Off}
                    title="Relatório aguardando publicação"
                    description={
                      <>
                        <span className="font-medium text-foreground">{currentDashboard?.name || 'Este dashboard'}</span>{' '}
                        ainda não tem um link do Power BI configurado. Fale com o administrador do portal.
                      </>
                    }
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
