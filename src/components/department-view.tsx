"use client"

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DashboardSelector } from '@/components/dashboard-selector'

import { DEPARTMENT_SUB_MENUS } from '@/lib/constants'
import { Dashboard } from '@/lib/types'

interface DepartmentViewProps {
  department: string
  dashboards: Dashboard[]
  allowedSubDepartments?: string[]
  isLeader?: boolean
}

export function DepartmentView({ department, dashboards, allowedSubDepartments, isLeader = false }: DepartmentViewProps) {
  // subTabs memoizado: recalcula apenas quando department, allowedSubDepartments, dashboards ou isLeader mudam
  const subTabs = useMemo(() => {
    // Para 'Metas Líderes', sub-tabs são as categorias únicas (sub_group ou department)
    if (department === 'Metas Líderes') {
      const defaultSubMenus = DEPARTMENT_SUB_MENUS[department] || []
      const dynamicCategories = Array.from(new Set(dashboards.map(d => d.sub_group || d.department)))
      // Combina os dois, remove duplicatas e ordena
      return Array.from(new Set([...defaultSubMenus, ...dynamicCategories])).sort()
    }

    const defaultSubMenus = DEPARTMENT_SUB_MENUS[department] || []
    const resolved = allowedSubDepartments && allowedSubDepartments.length > 0
      ? allowedSubDepartments
      : defaultSubMenus

    // Injeta a sub-tab 'Metas Líderes' dinamicamente apenas para líderes (ou diretoria/admin)
    if (isLeader && dashboards.some(d => !!d.assigned_user_id) && department !== 'GS' && department !== 'Metas Líderes') {
        const base = resolved.length > 0 ? resolved : [department]
        return Array.from(new Set([...base, 'Metas Líderes']))
    }
    return resolved;
  }, [department, allowedSubDepartments, dashboards, isLeader])

  const [selectedSub, setSelectedSub] = useState(subTabs?.[0] || '')

  // filteredDashboards memoizado: recalcula apenas quando dashboards, subTabs ou selectedSub mudam
  const filteredDashboards = useMemo(() => {
    if (!subTabs || subTabs.length === 0) return dashboards
    // Para 'Metas Líderes', filtra pela categoria (sub_group ou department)
    if (department === 'Metas Líderes') {
      return dashboards.filter(d => (d.sub_group || d.department) === selectedSub)
    }
    return dashboards.filter(d =>
      // Sub-tab 'Metas Líderes' mostra apenas dashboards individuais (com assigned_user_id)
      (selectedSub === 'Metas Líderes' && !!d.assigned_user_id) ||
      d.department === selectedSub ||
      (d.allowed_departments && d.allowed_departments.includes(selectedSub))
    )
  }, [department, dashboards, subTabs, selectedSub])

  // subMenu memoizado: recalcula apenas quando subTabs ou selectedSub mudam
  const subMenu = useMemo(() => {
    if (!subTabs || subTabs.length <= 1) return undefined

    return (
      <div className="scrollbar-none -mx-3 flex h-full items-stretch overflow-x-auto px-1 md:mx-0 md:px-0">
        <div className="flex min-w-max items-stretch gap-0.5" role="tablist" aria-label="Sub-departamentos">
          {subTabs.map((sub) => {
            const isActive = selectedSub === sub
            return (
              <button
                key={sub}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedSub(sub)}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap px-3 py-3.5 text-[13.5px] font-semibold outline-none transition-colors md:py-0",
                  "focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/25",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="relative">{sub}</span>
                {isActive && (
                  <motion.span
                    layoutId="subdept-underline"
                    aria-hidden
                    className="absolute inset-x-3 -bottom-px h-[2px] bg-gold"
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }, [subTabs, selectedSub])

  return (
    <DashboardSelector
        department={department}
        dashboards={filteredDashboards}
        headerContent={subMenu}
    />
  )
}
