import assert from 'node:assert/strict'
import test from 'node:test'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { factsFromReportHtml, formatReportFact, matchReportMetrics, reportScope, validateReportReferences,
  type ReportReferenceContract } from '../src/lib/bi-ai/report-evidence'
import { reportReferenceDax, renderReportComparisons } from '../src/lib/bi-ai/report-reference'
import type { PublishedSchema } from '../src/lib/bi-ai/fabric-schema'

const contract: ReportReferenceContract = { version: 1, modelHash: 'model-v1', reportHash: 'report-v1', measure: 'Visual', page: 'HOME',
  source: { kind: 'delimited-html', elementId: 'raw-data', fields: { E: ['h', 'hr'], P: ['h'], R: ['h'] },
    regionCodes: { N: 'north', S: 'south' }, regionLabels: { north: 'Norte', south: 'Sul' }, currentMonthVariable: 'MONTH' },
  metrics: [{ id: 'found', label: 'Honorários encontrados', aliases: ['encontrados'], format: 'currency', expression: { op: 'sum', type: 'E', field: 'hr' } },
    { id: 'stock', label: 'Estoque em RT', aliases: [], format: 'currency', expression: { op: 'sum', type: 'R', field: 'h', at: 'last' } },
    { id: 'conversion', label: 'Conversão', aliases: [], format: 'percent', decimals: 1,
      expression: { op: 'ratio', scale: 100, terms: [{ op: 'sum', type: 'P', field: 'h' }, { op: 'sum', type: 'E', field: 'hr' }] } }], notes: [] }
const html = `<div id='raw-data'>E|2026-09|N|p1|100,00|40,00~E|2026-10|N|p1|200,00|50,00~E|2026-10|S|p1|300,00|90,00~P|2026-10|N|p1|30,00~R|2026-09|N|p1|500,00~R|2026-10|N|p1|600,00</div><script>window.MONTH='2026-10'; throw new Error('must not execute');</script>`
const manifest = parseManifest({ schemaVersion: '2.0', identity: { workspaceId: '11111111-1111-4111-8111-111111111111',
  semanticModelId: '22222222-2222-4222-8222-222222222222' }, model: { tables: [{ name: 'Calendario', columns: [{ name: 'Date' }] }],
  measures: [{ name: 'Visual', table: 'Calendario', presentationOnly: true }] }, reportReferences: [contract] })
const schema: PublishedSchema = { modelHash: 'model-v1', reportHash: 'report-v1', modelDescription: '', measures: [], columns: [],
  relationships: [], pages: ['HOME'], reportMap: [], visualCount: 1, visuals: [{ page: 'HOME', type: 'htmlContent', fields: ['Calendario[Visual]'] }] }

test('references bind the exact model, report definition and published visual', () => {
  assert.equal(validateReportReferences(manifest, schema).length, 1)
  assert.throws(() => validateReportReferences(manifest, { ...schema, modelHash: 'changed' }), /corresponde/)
  assert.throws(() => validateReportReferences(manifest, { ...schema, reportHash: 'changed' }), /corresponde/)
  assert.throws(() => validateReportReferences(manifest, { ...schema, visuals: [] }), /corresponde/)
  assert.throws(() => validateReportReferences({ ...manifest, raw: { ...manifest.raw, reportReferences: [{ ...contract,
    metrics: [{ ...contract.metrics[0], expression: { op: 'sum', type: 'E', field: 'missing' } }] }] } }, schema), /Campo inexistente/)
})

test('live visual payload preserves period, region, numeric precision and snapshot stock', () => {
  const scope = { months: ['2026-09', '2026-10'], region: 'north', products: null }
  const facts = factsFromReportHtml(html, contract, scope, contract.metrics)
  assert.equal(facts[0].value, 90)
  assert.equal(facts[1].value, 600)
  assert.equal(facts[2].value, 30 / 90 * 100)
  assert.equal(formatReportFact(facts[2]), 'Conversão: 33,3%')
  assert.equal(factsFromReportHtml(html, contract, { months: ['2026-10'], region: null, products: null }, [contract.metrics[0]])[0].value, 140)
})

test('malformed payloads, unsupported years and missing markers fail closed', () => {
  const scope = { months: ['2026-10'], region: null, products: null }
  assert.throws(() => factsFromReportHtml(html.replace('200,00', 'not-a-number'), contract, scope, contract.metrics), /Valor inválido/)
  assert.throws(() => factsFromReportHtml(html.replace('raw-data', 'missing'), contract, scope, contract.metrics), /Payload/)
  assert.throws(() => factsFromReportHtml(html, contract, { ...scope, months: ['2025-10'] }, contract.metrics), /ano/)
  assert.throws(() => factsFromReportHtml(html, contract, { ...scope, months: [] }, contract.metrics), /Período/)
})

test('scope parsing rejects unverified customer, product and altered-rule filters', () => {
  assert.deepEqual(reportScope('Qual honorários encontrados em outubro de 2026 no Sul?', contract)?.months, ['2026-10'])
  assert.equal(reportScope('Qual honorários encontrados em outubro de 2026 no Sul?', contract)?.region, 'south')
  for (const question of ['Qual honorários encontrados?', 'Qual honorários encontrados em 2026 para o cliente ACME?',
    'Qual honorários encontrados em 2026 para o produto IRPJ?', 'Qual honorários encontrados em 2026 sem a regra RT?',
    'Qual honorários encontrados em 2026 da equipe João?', 'Qual honorários encontrados hoje em 2026?']) {
    assert.equal(reportScope(question, contract), null, question)
  }
  assert.equal(reportScope('Honorários encontrados em outubro de 2026 no SP', contract), null)
  assert.equal(reportScope('Honorários encontrados em outubro de 2026 no XY', contract), null)
})

