'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { PowerBIEmbed } from '@/components/powerbi-embed'

import { Dashboard } from '@/lib/types'

interface DashboardSelectorProps {
  department: string
  dashboards: Dashboard[]
  headerContent?: React.ReactNode // Optional header content (e.g. Sub-department select)
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

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Only show selector if there are dashboards (even if just one, per user request for consistency, 
          or user said "deve conter uma box de select". 
          Let's show it always if there is at least one dashboard to make it explicit) 
      */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Optional Header Content (e.g. Area Select) */}
        {headerContent}

        <div className={cn("w-full md:w-auto flex flex-col md:flex-row gap-2 flex-wrap items-center transition-opacity", dashboards.length === 0 && "hidden")}>
            <Select value={selectedId} onValueChange={setSelectedId} disabled={dashboards.length <= 1}>
              <SelectTrigger className="w-full md:w-64 bg-card/50 border-primary/20 text-foreground">
                <SelectValue placeholder="Selecione um Dashboard" />
              </SelectTrigger>
              <SelectContent>
                {groupedDashboards.map(([groupName, groupDashboards]) => (
                  <SelectGroup key={groupName}>
                    <SelectLabel className="text-primary font-bold">{groupName}</SelectLabel>
                    {groupDashboards.map((dashboard) => (
                      <SelectItem key={dashboard.id} value={dashboard.id}>
                        {dashboard.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
      </div>

      <div className="flex-1 min-h-[500px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedUrl || 'empty'}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
            animate={prefersReducedMotion ? {} : { opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, x: -10 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
            className="h-full"
          >
            {showEmbed ? (
              <PowerBIEmbed 
                src={selectedUrl} 
                title={`${department} - ${currentDashboard?.name}`} 
                height="75vh" 
              />
            ) : (
              <Card className="h-full border-none bg-card/50">
                <CardContent className="h-full flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <h2 className="text-2xl font-bold text-primary">
                      {department} - {currentDashboard?.name || 'Dashboard'}
                    </h2>
                    <p className="text-muted-foreground">
                      URL não configurada. Aguardando link do Power BI.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
