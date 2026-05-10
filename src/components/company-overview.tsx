'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DepartmentView } from '@/components/department-view'
import { Dashboard } from '@/lib/types'
import { MAIN_DEPARTMENTS } from '@/lib/constants'

interface CompanyOverviewProps {
  initialDepartment?: string
  dashboardConfig: Record<string, Dashboard[]>
}

export function CompanyOverview({ initialDepartment = 'Diretoria', dashboardConfig }: CompanyOverviewProps) {
  const [selectedDept, setSelectedDept] = useState(initialDepartment)

  // Estabiliza a referência do array de dashboards do departamento selecionado.
  // Sem useMemo, `dashboardConfig[selectedDept] || []` criaria um novo `[]` a cada render
  // quando a chave não existe, causando re-renders desnecessários no DepartmentView.
  const currentDashboards = useMemo(
    () => dashboardConfig[selectedDept] || [],
    [dashboardConfig, selectedDept]
  )

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Department Selector — Pills */}
      <div className="w-full overflow-x-auto">
        <div className="flex gap-2 pb-1 min-w-max" role="tablist" aria-label="Departamentos">
          {MAIN_DEPARTMENTS.map((dept) => {
            const label = dept === 'Diretoria' ? 'GS — Visão Geral' : dept
            const isActive = selectedDept === dept
            return (
              <button
                key={dept}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedDept(dept)}
                className={cn(
                  "relative px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="dept-pill-active"
                    className="absolute inset-0 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Render the selected Department View */}
      <DepartmentView
          department={selectedDept === 'Diretoria' ? 'GS' : selectedDept}
          dashboards={currentDashboards}
      />
    </div>
  )
}
