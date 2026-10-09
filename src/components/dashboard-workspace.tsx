'use client'

import type { ReactNode } from 'react'
import { useDashboardNavigation } from '@/components/dashboard-navigation-provider'
import { SidebarProvider, useSidebar } from '@/components/sidebar-shell'

function WorkspaceFrame({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar()
  const { selection, isDashboardPage } = useDashboardNavigation()
  return (
    <div
      data-report-focus={collapsed && isDashboardPage && !!selection}
      className="dashboard-workspace relative isolate flex h-dvh w-full overflow-hidden"
    >
      {children}
    </div>
  )
}

/** O mesmo estado controla a lateral e o espaço disponível, sem remontar o BI. */
export function DashboardWorkspace({ children }: { children: ReactNode }) {
  return <SidebarProvider><WorkspaceFrame>{children}</WorkspaceFrame></SidebarProvider>
}
