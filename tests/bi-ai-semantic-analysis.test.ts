import assert from 'node:assert/strict'
import test from 'node:test'
import { maskDax, sourceVariables } from '../src/lib/bi-ai/dax-source'
import { boundedReadQuery, prepareSemanticQuery } from '../src/lib/bi-ai/semantic-query'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { inspectCatalog, preloadPlannerContext, selectContext } from '../src/lib/bi-ai/context'
import { parsePublishedSchema, withPublishedSchema } from '../src/lib/bi-ai/fabric-schema'
import { parsePlan, trimResults } from '../src/lib/bi-ai/plan'
import { answerBiQuestion } from '../src/lib/bi-ai/pipeline'
import { withAiRequestCache } from '../src/lib/ai-request-cache'
import { issueAnalysisCheckpoint, readAnalysisCheckpoint } from '../src/lib/bi-ai/analysis-checkpoint'

const expression = `/* emoji 📊 and VAR fake = syntax in a comment */
VAR _initial = DATE(2026, 1, 1)
VAR _records = SELECTCOLUMNS(FILTER('Events', 'Events'[Date] >= _initial), "Job", 'Events'[Job], "Value", ROUND('Events'[Amount], 2))
VAR _prepared = ADDCOLUMNS(_records, "Nested", VAR _local = [Value] RETURN _local * 2)
VAR _sum = SUMX(_prepared, [Value])
VAR _layout = "<div data-tip-t='Participação' data-tip='Parte da entidade no total do período.'>" & _sum & "</div>"
VAR _markup = _layout & "<script>window.test()</script>"
RETURN _markup`
const manifest = parseManifest({ schemaVersion: '2.0', identity: {
  workspaceId: '11111111-1111-4111-8111-111111111111', semanticModelId: '99999999-9999-4999-8999-999999999999',
}, capabilities: { liveDefinitionRequired: true }, model: { tables: [{ name: 'Events', columns: [
  { name: 'Job' }, { name: 'Date', dataType: 'dateTime' }, { name: 'Amount', dataType: 'decimal' },
  ...Array.from({ length: 40 }, (_, i) => ({ name: `Field${i}` })),
] }], measures: [{ name: 'Total', table: 'Events' }, { name: 'Visual', table: 'Events', presentationOnly: true }] } })
const part = { path: 'definition/tables/Events.tmdl', payloadType: 'InlineBase64', payload: Buffer.from(
  `table Events\n${manifest.tables[0].columns.map(column => `\tcolumn ${column.name}`).join('\n')}\n\tmeasure Total = SUM(Events[Amount])\n\tmeasure Visual =\n${expression.split('\n').map(line => '\t\t\t' + line).join('\n')}`).toString('base64') }
const schema = parsePublishedSchema([part])
const context = withPublishedSchema(preloadPlannerContext(selectContext(manifest, 'modelo', false), manifest), manifest, schema, 360000)

test('analysis checkpoints preserve progress and bind user, dashboard, conversation and expiry', () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-checkpoint-key-longer-than-thirty-two-characters'
  try {
    const binding = { userId: 'user', dashboardId: 'project', conversationId: 'conversation' }
    const state = { ...binding, question: 'Pergunta livre', modelHash: 'hash', issuedAt: Date.now(), started: Date.now(), round: 1,
      inspected: ['Visual'], exploration: [{ purpose: 'Fonte', rows: [{ Job: '12345-FTX', Value: 12 }], truncated: false }], queryMeta: [],
      tokens: 1, feedback: 'Continue', invalidPlans: 0, refreshBefore: null }
    const token = issueAnalysisCheckpoint(state)
    assert(!token.includes('12345-FTX'))
    assert.deepEqual(readAnalysisCheckpoint(token, binding), state)
    assert.throws(() => readAnalysisCheckpoint(token, { ...binding, dashboardId: 'another' }), /inválida/)
    assert.throws(() => readAnalysisCheckpoint(token, { ...binding, userId: 'another' }), /inválida/)
    assert.throws(() => readAnalysisCheckpoint(token, binding, Date.now() + 3 * 60 * 60_000), /expirou/)
    assert.throws(() => readAnalysisCheckpoint(token.slice(0, -8) + 'tampered', binding), /inválida/)
  } finally {
    if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = saved
  }
})

