import assert from 'node:assert/strict'
import test from 'node:test'
import { answerContext, resultValue, formatVerifiedAnswer } from '../src/lib/bi-ai/presentation'
import { focusedPlannerContext } from '../src/lib/bi-ai/planner-context'
import { daxObjectReferences, sourceVariables, usesPublishedDataRule } from '../src/lib/bi-ai/dax-source'
import { nativeMeasureRules } from '../src/lib/bi-ai/measure-dependencies'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { selectContext } from '../src/lib/bi-ai/context'
import { parsePlan, parseReviewedPlan } from '../src/lib/bi-ai/plan'
import { readWithCapacityFallback, reuseRowCalculations, splitScalarRow, splitScenarioRows } from '../src/lib/bi-ai/dax-performance'
import { auditResultQuery, materializeVerifiedResults, resultCatalog } from '../src/lib/bi-ai/result-query'
import { prepareSemanticQuery } from '../src/lib/bi-ai/semantic-query'

test('shared answers explain the recut before values and preserve unrounded ratios with explicit formats', () => {
  const paragraph = 'Esta análise compara a receita líquida com a meta anual; a projeção é um cenário baseado no ritmo observado.'
  assert.equal(answerContext(paragraph, 'Fallback'), paragraph)
  assert.equal(answerContext('O resultado é 127.388.140,96.', 'Fallback'), 'Fallback')
  assert.equal(answerContext('O resultado é R$ 10.', 'Fallback'), 'Fallback')
  assert.equal(answerContext('O indicador é medido em reais (R$).', 'Fallback'), 'O indicador é medido em reais (R$).')
  assert.equal(resultValue(0.375, { type: 'percent', percentScale: 'ratio' }), '37,50%')
  assert.equal(resultValue(37.5, { type: 'percent', percentScale: 'points' }), '37,50%')
  assert.equal(resultValue(12345.67, { type: 'currency' }), 'R$\u00a012.345,67')
  const output = formatVerifiedAnswer({ facts: [{ id: 'f0', metricId: 'income', label: 'Receita líquida', value: 123.45,
    format: 'currency', precision: 0.005, scope: '2026-10' }], insights: [], pages: ['HOME'], notes: [], refreshFailed: false })
  assert(output.startsWith('Consultei Receita líquida'))
  assert(output.indexOf('2026-10') < output.indexOf('R$'))
  assert(!/[\p{Extended_Pictographic}]/u.test(output))
})

test('derived DAX uses complete authenticated BI results and keeps temporary values out of persistent logs', () => {
  const manifest = parseManifest({ schemaVersion: '2.0', identity: { workspaceId: '11111111-1111-4111-8111-111111111111',
    semanticModelId: '22222222-2222-4222-8222-222222222222' }, model: { tables: [{ name: 'Events', columns: [{ name: 'Amount' }] }], measures: [] } })
  const context = selectContext(manifest, 'Compare the realized values', false)
  const results = [{ purpose: 'Values read from the model', truncated: false, rows: [{ '[Income]': 123.45 }, { '[Income]': 76.55 }] }]
  assert.deepEqual(resultCatalog(results)[0].columns, [{ field: '[Income]', alias: '_bi_col_0_0' }])
  assert.equal(resultCatalog(results, { ...manifest, measures: [{ ...manifest.tables[0].columns[0], name: '_bi_col_0_0' }] })[0].columns[0].alias, '_bi_col_0_0_value')
  const dax = 'EVALUATE ROW("Total", SUMX(_bi_result_0, [_bi_col_0_0]))'
  const compiled = prepareSemanticQuery({ dax, maxRows: 1, context, manifest, results })
  assert.equal(prepareSemanticQuery({ dax: dax.replace('[_bi_col_0_0]', '_bi_result_0[_bi_col_0_0]'), maxRows: 1, context, manifest, results }).dax, compiled.dax)
  const local = prepareSemanticQuery({ dax: 'DEFINE VAR t = FILTER(_bi_result_0, [_bi_col_0_0] > 0) EVALUATE ROW("Total", SUMX(t, t[_bi_col_0_0]))',
    maxRows: 1, context, manifest, results })
  assert(local.dax.includes('SUMX(t, [_bi_col_0_0])'))
  assert(!local.body.includes('DEFINE'))
  assert.throws(() => prepareSemanticQuery({ dax: 'DEFINE MEASURE Events[Fake] = 1 EVALUATE ROW("Total", [Fake])', maxRows: 1, context, manifest, results }), /EVALUATE/)
  assert(compiled.dax.includes('VAR _bi_result_0 = UNION(ROW("_bi_col_0_0", 123.45), ROW("_bi_col_0_0", 76.55))'))
  const audit = auditResultQuery(compiled.dax)
  assert(!audit.includes('123.45') && !audit.includes('76.55'))
  assert(audit.includes('SUMX(_bi_result_0, [_bi_col_0_0])'))
  assert.throws(() => materializeVerifiedResults(dax, [{ ...results[0], truncated: true }]), /completo/)
  assert.throws(() => materializeVerifiedResults('EVALUATE ROW("Total", SUMX(_bi_result_9, [_bi_col_0_0]))', results), /completo/)
  assert.throws(() => materializeVerifiedResults('EVALUATE VAR _bi_result_0 = 999 RETURN ROW("Total", _bi_result_0)', results), /Não redefina/)
  assert.throws(() => materializeVerifiedResults(dax, [{ ...results[0], rows: [{ '[Income]': 123.45 }, { '[Income]': 'other' }] }]), /tipos diferentes/)
  const plan = parsePlan(JSON.stringify({ action: 'result-query', queries: [{ dax }] }), context, manifest, 'Compare the realized values', results)
  assert(plan.queries.length === 1)
  assert.throws(() => parsePlan(JSON.stringify({ action: 'result-query', queries: [{ dax }] }), context, manifest, 'Compare the realized values'), /completo/)
})

