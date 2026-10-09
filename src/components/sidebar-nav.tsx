"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DashboardTree } from '@/components/dashboard-tree'
import { useDashboardNavigation } from '@/components/dashboard-navigation-provider'
import { useSidebar } from '@/components/sidebar-shell'
import { Hint } from '@/components/ui/tooltip'
import { NAV_ITEMS, isNavActive } from '@/lib/navigation'
import { cn } from '@/lib/utils'

interface SidebarNavProps {
  mobile?: boolean
  onNavigate?: () => void
}

export function SidebarNav({ mobile = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname()
  const sidebar = useSidebar()
  const { isDashboardPage } = useDashboardNavigation()
  const collapsed = !mobile && sidebar.collapsed

  const renderItem = (item: (typeof NAV_ITEMS)[number]) => {
    const Icon = item.icon
    const active = item.href === '/dashboard' ? isDashboardPage : isNavActive(pathname, item.href)
    return (
      <Hint key={item.href} label={item.label} side="right" disabled={!collapsed}>
        <Link
          href={item.href} prefetch={true} onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'sidebar-nav-link group/item relative flex h-11 items-center gap-3 overflow-hidden rounded-[4px] pl-[17px] pr-3 text-[15px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            active ? 'bg-white/[0.08] text-foreground' : 'text-foreground/90 hover:bg-accent hover:text-foreground',
          )}
        >
          {active && <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />}
          <Icon aria-hidden className={cn('size-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover/item:text-foreground')} />
          <span className={cn('truncate transition-opacity duration-200', collapsed && 'opacity-0')}>{item.label}</span>
        </Link>
      </Hint>
    )
  }

  return (
    <nav aria-label={mobile ? 'Navegação principal no celular' : 'Navegação principal'} className="sidebar-navigation flex min-h-0 flex-1 flex-col pt-4">
      <div className="shrink-0 px-3">{renderItem(NAV_ITEMS[0])}</div>
      <DashboardTree mobile={mobile} onNavigate={onNavigate} />
    </nav>
  )
}