test('live visual rules expose pure DAX variables with exact dependencies, without running markup', () => {
  const variables = sourceVariables(expression)
  assert.deepEqual(variables.map(variable => variable.name), ['_initial', '_records', '_prepared', '_sum'])
  assert.deepEqual(variables[2].dependencies, ['_records'])
  assert(context.semanticSources?.find(source => source.measure === 'Visual')?.description.includes('Parte da entidade no total do período'))
  assert(variables[2].expression.includes('VAR _local'))
  assert.equal(maskDax('"📊 VAR bad = x" VAR _ok = 1').length, '"📊 VAR bad = x" VAR _ok = 1'.length)
  const query = prepareSemanticQuery({ dax: 'EVALUATE ROW("Total", SUMX(_records, [Value]))', sourceMeasure: 'Visual', maxRows: 1, context, manifest })
  assert(query.dax.startsWith('DEFINE\nVAR _initial = DATE(2026, 1, 1)\nVAR _records = SELECTCOLUMNS'))
  assert(!query.dax.includes('_prepared') && !query.dax.includes('<script'))
  assert.equal(prepareSemanticQuery({ dax: 'EVALUATE ROW("Total", SUMX(_records, [Value]))', maxRows: 1, context, manifest }).sourceMeasure, 'Visual')
  assert.throws(() => prepareSemanticQuery({ dax: 'EVALUATE ROW("Total", SUMX(_records, [Value]))', maxRows: 1,
    context: { ...context, semanticSources: [...context.semanticSources!, { ...context.semanticSources![0], measure: 'Ambiguous visual' }] }, manifest }))
  assert.throws(() => prepareSemanticQuery({ dax: 'EVALUATE ROW("Total", _invented)', sourceMeasure: 'Visual', maxRows: 1, context, manifest }))
  assert.throws(() => prepareSemanticQuery({ dax: 'EVALUATE ROW("Total", SUMX(_records, [Value]))', sourceMeasure: 'Other model', maxRows: 1, context, manifest }))
})

test('read expressions retain filters and sorting, and all fields survive the answer transport', () => {
  const query = boundedReadQuery('EVALUATE SUMMARIZECOLUMNS(Events[Job], "Total", [Total]) ORDER BY [Total] DESC', 25)
  assert(query.includes('TOPN(25, (SUMMARIZECOLUMNS') && query.includes(', [Total], DESC) ORDER BY [Total] DESC'))
  const defaultOrder = boundedReadQuery('EVALUATE SUMMARIZECOLUMNS(Events[Job], "Total", [Total]) ORDER BY Events[Job], [Total] DESC', 25)
  assert(defaultOrder.includes(', Events[Job], ASC, [Total], DESC) ORDER BY Events[Job], [Total] DESC'))
  const expressionOrder = boundedReadQuery('EVALUATE ROW("Total", [Total]) ORDER BY DIVIDE([Total], 2), [Total]', 10)
  // ROW is a single result and needs no bounding/sort transformation.
  assert(expressionOrder.startsWith('EVALUATE ROW'))
  const plan = parsePlan(JSON.stringify({ answerable: true, queries: [{ dax: query, maxRows: 25 }] }), context, manifest, 'Qual maior job?')
  assert.equal(plan.queries.length, 1)
  assert.deepEqual(parsePlan(JSON.stringify({ action: 'search-catalog', terms: ['amount'] }), context, manifest, 'Qual valor?').catalogSearch, ['amount'])
  assert.equal(parsePlan(JSON.stringify({ action: 'model-info' }), context, manifest, 'Descreva todas as tabelas e medidas disponíveis').modelInfo, true)
  assert.doesNotThrow(() => prepareSemanticQuery({ dax: 'EVALUATE TOPN(1, SUMMARIZECOLUMNS(Events[Job], "Value", [Total]), [Total], DESC) ORDER BY [Total] DESC',
    maxRows: 5, context, manifest }))
  assert.doesNotThrow(() => prepareSemanticQuery({ dax: 'EVALUATE SELECTCOLUMNS(SUMMARIZE(Events, Events[Job]), "Código", [Job]) ORDER BY [Código] ASC',
    maxRows: 20, context, manifest }))
  assert.equal(inspectCatalog(selectContext(manifest, 'total', false), manifest, ['Events']).columns.length, 43)
  const row = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`Column${i}`, `exact ${i} < & >`]))
  assert.deepEqual(trimResults([row], 1).rows[0], row)
  assert.doesNotThrow(() => prepareSemanticQuery({ dax: 'EVALUATE ROW("First", MIN(Events[Date]))', maxRows: 1, context, manifest }))
})

