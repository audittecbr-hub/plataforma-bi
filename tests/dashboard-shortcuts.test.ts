import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDashboardCatalog } from '../src/lib/dashboard-navigation'
import { montarContextoUsuario } from '../src/lib/permissions'
import { dashboardShortcutEntries, EMPTY_SHORTCUTS, parseShortcuts, reconcileShortcuts, recordShortcutVisit, RECENT_LIMIT, resolveShortcut, shortcutsStorageKey, starterShortcuts, toggleShortcutFavorite, type ShortcutLocation } from '../src/lib/dashboard-shortcuts'
import type { Dashboard } from '../src/lib/types'

const report = (id: string, department: string, overrides: Partial<Dashboard> = {}): Dashboard => ({ id, department, name: id, url: 'mock', ...overrides })
const admin = montarContextoUsuario('admin', { department: 'Diretoria', is_admin: true })
const location = (dashboardId: string, areaId = 'Diretoria', sectionId = 'Visão geral'): ShortcutLocation => ({ dashboardId, areaId, sectionId })

test('preferências são isoladas por conta e versionadas', () => {
  assert.notEqual(shortcutsStorageKey('ana'), shortcutsStorageKey('bia'))
  assert.match(shortcutsStorageKey('ana'), /v1:ana$/)
})

test('favoritar e desfavoritar não alteram o histórico nem o objeto anterior', () => {
  const visited = recordShortcutVisit(EMPTY_SHORTCUTS, location('one'), 1000)
  const saved = toggleShortcutFavorite(visited, location('one'))
  assert.deepEqual(saved.favorites, [location('one')])
  assert.equal(saved.recents, visited.recents)
  assert.deepEqual(visited.favorites, [])
  assert.deepEqual(toggleShortcutFavorite(saved, location('one')).favorites, [])
})

test('favoritos de relatórios compartilhados são únicos, independentemente do caminho', () => {
  const saved = toggleShortcutFavorite(EMPTY_SHORTCUTS, location('shared'))
  assert.deepEqual(toggleShortcutFavorite(saved, location('shared', 'Financeiro')).favorites, [])
})

test('recentes usam o último acesso e conservam o caminho escolhido', () => {
  let preferences = recordShortcutVisit(EMPTY_SHORTCUTS, location('one'), 1000)
  preferences = recordShortcutVisit(preferences, location('two'), 2000)
  preferences = recordShortcutVisit(preferences, location('one', 'Financeiro'), 3000)
  assert.deepEqual(preferences.recents.map((item) => item.dashboardId), ['one', 'two'])
  assert.equal(preferences.recents[0].areaId, 'Financeiro')
  assert.equal(preferences.recents[0].openedAt, 3000)
})

test('histórico limita o tamanho e não descarta favoritos', () => {
  let preferences = toggleShortcutFavorite(EMPTY_SHORTCUTS, location('favorite'))
  for (let index = 0; index < 100; index++) preferences = recordShortcutVisit(preferences, location(`r${index}`), index + 1)
  assert.equal(preferences.recents.length, RECENT_LIMIT)
  assert.equal(preferences.recents[0].dashboardId, 'r99')
  assert.equal(preferences.favorites[0].dashboardId, 'favorite')
})

test('dados salvos podem ser lidos novamente e não incluem URLs ou nomes', () => {
  const preferences = recordShortcutVisit(toggleShortcutFavorite(EMPTY_SHORTCUTS, location('one')), location('one'), 1000)
  assert.deepEqual(parseShortcuts(JSON.stringify(preferences)), preferences)
  const raw = JSON.stringify({ version: 1, favorites: [{ ...location('one'), name: 'Segredo', url: 'secret' }], recents: [] })
  assert.deepEqual(parseShortcuts(raw).favorites, [location('one')])
  assert.doesNotMatch(JSON.stringify(parseShortcuts(raw)), /Segredo|secret/)
})