test('live scalar visuals expose their own native measure inputs and identify broken auxiliary dependencies', () => {
  const manifest = parseManifest({ schemaVersion: '2.0', identity: { workspaceId: '11111111-1111-4111-8111-111111111111',
    semanticModelId: '22222222-2222-4222-8222-222222222222' }, model: { tables: [{ name: 'Events', columns: [{ name: 'Date' }, { name: 'Amount' }] }],
    measures: [{ name: 'Net income', table: 'Events', publishedExpression: 'SUM(Events[Amount])' },
      { name: 'Gross income', table: 'Events', publishedExpression: 'SUM(Removed[Amount])' }, { name: 'Visual', table: 'Events' }] } })
  const source = { measure: 'Visual', table: 'Events', description: '', variables: sourceVariables(
    'VAR _realized = COALESCE([Net income], 0)\nVAR _label = FORMAT(_realized, "R$ #,0")\nRETURN _label') }
  const context = { ...selectContext(manifest, 'What is the annual income?', false), semanticSources: [source],
    measures: manifest.measures.map(measure => ({ ...measure, publishedExpression: measure.name === 'Net income' ? 'SUM(Events[Amount])' : measure.publishedExpression })) }
  const focused = focusedPlannerContext(context, manifest, 'What is the annual income?', [source], ['Visual::auto'])
  assert(focused.semanticSources[0].variables?.some(variable => variable.name === '_realized'))
  assert(focused.availableMeasures.includes('Net income'))
  assert(!focused.availableMeasures.includes('Gross income'))
  assert(usesPublishedDataRule(source.variables))
  assert(!usesPublishedDataRule(sourceVariables('VAR _cutoff = MAX(Events[Date])\nRETURN _cutoff')))
  const schema = { modelHash: 'test', modelDescription: '', columns: [], relationships: [], pages: [], reportMap: [], visualCount: 0, visuals: [],
    measures: [{ name: 'Net income', table: 'Events', expression: 'SUM(Events[Amount])' },
      { name: 'Gross income', table: 'Events', expression: 'SUM(Removed[Amount])' },
      { name: 'Dependent income', table: 'Events', expression: '[Gross income] + 1' }] }
  const inputs = nativeMeasureRules(['[Net income] + [Dependent income]'], schema, manifest)
  assert.deepEqual(inputs.find(input => input.name === 'Net income')?.missingTables, [])
  assert.deepEqual(inputs.find(input => input.name === 'Dependent income')?.missingTables, ['Removed'])
  assert.deepEqual(daxObjectReferences('"[fake]" & [Net income] -- [ignored]\n+\'Events\'[Amount]'), [{ name: 'Net income' }, { table: 'Events', name: 'Amount' }])
  const plan = parsePlan(JSON.stringify({ answerable: true, explanation: 'Compare o realizado com a meta.', queries: [{ dax: 'EVALUATE ROW("Income", [Net income])',
    formats: { Income: { type: 'currency' } } }] }), context, manifest, 'What is the income?')
  assert.equal(plan.explanation, 'Compare o realizado com a meta.')
  assert.equal(plan.queries[0].formats?.Income.type, 'currency')
  assert.equal(parsePlan(JSON.stringify({ answerable: true, queries: [{ dax: 'EVALUATE ROW("Income", [Net income])',
    formats: { Income: { type: 'decimal' } } }] }), context, manifest, 'What is the income?').queries[0].formats?.Income.type, 'number')
  const approved = parseReviewedPlan('{"approved":true}', plan, context, manifest, 'What is the income?')
  assert.deepEqual(approved.queries, plan.queries)
  assert.equal(approved.explanation, plan.explanation)
  assert.throws(() => parseReviewedPlan(JSON.stringify({ approved: false, issues: [{ queryIndex: 0, reason: 'New calculation' }],
    queries: [...plan.queries, ...plan.queries] }), plan, context, manifest, 'What is the income?'), /sem acrescentar/)
  assert.throws(() => parsePlan(JSON.stringify({ answerable: true, queries: [{ dax: 'EVALUATE ROW("Income", [Net income])',
    formats: { Income: { type: 'percent' } } }] }), context, manifest, 'What is the income?'), /percentScale/)
})

