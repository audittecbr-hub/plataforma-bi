"use client"

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { DashboardSelector } from '@/components/dashboard-selector'
import { Card, CardContent } from '@/components/ui/card'

import { DEPARTMENT_SUB_MENUS } from '@/lib/constants'
import { Dashboard } from '@/lib/types'

interface DepartmentViewProps {
  department: string
  dashboards: Dashboard[]
  allowedSubDepartments?: string[]
  isLeader?: boolean
}

export function DepartmentView({ department, dashboards, allowedSubDepartments, isLeader = false }: DepartmentViewProps) {
  // subTabs memoizado: recalcula apenas quando department ou allowedSubDepartments mudam
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
  }, [department, allowedSubDepartments, dashboards])

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
      <div className="overflow-x-auto">
        <div className="flex gap-2 pb-1 min-w-max" role="tablist" aria-label="Sub-departamentos">
          {subTabs.map((sub) => {
            const isActive = selectedSub === sub
            return (
              <button
                key={sub}
                role="tab"
                aria-selected={isActive}
                onClick={() => setSelectedSub(sub)}
                className={cn(
                  "relative px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="subdept-pill-active"
                    className="absolute inset-0 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{sub}</span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }, [subTabs, selectedSub])

  return (
    <Card className="flex-1 border-none bg-card/50">
      <CardContent className="h-full min-h-[500px] p-0 md:p-4">
        <DashboardSelector 
            department={department} 
            dashboards={filteredDashboards} 
            headerContent={subMenu}
        />
      </CardContent>
    </Card>
  )
}
