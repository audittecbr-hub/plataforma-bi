'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDashboardNavigation } from '@/components/dashboard-navigation-provider'
import type { DashboardSelection } from '@/lib/dashboard-navigation'
import { EMPTY_SHORTCUTS, parseShortcuts, reconcileShortcuts, recordShortcutVisit, resolveShortcut, shortcutLocation, shortcutsStorageKey, toggleShortcutFavorite, type DashboardShortcuts, type ShortcutLocation } from '@/lib/dashboard-shortcuts'

interface ShortcutsContextValue {
  ready: boolean
  favorites: DashboardSelection[]
  recents: (DashboardSelection & { openedAt: number })[]
  isFavorite: (dashboardId: string) => boolean
  toggleFavorite: (location: ShortcutLocation) => void
  storageUnavailable: boolean
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null)

export function useDashboardShortcuts() {
  const context = useContext(ShortcutsContext)
  if (!context) throw new Error('DashboardShortcutsProvider ausente')
  return context
}

/** Preferências locais por conta; o catálogo autorizado é a fonte dos cartões. */
export function DashboardShortcutsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { catalog, selection, isDashboardPage } = useDashboardNavigation()
  const storageKey = shortcutsStorageKey(userId)
  const [state, setState] = useState({ key: '', ready: false, preferences: EMPTY_SHORTCUTS, storageUnavailable: false })
  const current = useRef({ key: '', preferences: EMPTY_SHORTCUTS })
  const ready = state.key === storageKey && state.ready
  const preferences = ready ? state.preferences : EMPTY_SHORTCUTS

  useEffect(() => {
    const receive = (raw: string | null, storageUnavailable = false) => {
      const preferences = reconcileShortcuts(parseShortcuts(raw), catalog)
      current.current = { key: storageKey, preferences }
      setState({ key: storageKey, ready: true, preferences, storageUnavailable })
    }
    try {
      receive(window.localStorage.getItem(storageKey))
    } catch {
      receive(null, true)
    }
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && (event.key === storageKey || event.key === null)) receive(event.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [catalog, storageKey])

  const update = useCallback((change: (preferences: DashboardShortcuts) => DashboardShortcuts) => {
    if (current.current.key !== storageKey) return
    const preferences = reconcileShortcuts(change(current.current.preferences), catalog)
    current.current = { key: storageKey, preferences }
    let storageUnavailable = false
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(preferences))
    } catch {
      storageUnavailable = true
    }
    setState({ key: storageKey, ready: true, preferences, storageUnavailable })
  }, [catalog, storageKey])

  const toggleFavorite = useCallback((location: ShortcutLocation) => {
    if (!resolveShortcut(catalog, location)) return
    update((preferences) => toggleShortcutFavorite(preferences, location))
  }, [catalog, update])
  const recordVisit = useCallback((selection: DashboardSelection) => {
    update((preferences) => recordShortcutVisit(preferences, shortcutLocation(selection), Date.now()))
  }, [update])

  useEffect(() => {
    if (ready && isDashboardPage && selection) recordVisit(selection)
  }, [ready, isDashboardPage, selection, recordVisit])

  const favoriteIds = useMemo(() => new Set(preferences.favorites.map((item) => item.dashboardId)), [preferences.favorites])
  const isFavorite = useCallback((dashboardId: string) => favoriteIds.has(dashboardId), [favoriteIds])
  const favorites = useMemo(() => preferences.favorites.flatMap((location) => {
    const selection = resolveShortcut(catalog, location)
    return selection ? [selection] : []
  }), [catalog, preferences.favorites])
  const recents = useMemo(() => preferences.recents.flatMap((location) => {
    const selection = resolveShortcut(catalog, location)
    return selection ? [{ ...selection, openedAt: location.openedAt }] : []
  }), [catalog, preferences.recents])
  const value = useMemo(() => ({ ready, favorites, recents, isFavorite, toggleFavorite, storageUnavailable: ready && state.storageUnavailable }), [ready, favorites, recents, isFavorite, toggleFavorite, state.storageUnavailable])

  return <ShortcutsContext.Provider value={value}>{children}</ShortcutsContext.Provider>
}