test('a new analytical question explores real rows and then executes the published rule without a whitelist', async () => {
  const originalFetch = globalThis.fetch
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://semantic-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'semantic-test-secret-long-enough',
    OPENCODE_API_KEY: 'test-key', POWERBI_TENANT: 'test-tenant', POWERBI_CLIENT_ID: 'test-client', POWERBI_CLIENT_SECRET: 'test-secret' }
  const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]])); Object.assign(process.env, env)
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  let calls = 0, reads = 0, savedAnswer = '', refreshVersion = 'v1', changeDuring = false, rawMode = false, reviews = 0
  let sourceReviews = 0
  let modelChanged = false, changeModelDuring = false
  let metadataMode = false, explanations = 0
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('gs_ia_provider_config')) return json([])
      if (url.includes('login.microsoftonline.com')) return json({ access_token: 'test-access-token', expires_in: 3600 })
      if (url.includes('/getDefinition')) return json({ definition: { parts: [modelChanged ? { ...part,
        payload: Buffer.from(Buffer.from(part.payload, 'base64').toString('utf8') + '\n// Republished during analysis').toString('base64') } : part] } })
      if (url.includes('/refreshes?')) return json({ value: [{ requestId: refreshVersion, status: 'Completed', startTime: '2026-10-13T00:00:00Z' }] })
      if (url.endsWith('/models')) return json({ data: [{ id: 'deepseek-v4.1-flash', max_output_tokens: 393216 }] })
      if (url.endsWith('/chat/completions')) {
        const body = JSON.parse(String(init?.body))
        assert.equal(body.reasoning_effort, 'max')
        if (body.messages[0].content.startsWith('Explique em português')) {
          explanations++
          return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({
            answer: 'Este indicador é expresso em reais (R$), não em quantidade. Ele acompanha o valor apurado no relatório.' }) } }] })
        }
        if (body.messages[0].content.startsWith('Revise o plano')) {
          const reviewInput = JSON.parse(body.messages[1].content)
          if (!rawMode) {
            sourceReviews++
            assert(reviewInput.publishedRules.some((source: { measure: string }) => source.measure === 'Visual'))
            assert.equal(reviewInput.context, undefined)
            return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '{"approved":true}' } }] })
          }
          reviews++
          assert(reviewInput.plan.queries[0].dax.includes('SUM(Events[Amount])'))
          assert(reviewInput.publishedRules.some((source: { measure: string }) => source.measure === 'Visual'))
          return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ approved: false,
            issues: [{ queryIndex: 0, reason: 'A soma bruta não aplica os filtros e arredondamentos do visual.' }],
            queries: [{ purpose: 'Valor com os filtros e arredondamentos publicados', sourceMeasure: 'Visual',
              dax: 'EVALUATE TOPN(1, _records, [Value], DESC)', maxRows: 1 }], assumptions: [] }) } }] })
        }
        const prompt = JSON.parse(body.messages[2].content)
        assert(body.messages[0].content.includes('Não depende de lista de perguntas'))
        calls++
        const content = metadataMode ? { action: 'model-info' } : rawMode ? { answerable: true, queries: [{ purpose: 'Valor sem regra publicada', dax: 'EVALUATE ROW("Total", SUM(Events[Amount]))', maxRows: 1 }] }
          : calls % 2 === 1 ? { action: 'explore', queries: [{ purpose: 'Descobrir categorias', dax: 'EVALUATE VALUES(Events[Job])', maxRows: 20 }] }
          : { answerable: true, queries: [{ purpose: 'Maior job pelo valor da regra publicada', sourceMeasure: 'Visual',
            dax: 'EVALUATE TOPN(1, _records, [Value], DESC) ORDER BY [Value] DESC', maxRows: 5 }], assumptions: ['Período: outubro de 2026.'] }
        if (!metadataMode && !rawMode && calls % 2 === 0) assert.equal(prompt.exploration[0].rows[0]['Events[Job]'], '12345-FTX')
        return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }], usage: { total_tokens: 10 } })
      }
      if (url.endsWith('/executeQueries')) {
        if (changeModelDuring) modelChanged = true
        reads++
        const dax = JSON.parse(String(init?.body)).queries[0].query as string
        if (changeDuring) refreshVersion = 'v2'
        if (dax.startsWith('DEFINE')) {
          assert(dax.includes('VAR _records = SELECTCOLUMNS') && !dax.includes('_layout'))
          return json({ results: [{ tables: [{ rows: [{ '[Job]': '12345-FTX', '[Value]': 1234.56 }] }] }] })
        }
        return json({ results: [{ tables: [{ rows: [{ 'Events[Job]': '12345-FTX' }] }] }] })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const work = (message = 'Qual maior job em outubro de 2026?') => withAiRequestCache(() => answerBiQuestion({ manifest, userId: '55555555-5555-4555-8555-555555555555', isAdmin: false,
      dashboard: { id: '44444444-4444-4444-8444-444444444444', name: 'Novo projeto', department: 'Diretoria', allowed_departments: [], assigned_user_id: null, sub_group: null },
      conversationId: null, message, audit: {
        configuration: { provedorId: 'opencode-go', modelo: 'deepseek-v4.1-flash', enabled: true, reasoningEffort: 'max', fonte: 'banco' },
        takeRateLimit: async () => {}, resolveConversation: async () => '66666666-6666-4666-8666-666666666666', previousTurns: async () => [],
        recordTurn: async turn => { savedAnswer = turn.answer }, recordQueryLog: async () => {},
      } }))
    const result = await work()
    assert('answer' in result && result.answer?.includes('12345-FTX') && result.answer?.includes('1.234,56'))
    assert.equal(result.queries.length, 2)
    assert.equal(reads, 2)
    assert.equal(calls, 2)
    assert.equal(sourceReviews, 1)
    assert.equal(savedAnswer, result.answer)
    savedAnswer = ''; changeDuring = true
    await assert.rejects(work(), /atualização do modelo mudou/)
    assert.equal(savedAnswer, '')
    changeDuring = false; rawMode = true
    const reviewed = await work()
    assert('answer' in reviewed && reviewed.answer?.includes('1.234,56'))
    assert.equal(reviews, 1)
    assert.equal(reviewed.queries.length, 1)
    savedAnswer = ''; changeModelDuring = true
    await assert.rejects(work(), /definição do modelo ou relatório mudou/)
    assert.equal(savedAnswer, '')
    changeModelDuring = false; modelChanged = false; metadataMode = true
    const definition = await work('O que significa este indicador?')
    assert('answer' in definition && definition.answer?.startsWith('Este indicador é expresso em reais (R$)'))
    assert.equal(explanations, 1)
  } finally {
    globalThis.fetch = originalFetch
    for (const name of Object.keys(env)) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name] }
  }
})
