'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DepartmentView } from '@/components/department-view'
import { Dashboard } from '@/lib/types'
import { MAIN_DEPARTMENTS } from '@/lib/constants'
import { GROUP_META } from '@/lib/department-meta'

interface CompanyOverviewProps {
  initialDepartment?: string
  dashboardConfig: Record<string, Dashboard[]>
  isLeader?: boolean
}

export function CompanyOverview({ initialDepartment = 'Diretoria', dashboardConfig, isLeader = false }: CompanyOverviewProps) {
  const [selectedDept, setSelectedDept] = useState(initialDepartment)

  // Estabiliza a referência do array de dashboards do departamento selecionado.
  // Sem useMemo, `dashboardConfig[selectedDept] || []` criaria um novo `[]` a cada render
  // quando a chave não existe, causando re-renders desnecessários no DepartmentView.
  const currentDashboards = useMemo(
    () => dashboardConfig[selectedDept] || [],
    [dashboardConfig, selectedDept]
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Seletor de áreas — controle segmentado com indicador deslizante */}
      <div className="scrollbar-none fade-x -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 sm:[mask-image:none]">
        <div
          className="inline-flex min-w-max gap-1 rounded-xl border bg-card p-1 shadow-xs"
          role="tablist"
          aria-label="Departamentos"
        >
          {MAIN_DEPARTMENTS.map((dept) => {
            const meta = GROUP_META[dept]
            const Icon = meta.icon
            const label = dept === 'Diretoria' ? 'GS — Visão Geral' : dept
            const isActive = selectedDept === dept
            const count = dashboardConfig[dept]?.length ?? 0
            return (
              <button
                key={dept}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedDept(dept)}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap rounded-[4px] px-3.5 py-2 text-[13.5px] font-semibold outline-none transition-colors duration-200",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/25",
                  isActive ? "text-white dark:text-ink" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="dept-pill-active"
                    aria-hidden
                    className="absolute inset-0 rounded-[4px] bg-ink dark:bg-white"
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                <Icon
                  className={cn(
                    "relative size-4 transition-colors",
                    isActive ? "text-[var(--gs-gold-light)] dark:text-[var(--gs-gold-dark)]" : ""
                  )}
                />
                <span className="relative">{label}</span>
                <span
                  className={cn(
                    "relative min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 tabular-nums transition-colors",
                    isActive ? "bg-white/15 text-white dark:bg-ink/10 dark:text-ink" : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* A key remonta a view a cada área: sem ela, a sub-aba escolhida na área
          anterior continuava selecionada e a nova área abria vazia. */}
      <DepartmentView
          key={selectedDept}
          department={selectedDept === 'Diretoria' ? 'GS' : selectedDept}
          dashboards={currentDashboards}
          isLeader={isLeader}
      />
    </div>
  )
}
