'use client'

import { Star } from 'lucide-react'
import { useDashboardShortcuts } from '@/components/dashboard-shortcuts-provider'
import type { ShortcutLocation } from '@/lib/dashboard-shortcuts'
import { cn } from '@/lib/utils'

export function DashboardFavoriteButton({ location, name, className }: { location: ShortcutLocation; name: string; className?: string }) {
  const { ready, isFavorite, toggleFavorite } = useDashboardShortcuts()
  const favorite = isFavorite(location.dashboardId)
  const label = `${favorite ? 'Remover' : 'Adicionar'} ${name} ${favorite ? 'dos' : 'aos'} favoritos`
  return (
    <button
      type="button" aria-label={label} title={label} aria-pressed={favorite}
      disabled={!ready} onClick={() => toggleFavorite(location)}
      className={cn('grid size-10 shrink-0 place-items-center rounded-[4px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40', favorite ? 'bg-gold-wash text-gold-text' : 'text-muted-foreground hover:bg-accent hover:text-gold-text', className)}
    >
      <Star aria-hidden className="size-[18px]" fill={favorite ? 'currentColor' : 'none'} />
    </button>
  )
}
