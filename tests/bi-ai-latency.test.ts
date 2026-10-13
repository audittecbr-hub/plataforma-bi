import assert from 'node:assert/strict'
import test from 'node:test'
import { readLlmCompletionStream } from '../src/lib/llm-stream'
import { focusedPlannerContext } from '../src/lib/bi-ai/planner-context'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { selectContext } from '../src/lib/bi-ai/context'
import { parsePlan } from '../src/lib/bi-ai/plan'
import { publishedAggregations, compileSourceAnalysis } from '../src/lib/bi-ai/source-analysis'
import { sourceVariables, resolveSourceVariables, reconcileVariableSource, usesPublishedDataRule, sourceTableFields } from '../src/lib/bi-ai/dax-source'

test('provider activity preserves completion, tools and usage across UTF-8 fragments without exposing reasoning', async () => {
  const events = [{ choices: [{ delta: { reasoning_content: 'Internal private reasoning 📊' } }] },
    { choices: [{ delta: { content: '{"answer":"📊 conferido"}', tool_calls: [{ index: 0, id: 'tool-1', function: { name: 'read', arguments: '{"x":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] }, finish_reason: 'tool_calls' }], usage: { total_tokens: 101 } }]
  const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\r\n\r\n`).join('') + 'data: [DONE]\n\n')
  const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } }))
  const reported: string[] = []
  const result = await readLlmCompletionStream(response, activity => reported.push(activity))
  assert.deepEqual(reported, ['reasoning', 'output'])
  assert.equal(result.message.content, '{"answer":"📊 conferido"}')
  assert.equal(result.message.reasoning_content, 'Internal private reasoning 📊')
  assert.equal(result.tokens, 101)
  assert.equal(result.calls[0].function.arguments, '{"x":1}')
  assert.equal(result.finish, 'tool_calls')
  await assert.rejects(readLlmCompletionStream(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'), () => {}), /antes de concluir/)
  await assert.rejects(readLlmCompletionStream(new Response('data: [DONE]\n\n'), () => {}), /antes de concluir/)
  await assert.rejects(readLlmCompletionStream(new Response('data: {"error":{"message":"private"}}\n\n'), () => {}), /interrompeu/)
})

test('source analysis keeps published row rounding/weights while regrouping and retaining ties', () => {
  const manifest = parseManifest({ schemaVersion: '2.0', identity: { workspaceId: '11111111-1111-4111-8111-111111111111',
    semanticModelId: '22222222-2222-4222-8222-222222222222' }, model: { tables: [{ name: 'Events', columns: [
      { name: 'Job' }, { name: 'Team' }, { name: 'Date', dataType: 'dateTime' }, { name: 'Eligible', dataType: 'int64' }, { name: 'Amount', dataType: 'decimal' },
    ] }], measures: [{ name: 'Visual', table: 'Events' }] } })
  const source = { measure: 'Visual', table: 'Events', description: '', variables: sourceVariables(`
VAR _records = SELECTCOLUMNS(Events, "Job", Events[Job], "Team", Events[Team], "Fee", ROUND(Events[Amount], 2), "Eligible", Events[Eligible])
VAR _byTeam = GROUPBY(_records, [Team], "Total", SUMX(CURRENTGROUP(), [Eligible] * [Fee]))
RETURN SUMX(_byTeam, [Total])`) }
  assert.deepEqual(publishedAggregations(source)[0].fields, ['Job', 'Team', 'Fee', 'Eligible'])
  const raw = { action: 'source-analysis', sourceMeasure: 'Visual', variable: '_byTeam', metrics: [{ name: 'Total', label: 'Verified fees' }],
    groupBy: [{ name: 'Job', expression: '[Job]' }], filter: '[Team] = "A"', top: { count: 1, metric: 'Total' }, maxRows: 1 }
  const compiled = compileSourceAnalysis(raw, [source])
  assert(compiled.dax.includes('SUMX(CURRENTGROUP(), [Eligible] * [Fee])'))
  assert(compiled.dax.includes('FILTER(_records, [Team] = "A")'))
  assert(compiled.maxRows >= 100)
  const context = { ...selectContext(manifest, 'Which job?', false), semanticSources: [source] }
  assert.equal(parsePlan(JSON.stringify(raw), context, manifest, 'Which job?').queries[0].sourceMeasure, 'Visual')
  assert.equal(compileSourceAnalysis({ ...raw, variable: '_records' }, [source]).sourceMeasure, 'Visual')
  const auxiliary = { ...source, measure: 'Auxiliary', variables: [] }
  assert.equal(compileSourceAnalysis({ ...raw, sourceMeasure: 'Auxiliary' }, [source, auxiliary]).sourceMeasure, 'Visual')
  assert.throws(() => compileSourceAnalysis({ ...raw, filter: { month: '2026-09' } }, [source]), /predicado DAX/)
  assert.throws(() => compileSourceAnalysis({ ...raw, top: { ...raw.top, descending: 'false' } }, [source]), /true ou false/)
  assert.throws(() => parsePlan(JSON.stringify({ ...raw, groupBy: [{ name: 'Job', expression: 'Events[Invented]' }] }), context, manifest, 'Which job?'))
  assert.throws(() => compileSourceAnalysis({ ...raw, metrics: ['Invented'] }, [source]), /ausente/)
})

test('small source routing and variable inspection retain exact dependencies and the full model catalog', () => {
  const manifest = parseManifest({ schemaVersion: '2.0', identity: { workspaceId: '11111111-1111-4111-8111-111111111111',
    semanticModelId: '22222222-2222-4222-8222-222222222222' }, model: { tables: [{ name: 'Events', columns: [
      { name: 'Job' }, { name: 'Date', dataType: 'dateTime' }, { name: 'Amount', dataType: 'decimal' },
      ...Array.from({ length: 40 }, (_, i) => ({ name: `Attribute${i}` })),
    ] }], measures: [{ name: 'Income', table: 'Events' }] } })
  const source = { measure: 'PublishedVisual', table: 'Events', description: 'Revenue uses rounded eligible rows.', variables: sourceVariables(
    `VAR _cutoff = DATE(2026, 1, 1)\nVAR _eligible = SELECTCOLUMNS(FILTER(Events, Events[Date] >= _cutoff), "Job", Events[Job], "Value", ROUND(Events[Amount], 2))\nVAR _sum = SUMX(_eligible, [Value])\nVAR _unrelated = "${'irrelevant'.repeat(5000)}"\nRETURN _sum`) }
  const context = { ...selectContext(manifest, 'Which job has the most revenue?', false), semanticSources: [source] }
  assert(!JSON.stringify(focusedPlannerContext(context, manifest, 'Which job?', [source])).includes('irrelevant'))
  const selected = parsePlan('{"action":"focus-source","measures":["PublishedVisual"]}', context, manifest, 'Which job?')
  assert.deepEqual(selected.inspect, ['PublishedVisual::catalog'])
  const inspection = parsePlan('{"action":"inspect-source","measure":"PublishedVisual","variables":["_sum"]}', context, manifest, 'Which job?')
  const focused = focusedPlannerContext(context, manifest, 'Which job?', [source], [...inspection.inspect!, 'Events'], [], 0)
  assert.equal(focused.tables[0].columns.length, 43)
  assert.deepEqual(focused.semanticSources[0].variables?.map(variable => variable.name), ['_cutoff', '_eligible', '_sum'])
  assert.equal(focused.semanticSources[0].variables?.[1].expression, source.variables[1].expression)
  const fields = sourceTableFields({ ...source, variables: sourceVariables(`
VAR _base = SELECTCOLUMNS(Events, "Key", Events[Job], "Value", Events[Amount])
VAR _extra = ADDCOLUMNS(_base, "Counts", 1)
VAR _grouped = GROUPBY(_extra, [Key], "Total", SUMX(CURRENTGROUP(), [Value]))
VAR _filtered = FILTER(_extra, [Counts] = 1)
VAR _scalar = SUMX(_extra, [Value])
RETURN _scalar`) })
  assert.deepEqual(fields.get('_extra'), ['Key', 'Value', 'Counts'])
  assert.deepEqual(fields.get('_filtered'), ['Key', 'Value', 'Counts'])
  assert.deepEqual(fields.get('_grouped'), ['Key', 'Total'])
  assert.equal(fields.get('_scalar'), undefined)
  assert(!JSON.stringify(focused).includes('irrelevant'))
  const whole = focusedPlannerContext(context, manifest, 'Which job?', [source], ['PublishedVisual'])
  assert.equal(whole.semanticSources[0].variables?.length, source.variables.length)
  assert.throws(() => parsePlan('{"action":"inspect-source","measure":"OtherModel","variables":["_sum"]}', context, manifest, 'Which job?'), /inexistente/)
  assert.throws(() => parsePlan('{"action":"inspect-source","measure":"PublishedVisual","variables":["_invented"]}', context, manifest, 'Which job?'), /nomes exatos/)
  assert.equal(resolveSourceVariables(source, 'EVALUATE VAR _sum = 0 RETURN ROW("Value", _sum)').length, 0)
  assert(usesPublishedDataRule(resolveSourceVariables(source, '_sum')))
  assert(!usesPublishedDataRule(resolveSourceVariables(source, '_cutoff')))
  const auxiliary = { ...source, measure: 'Auxiliary', variables: [source.variables[0]] }
  assert.equal(reconcileVariableSource([source, auxiliary], auxiliary, ['_eligible']).measure, source.measure)
  assert.equal(reconcileVariableSource([source, { ...source, measure: 'Another' }, auxiliary], auxiliary, ['_eligible']).measure, auxiliary.measure)
  const corrected = parsePlan('{"action":"inspect-source","measure":"Auxiliary","variables":["_eligible"]}',
    { ...context, semanticSources: [source, auxiliary] }, manifest, 'Which job?')
  assert.deepEqual(corrected.inspect, ['PublishedVisual::_eligible'])
})