test('static KPI markers preserve rendered integers, negative currency and percentages', () => {
  const c: ReportReferenceContract = { ...contract, source: { kind: 'static-html', timeField: 'Calendario[Date]' },
    metrics: [{ id: 'target', label: 'Meta 1 TAX', aliases: [], format: 'currency', expression: { op: 'html-text', label: 'META 1', slot: 'currency' } },
      { id: 'attainment', label: 'Atingimento da meta 1 TAX', aliases: [], format: 'percent', expression: { op: 'html-text', label: 'META 1', slot: 'percent' } },
      { id: 'net', label: 'Realizado TAX', aliases: [], format: 'currency', expression: { op: 'html-text', label: 'VALOR LÍQUIDO', slot: 'currency' } }] }
  const facts = factsFromReportHtml('<style>999</style><div>META 1 R$ 100.000 5,77% VALOR LÍQUIDO R$ -25.500</div>', c,
    { months: ['2026-10'], region: null, products: null }, c.metrics)
  assert.deepEqual(facts.map(f => f.value), [100000, 5.77, -25500])
  assert.equal(formatReportFact(facts[0]), 'Meta 1 TAX: R$\u00a0100.000')
  assert.deepEqual(matchReportMetrics('Qual o percentual da meta 1 TAX em outubro de 2026?', c).map(m => m.id), ['attainment'])
  const dax = reportReferenceDax(manifest, c, { months: ['2026-10'], region: null, products: null })
  assert(dax.includes('DATE(2026, 10, 1)') && dax.includes('DATE(2026, 11, 1)'))
  assert.throws(() => factsFromReportHtml('<div>META 1 VALOR LÍQUIDO R$ 25.500</div>', c,
    { months: ['2026-10'], region: null, products: null }, [c.metrics[0]]), /Valor não encontrado/)
  assert.throws(() => factsFromReportHtml('<div>META 1 R$ 100.000</div>', c,
    { months: ['2026-10'], region: null, products: null }, [{ ...c.metrics[0], expression: { op: 'html-text', label: 'META 1', slot: 'currency', occurrence: 2 } }]), /Marcador/)
})

test('explicit quarters, semesters and ISO months preserve the period and reject day qualifiers', () => {
  assert.deepEqual(reportScope('Honorários encontrados no primeiro trimestre de 2026', contract)?.months, ['2026-01', '2026-02', '2026-03'])
  assert.deepEqual(reportScope('Honorários encontrados no segundo semestre de 2026', contract)?.months,
    ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'])
  assert.deepEqual(reportScope('Honorários encontrados em 2026-10', contract)?.months, ['2026-10'])
  assert.deepEqual(reportScope('Compare honorários encontrados em junho e outubro de 2026', contract)?.months, ['2026-06', '2026-10'])
  assert.equal(reportScope('Honorários encontrados em 2026-10-13', contract), null)
  assert.equal(reportScope('Honorários encontrados em 13 outubro de 2026', contract), null)
  assert.equal(reportScope('Honorários encontrados no trimestre de 2026', contract), null)
  assert.equal(reportScope('Honorários encontrados no terceiro semestre de 2026', contract), null)
  const numbered = { ...contract, source: { ...contract.source, regionLabels: { southeast: 'Sudeste', southeast2: 'Sudeste 2' } } }
  assert.equal(reportScope('Honorários encontrados em outubro de 2026 no Sudeste 2', numbered)?.region, 'southeast2')
})

test('blank published KPI values remain unavailable rather than becoming zero', () => {
  const c: ReportReferenceContract = { ...contract, source: { kind: 'static-html' },
    metrics: [{ id: 'margin', label: 'Margem', aliases: [], format: 'percent',
      expression: { op: 'html', label: 'Margem', groupClass: 'gp-1', valueClass: 'k-value' } }] }
  const fact = factsFromReportHtml('<div class="gp-1"><div class="kpi"><div class="k-label">Margem</div><div class="k-value"></div></div></div>',
    c, { months: ['2026-10'], region: null, products: null }, c.metrics)[0]
  assert.equal(fact.value, null)
  assert.equal(formatReportFact(fact), 'Margem: sem base para calcular')
  assert.throws(() => factsFromReportHtml('<div class="gp-1"></div>', c, { months: ['2026-10'], region: null, products: null }, c.metrics), /ausente/)
})

test('model-selected comparisons are rendered only from compatible verified values', () => {
  const facts = factsFromReportHtml(html, contract, { months: ['2026-10'], region: 'north', products: null }, contract.metrics)
  const other = { ...facts[0], id: 'later', label: 'Honorários encontrados (outro período)', value: 20, scope: 'outro período' }
  const output = renderReportComparisons([...facts, other], [{ left: facts[0].id, right: 'later' },
    { left: facts[0].id, right: facts[1].id }, { left: facts[0].id, right: 'invented' }, { left: facts[0].id, right: facts[2].id }])
  assert.deepEqual(output, ['Honorários encontrados é maior que Honorários encontrados (outro período).'])
})