test('JSON inválido, versões desconhecidas e estruturas malformadas não quebram a página', () => {
  for (const raw of [null, '', '{', 'null', '[]', 'false', '{"version":2,"favorites":[],"recents":[]}', '{"version":1,"favorites":{},"recents":[]}']) {
    assert.deepEqual(parseShortcuts(raw), EMPTY_SHORTCUTS)
  }
  assert.deepEqual(parseShortcuts('x'.repeat(200_001)), EMPTY_SHORTCUTS)
  const value = { version: 1, favorites: [null, {}, { ...location('one'), dashboardId: 4 }], recents: [{ ...location('one'), openedAt: -1 }, { ...location('one'), openedAt: Number.MAX_SAFE_INTEGER }] }
  assert.deepEqual(parseShortcuts(JSON.stringify(value)), EMPTY_SHORTCUTS)
})

test('dados duplicados são normalizados e o histórico mantém a ocorrência mais recente', () => {
  const parsed = parseShortcuts(JSON.stringify({ version: 1,
    favorites: [location('one'), location('one', 'Financeiro')],
    recents: [{ ...location('one'), openedAt: 1000 }, { ...location('one', 'Financeiro'), openedAt: 3000 }, { ...location('two'), openedAt: 2000 }],
  }))
  assert.equal(parsed.favorites.length, 1)
  assert.deepEqual(parsed.recents.map((item) => item.dashboardId), ['one', 'two'])
  assert.equal(parsed.recents[0].areaId, 'Financeiro')
})

test('atalhos removidos ou proibidos são descartados sem abrir outro relatório', () => {
  const catalog = buildDashboardCatalog([report('allowed', 'Financeiro'), report('forbidden', 'Tax')], montarContextoUsuario('ana', { department: 'Financeiro' }))
  const preferences = recordShortcutVisit(toggleShortcutFavorite(EMPTY_SHORTCUTS, location('forbidden')), location('removed'), 1000)
  assert.deepEqual(reconcileShortcuts(preferences, catalog), EMPTY_SHORTCUTS)
  assert.equal(resolveShortcut(catalog, location('forbidden')), null)
  assert.equal(resolveShortcut(catalog, location('removed')), null)
})

test('mudança de área do projeto mantém somente o mesmo relatório autorizado', () => {
  const catalog = buildDashboardCatalog([report('one', 'Financeiro')], admin)
  const preferences = reconcileShortcuts(recordShortcutVisit(toggleShortcutFavorite(EMPTY_SHORTCUTS, location('one')), location('one'), 1000), catalog)
  assert.equal(preferences.favorites[0].dashboardId, 'one')
  assert.equal(preferences.favorites[0].areaId, 'Financeiro')
  assert.equal(preferences.recents[0].openedAt, 1000)
})

test('seletor de favoritos exibe somente projetos autorizados e sem duplicações', () => {
  const catalog = buildDashboardCatalog([report('shared', 'Tax', { allowed_departments: ['Financeiro'] }), report('other', 'Diretoria')], admin)
  const entries = dashboardShortcutEntries(catalog)
  assert.equal(entries.filter((item) => item.dashboard.id === 'shared').length, 1)
  assert.equal(entries[0].dashboard.id, 'other')
  const restricted = buildDashboardCatalog([report('shared', 'Tax', { allowed_departments: ['Financeiro'] }), report('other', 'Diretoria')], montarContextoUsuario('ana', { department: 'Financeiro' }))
  assert.deepEqual(dashboardShortcutEntries(restricted).map((item) => item.dashboard.id), ['shared'])
})

test('sugestões iniciais usam projetos reais, priorizam metas e respeitam o limite', () => {
  const catalog = buildDashboardCatalog([report('one', 'Diretoria'), report('goals', 'Diretoria', { name: 'Metas GS' }), report('fin', 'Financeiro'), report('tax', 'Tax'), report('regional', 'Regional Sul')], admin)
  const suggestions = starterShortcuts(catalog, 3)
  assert.equal(suggestions.length, 3)
  assert.equal(suggestions[0].dashboard.id, 'goals')
  assert.equal(new Set(suggestions.map((item) => item.dashboard.id)).size, 3)
  assert.deepEqual(starterShortcuts(buildDashboardCatalog([], admin)), [])
})
