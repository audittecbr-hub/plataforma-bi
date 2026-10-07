import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDashboardCatalog, dashboardHref, filterDashboardAreas, resolveDashboardSelection } from '../src/lib/dashboard-navigation'
import { montarContextoUsuario } from '../src/lib/permissions'
import type { Dashboard } from '../src/lib/types'

const report = (id: string, department: string, overrides: Partial<Dashboard> = {}): Dashboard => ({
  id, department, name: id, url: 'mock', ...overrides,
})
const admin = montarContextoUsuario('admin', { department: 'Diretoria', is_admin: true })
const idsOf = (catalog: ReturnType<typeof buildDashboardCatalog>) => [...new Set(catalog.areas.flatMap((area) => area.sections.flatMap((section) => section.dashboards.map((dashboard) => dashboard.id))))]

test('áreas e subáreas mantêm a ordem institucional e relatórios usam ordem alfabética', () => {
  const catalog = buildDashboardCatalog([
    report('z', 'Expansão', { name: 'Zeta' }), report('a', 'Expansão', { name: 'Álfa' }),
    report('tax', 'Tax'), report('fran', 'Franchising'), report('fin', 'Financeiro'), report('gs', 'Diretoria'),
  ], admin)
  assert.deepEqual(catalog.areas.map((area) => area.id), ['Diretoria', 'Financeiro', 'Comercial', 'Operacional'])
  assert.deepEqual(catalog.areas[2].sections.map((section) => section.id), ['Expansão', 'Franchising'])
  assert.deepEqual(catalog.areas[2].sections[0].dashboards.map((dashboard) => dashboard.name), ['Álfa', 'Zeta'])
  assert.equal(catalog.defaultAreaId, 'Diretoria')
})

test('relatórios compartilhados aparecem em cada caminho com contagem única', () => {
  const catalog = buildDashboardCatalog([
    report('shared', 'Expansão', { allowed_departments: ['Franchising', 'Financeiro', 'Expansão'] }),
  ], admin)
  assert.equal(catalog.totalReports, 1)
  assert.equal(catalog.areas.find((area) => area.id === 'Comercial')?.reportCount, 1)
  assert.deepEqual(catalog.areas.find((area) => area.id === 'Comercial')?.sections.map((section) => section.id), ['Expansão', 'Franchising'])
  assert.equal(catalog.areas.find((area) => area.id === 'Financeiro')?.sections[0].dashboards[0].id, 'shared')
})

test('colaborador recebe somente relatórios e ramos autorizados, inclusive compartilhamento de outra área', () => {
  const context = montarContextoUsuario('ana', { department: 'Expansão' })
  const catalog = buildDashboardCatalog([
    report('own', 'Expansão'), report('foreign', 'Tax'), report('colleague', 'Expansão', { assigned_user_id: 'bia' }),
    report('shared', 'Tax', { allowed_departments: ['Expansão'] }), report('fran', 'Franchising'),
  ], context)
  assert.deepEqual(catalog.areas.map((area) => area.id), ['Comercial'])
  assert.deepEqual(catalog.areas[0].sections.map((section) => section.id), ['Expansão'])
  assert.deepEqual(idsOf(catalog).sort(), ['own', 'shared'])
  assert.equal(catalog.totalReports, 2)
})

test('subáreas extras autorizadas permanecem acessíveis na área correta', () => {
  const context = montarContextoUsuario('ana', { department: 'Expansão', allowed_sub_departments: ['Corporate'] })
  const catalog = buildDashboardCatalog([report('own', 'Expansão'), report('extra', 'Corporate'), report('tax', 'Tax')], context)
  assert.deepEqual(catalog.areas.map((area) => area.id), ['Comercial', 'Operacional'])
  assert.deepEqual(catalog.areas[1].sections.map((section) => section.id), ['Corporate'])
  assert.deepEqual(idsOf(catalog).sort(), ['extra', 'own'])
})

test('líder mantém acesso aos individuais do seu departamento, sem exposição a outro departamento', () => {
  const context = montarContextoUsuario('leader', { department: 'Tax', is_leader: true })
  const catalog = buildDashboardCatalog([
    report('colleague', 'Tax', { assigned_user_id: 'bia' }),
    report('foreign', 'Corporate', { assigned_user_id: 'cai' }),
  ], context)
  assert.deepEqual(idsOf(catalog), ['colleague'])
  assert.deepEqual(catalog.areas.map((area) => area.id), ['Metas Líderes'])
})

