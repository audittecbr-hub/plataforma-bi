import type { DashboardCatalog, DashboardSelection } from './dashboard-navigation'

export interface ShortcutLocation {
  dashboardId: string
  areaId: string
  sectionId: string
}

export interface RecentShortcut extends ShortcutLocation {
  openedAt: number
}

export interface DashboardShortcuts {
  version: 1
  favorites: ShortcutLocation[]
  recents: RecentShortcut[]
}

export const EMPTY_SHORTCUTS: DashboardShortcuts = { version: 1, favorites: [], recents: [] }
export const RECENT_LIMIT = 24
const FAVORITE_LIMIT = 200

export function shortcutsStorageKey(userId: string) {
  return `gs:dashboard-shortcuts:v1:${userId}`
}

export function shortcutLocation(selection: DashboardSelection): ShortcutLocation {
  return { dashboardId: selection.dashboard.id, areaId: selection.area.id, sectionId: selection.section.id }
}

function readLocation(value: unknown): ShortcutLocation | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (!['dashboardId', 'areaId', 'sectionId'].every((key) => typeof row[key] === 'string' && row[key].length > 0 && row[key].length < 256)) return null
  return { dashboardId: row.dashboardId as string, areaId: row.areaId as string, sectionId: row.sectionId as string }
}

/** Aceita somente o formato conhecido; não guarda nomes, URLs ou dados do BI. */
export function parseShortcuts(raw: string | null): DashboardShortcuts {
  if (!raw || raw.length > 200_000) return EMPTY_SHORTCUTS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return EMPTY_SHORTCUTS
    const value = parsed as Record<string, unknown>
    if (value.version !== 1 || !Array.isArray(value.favorites) || !Array.isArray(value.recents)) return EMPTY_SHORTCUTS
    const favoriteIds = new Set<string>()
    const recentIds = new Set<string>()
    const favorites: ShortcutLocation[] = []
    const recents: RecentShortcut[] = []
    for (const row of value.favorites.slice(0, FAVORITE_LIMIT)) {
      const location = readLocation(row)
      if (location && !favoriteIds.has(location.dashboardId)) {
        favoriteIds.add(location.dashboardId)
        favorites.push(location)
      }
    }
    for (const row of value.recents.slice(0, RECENT_LIMIT * 2)) {
      const location = readLocation(row)
      if (!location) continue
      const openedAt = (row as Record<string, unknown>).openedAt
      if (typeof openedAt !== 'number' || !Number.isSafeInteger(openedAt) || openedAt <= 0 || openedAt > 8_640_000_000_000_000) continue
      recents.push({ ...location, openedAt })
    }
    const uniqueRecents = recents.sort((a, b) => b.openedAt - a.openedAt).filter((recent) => {
      if (recentIds.has(recent.dashboardId)) return false
      recentIds.add(recent.dashboardId)
      return true
    }).slice(0, RECENT_LIMIT)
    return { version: 1, favorites, recents: uniqueRecents }
  } catch {
    return EMPTY_SHORTCUTS
  }
}

/** Um ID removido ou sem permissão nunca recai em outro relatório. */
export function resolveShortcut(catalog: DashboardCatalog, location: ShortcutLocation): DashboardSelection | null {
  const areas = [...catalog.areas].sort((a, b) => Number(b.id === location.areaId) - Number(a.id === location.areaId))
  for (const area of areas) {
    const sections = [...area.sections].sort((a, b) => Number(b.id === location.sectionId) - Number(a.id === location.sectionId))
    for (const section of sections) {
      const dashboard = section.dashboards.find((report) => report.id === location.dashboardId)
      if (dashboard) return { area, section, dashboard }
    }
  }
  return null
}

export function reconcileShortcuts(preferences: DashboardShortcuts, catalog: DashboardCatalog): DashboardShortcuts {
  return {
    version: 1,
    favorites: preferences.favorites.flatMap((location) => {
      const selection = resolveShortcut(catalog, location)
      return selection ? [shortcutLocation(selection)] : []
    }),
    recents: preferences.recents.flatMap((location) => {
      const selection = resolveShortcut(catalog, location)
      return selection ? [{ ...shortcutLocation(selection), openedAt: location.openedAt }] : []
    }),
  }
}

export function toggleShortcutFavorite(preferences: DashboardShortcuts, location: ShortcutLocation): DashboardShortcuts {
  const exists = preferences.favorites.some((item) => item.dashboardId === location.dashboardId)
  return {
    ...preferences,
    favorites: exists
      ? preferences.favorites.filter((item) => item.dashboardId !== location.dashboardId)
      : [...preferences.favorites, location].slice(-FAVORITE_LIMIT),
  }
}

export function recordShortcutVisit(preferences: DashboardShortcuts, location: ShortcutLocation, openedAt: number): DashboardShortcuts {
  return { ...preferences, recents: [{ ...location, openedAt }, ...preferences.recents.filter((item) => item.dashboardId !== location.dashboardId)].slice(0, RECENT_LIMIT) }
}

/** Cada relatório aparece uma vez, priorizando a área principal do perfil. */
export function dashboardShortcutEntries(catalog: DashboardCatalog): DashboardSelection[] {
  const ids = new Set<string>()
  const areas = [...catalog.areas].sort((a, b) => Number(b.id === catalog.defaultAreaId) - Number(a.id === catalog.defaultAreaId))
  return areas.flatMap((area) => area.sections.flatMap((section) => section.dashboards.flatMap((dashboard) => {
    if (ids.has(dashboard.id)) return []
    ids.add(dashboard.id)
    return [{ area, section, dashboard }]
  })))
}

/** Sugestões de áreas disponíveis para quem ainda não tem histórico. */
export function starterShortcuts(catalog: DashboardCatalog, limit = 6): DashboardSelection[] {
  const entries = dashboardShortcutEntries(catalog)
  const chosen: DashboardSelection[] = []
  const areas = new Set<string>()
  const sorted = [...entries].sort((a, b) => Number(b.dashboard.name.toLowerCase().includes('metas')) - Number(a.dashboard.name.toLowerCase().includes('metas')))
  for (const entry of sorted) {
    if (areas.has(entry.area.id)) continue
    areas.add(entry.area.id)
    chosen.push(entry)
    if (chosen.length === limit) return chosen
  }
  return [...chosen, ...entries.filter((entry) => !chosen.some((item) => item.dashboard.id === entry.dashboard.id))].slice(0, limit)
}