test('repeated scalar reads keep filter context and capacity fallbacks never return partial results', async () => {
  const calculation = 'CALCULATE([Net income], Events[Date] >= DATE(2026, 1, 1))'
  const query = `EVALUATE ROW("Income", ${calculation}, "Twice", ${calculation} * 2, "Other", 3)`
  const optimized = reuseRowCalculations(query)
  assert.equal(optimized.split(calculation).length - 1, 1)
  assert(optimized.includes('RETURN ROW("Income", _bi_shared_0, "Twice", _bi_shared_0 * 2'))
  const contextual = `EVALUATE ROW("Totals", SUMX(Events, ${calculation} + ${calculation}))`
  assert.equal(reuseRowCalculations(contextual), contextual)
  const branches = `EVALUATE ROW("Income", IF(FALSE(), ${calculation}, 0), "Twice", ${calculation})`
  assert.equal(reuseRowCalculations(branches), branches)
  const parts = splitScalarRow(optimized)!
  assert.equal(parts.length, 2)
  assert(parts.every(part => part.includes(`VAR _bi_shared_0 = ${calculation}`)))
  assert.equal(splitScalarRow('EVALUATE FILTER(ROW("a", 1, "b", 2), [a] > 0)'), null)
  let split = 0, calls = 0
  const read = async (dax: string) => {
    calls++
    if (dax === optimized) throw new Error('Resource Governance: memory limit')
    return dax.includes('"Income"') ? [{ Income: 10, Twice: 20 }] : [{ Other: 3 }]
  }
  assert.deepEqual(await readWithCapacityFallback(optimized, read, () => split++), [{ Income: 10, Twice: 20, Other: 3 }])
  assert.equal(split, 1)
  assert.equal(calls, 3)
  await assert.rejects(readWithCapacityFallback(optimized, async dax => {
    if (dax === optimized) throw new Error('Resource Governance: memory limit')
    if (dax.includes('"Other"')) throw new Error('Source unavailable')
    return [{ Income: 10, Twice: 20 }]
  }), /Source unavailable/)
  const union = 'EVALUATE TOPN(10, (VAR x = 1 RETURN UNION(ROW("Scenario", "A", "Value", x), ROW("Scenario", "B", "Value", x * 2))))'
  assert.equal(splitScenarioRows(union)?.length, 2)
  assert.equal(splitScenarioRows(union.replace('TOPN(10', 'TOPN(1')), null)
  assert.equal(splitScenarioRows(union.replace('"Scenario", "B"', '"Different", "B"')), null)
  assert.deepEqual(await readWithCapacityFallback(union, async dax => {
    if (dax === union) throw new Error('Resource Governance: memory limit')
    return dax.includes('"B"') ? [{ Scenario: 'B', Value: 2 }] : [{ Scenario: 'A', Value: 1 }]
  }), [{ Scenario: 'A', Value: 1 }, { Scenario: 'B', Value: 2 }])
})
