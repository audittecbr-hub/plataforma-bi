import assert from 'node:assert/strict'
import test from 'node:test'
import { invalidateAiRequest, memoAiRequest, withAiRequestCache } from '../src/lib/ai-request-cache'
import { mapConcurrent } from '../src/lib/bi-ai/concurrency'
import { fullContextForPlanner, preloadPlannerContext, selectContext } from '../src/lib/bi-ai/context'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { validateDax } from '../src/lib/bi-ai/dax-guard'

const parsed = parseManifest({ schemaVersion: '2.0', identity: {
  workspaceId: '11111111-1111-4111-8111-111111111111', semanticModelId: '22222222-2222-4222-8222-222222222222',
}, capabilities: { fullModelAccess: false }, business: {}, report: {}, model: {
  tables: [{ name: 'Fato', columns: [
    { name: 'Valor', dataType: 'decimal' }, { name: 'Cliente', queryable: true },
    { name: 'Documento', restricted: true }, ...Array.from({ length: 30 }, (_, i) => ({ name: `Dim${i}` })),
  ] }, { name: 'Tecnica', queryable: false, columns: [{ name: 'Segredo' }] }],
  measures: [{ name: 'Receita', table: 'Fato', description: 'Regra completa de apuração. '.repeat(90) + 'Não somar meses de estoque.' },
    { name: 'HTML', table: 'Fato', presentationOnly: true }],
} })
// Exercise the helper's restriction handling independently of the portal's
// current full-model policy (which normalizes these flags during parsing).
const manifest = { ...parsed, tables: parsed.tables.map(table => ({ ...table,
  queryable: table.name !== 'Tecnica', columns: table.columns.map(column =>
    ({ ...column, restricted: column.name === 'Documento' })),
})) }

test('preloaded metadata retains complete rules and authorized fields for crossings', () => {
  const narrow = selectContext(manifest, 'receita', false)
  const loaded = preloadPlannerContext(narrow, manifest)
  assert.notEqual(loaded, narrow)
  assert.equal(loaded.columns.length, 32)
  assert(!loaded.tables.some(table => table.name === 'Tecnica'))
  assert(!loaded.columns.some(column => column.name === 'Documento'))
  const rich = fullContextForPlanner({ ...loaded, measures: loaded.measures.map(measure =>
    ({ ...measure, publishedExpression: 'SUM(Fato[Valor])' })) })
  assert.equal(rich.measures[0].description, manifest.measures[0].description)
  assert.equal(rich.measures[0].publishedExpression, 'SUM(Fato[Valor])')
  assert(!rich.measures.some(measure => measure.name === 'HTML'))
  assert.doesNotThrow(() => validateDax('EVALUATE TOPN(5, SUMMARIZECOLUMNS(Fato[Dim29], "Receita", [Receita]), [Receita], DESC)', loaded, manifest, 5))
  assert.throws(() => validateDax('EVALUATE TOPN(5, SELECTCOLUMNS(Fato, "Documento", Fato[Documento]))', loaded, manifest, 5))
})

test('large models preserve the original context and on-demand inspection', () => {
  const narrow = selectContext(manifest, 'receita', false)
  const large = { ...manifest, measures: Array.from({ length: 100 }, (_, i) => ({
    ...manifest.measures[0], name: `M${i}`, description: 'Regra de negócio completa. '.repeat(180),
  })) }
  assert.equal(preloadPlannerContext(narrow, large), narrow)
})

test('independent queries overlap with a bounded pool and preserve result order', async () => {
  let active = 0, maximum = 0
  const result = await mapConcurrent([0, 1, 2, 3, 4, 5], 3, async i => {
    active++
    maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, 25 - i * 3))
    active--
    return `resultado-${i}`
  })
  assert.equal(maximum, 3)
  assert.equal(active, 0)
  assert.deepEqual(result, Array.from({ length: 6 }, (_, i) => `resultado-${i}`))
})

test('query failures await every launched read and never return partial results', async () => {
  const finished: number[] = []
  await assert.rejects(mapConcurrent([0, 1, 2], 2, async i => {
    await new Promise(resolve => setTimeout(resolve, i ? 20 : 1))
    finished.push(i)
    if (i === 0) throw new Error('Fonte indisponível')
    return i
  }), /Fonte indisponível/)
  assert.deepEqual(finished.sort(), [0, 1, 2])
  let launched = 0
  await assert.rejects(mapConcurrent([1], 2, async () => { launched++; return 1 }, AbortSignal.abort()), { name: 'AbortError' })
  assert.equal(launched, 0)
})

test('configuration reads are coalesced only within the same request', async () => {
  let reads = 0
  const read = async () => ++reads
  await withAiRequestCache(async () => {
    assert.deepEqual(await Promise.all([memoAiRequest('provider', read), memoAiRequest('provider', read)]), [1, 1])
    invalidateAiRequest('provider')
    assert.equal(await memoAiRequest('provider', read), 2)
  })
  await withAiRequestCache(async () => assert.equal(await memoAiRequest('provider', read), 3))
  assert.equal(await memoAiRequest('provider', read), 4)
  assert.equal(await memoAiRequest('provider', read), 5)
})

test('failed request reads can be retried without poisoning later calls', async () => {
  await withAiRequestCache(async () => {
    await assert.rejects(memoAiRequest('retry', async () => { throw new Error('Falha temporária') }), /Falha/)
    assert.equal(await memoAiRequest('retry', async () => 'atual'), 'atual')
  })
})