test('dono encontra metas individuais em sua área e em Metas Líderes; admin usa categorias dinâmicas', () => {
  const dashboard = report('goals', 'Tax', { assigned_user_id: 'ana', sub_group: 'Projetos estratégicos' })
  const own = buildDashboardCatalog([dashboard], montarContextoUsuario('ana', { department: 'Tax' }))
  assert.equal(own.totalReports, 1)
  assert.deepEqual(own.areas.map((area) => area.id), ['Operacional', 'Metas Líderes'])
  assert.equal(own.areas[0].sections[0].id, 'Metas Líderes')
  const all = buildDashboardCatalog([dashboard], admin)
  assert.deepEqual(all.areas.map((area) => area.id), ['Metas Líderes'])
  assert.equal(all.areas[0].sections[0].id, 'Projetos estratégicos')
})

test('relatórios sem subárea e áreas novas não ficam escondidos em abas vazias', () => {
  const catalog = buildDashboardCatalog([report('group', 'Comercial'), report('new', 'Jurídico')], admin)
  assert.deepEqual(idsOf(catalog).sort(), ['group', 'new'])
  assert.equal(catalog.areas[0].sections[0].label, 'Visão geral')
  assert.equal(catalog.areas[1].label, 'Jurídico')
})

test('links identificam o caminho correto de um relatório compartilhado', () => {
  const catalog = buildDashboardCatalog([report('shared', 'Expansão', { allowed_departments: ['Financeiro'] })], admin)
  const selection = resolveDashboardSelection(catalog, { areaId: 'Financeiro', sectionId: 'Visão geral', dashboardId: 'shared' })
  assert.equal(selection?.area.id, 'Financeiro')
  assert.equal(selection?.dashboard.id, 'shared')
  const url = new URL(dashboardHref('Metas Líderes', 'Norte/Nordeste & SP', 'a/b'), 'http://localhost')
  assert.equal(url.searchParams.get('area'), 'Metas Líderes')
  assert.equal(url.searchParams.get('subarea'), 'Norte/Nordeste & SP')
  assert.equal(url.searchParams.get('report'), 'a/b')
})

test('ID inválido ou removido recai em um relatório permitido, e catálogo vazio é tratado', () => {
  const catalog = buildDashboardCatalog([report('safe', 'Financeiro')], montarContextoUsuario('ana', { department: 'Financeiro' }))
  const selection = resolveDashboardSelection(catalog, { areaId: 'Diretoria', sectionId: 'secret', dashboardId: 'forbidden' })
  assert.equal(selection?.dashboard.id, 'safe')
  assert.equal(selection?.area.id, 'Financeiro')
  assert.equal(resolveDashboardSelection(buildDashboardCatalog([], admin)), null)
})

test('abertura inicial preserva preferência por Metas no primeiro ramo disponível', () => {
  const catalog = buildDashboardCatalog([report('a', 'Financeiro', { name: 'Comissionamento' }), report('b', 'Financeiro', { name: 'Metas Financeiras' })], admin)
  assert.equal(resolveDashboardSelection(catalog)?.dashboard.id, 'b')
})

test('busca sem acentos combina área, subárea e projeto, abrindo somente resultados relevantes', () => {
  const catalog = buildDashboardCatalog([
    report('one', 'Expansão', { name: 'Comissão de projetos' }),
    report('two', 'Franchising', { name: 'Comissão geral' }), report('three', 'Tax', { name: 'Metas' }),
  ], admin)
  const filtered = filterDashboardAreas(catalog.areas, 'comercial expansao comissao')
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].sections.length, 1)
  assert.equal(filtered[0].sections[0].dashboards[0].id, 'one')
  assert.equal(filtered[0].reportCount, 1)
  assert.equal(filterDashboardAreas(catalog.areas, 'ausente').length, 0)
  assert.equal(filterDashboardAreas(catalog.areas, '   '), catalog.areas)
  assert.equal(catalog.areas[0].sections.length, 2)
})
