import assert from 'node:assert/strict'
import test from 'node:test'
import { withAiRequestCache } from '../src/lib/ai-request-cache'
import { answerBiQuestion } from '../src/lib/bi-ai/pipeline'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { parsePublishedSchema, type FabricPart } from '../src/lib/bi-ai/fabric-schema'
import { publishedSchema } from '../src/lib/bi-ai/fabric-context'

test('published evidence ignores invented output; new filters and changed reports use live analysis', async () => {
  const originalFetch = globalThis.fetch
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://evidence-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key-long-enough-for-clarification',
    OPENCODE_API_KEY: 'test-provider-key', POWERBI_TENANT: 'test-tenant', POWERBI_CLIENT_ID: 'test-client', POWERBI_CLIENT_SECRET: 'test-secret' }
  const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]))
  Object.assign(process.env, env)
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  const part = (path: string, body: string): FabricPart => ({ path, payloadType: 'InlineBase64', payload: Buffer.from(body).toString('base64') })
  const model = [part('definition/tables/Fato.tmdl', 'table Fato\n\tcolumn Valor\n\tmeasure Card = "<div>REALIZADO</div>"\n\tmeasure Card2 = "<div>REALIZADO</div>"')]
  const report = [part('definition/pages/home/page.json', JSON.stringify({ displayName: 'HOME' })),
    part('definition/pages/home/visuals/card/visual.json', JSON.stringify({ visual: { visualType: 'htmlContent', query: { queryState: {
      Values: { projections: [{ field: { Measure: { Expression: { SourceRef: { Entity: 'Fato' } }, Property: 'Card' } } }] },
    } } } })), part('definition/pages/home/visuals/card2/visual.json', JSON.stringify({ visual: { visualType: 'htmlContent', query: { queryState: {
      Values: { projections: [{ field: { Measure: { Expression: { SourceRef: { Entity: 'Fato' } }, Property: 'Card2' } } }] },
    } } } }))]
  const schema = parsePublishedSchema(model, report)
  const workspaceId = '11111111-1111-4111-8111-111111111111', semanticModelId = '22222222-2222-4222-8222-222222222222',
    reportId = '33333333-3333-4333-8333-333333333333'
  const manifest = parseManifest({ schemaVersion: '2.0', identity: { workspaceId, semanticModelId, reportId },
    capabilities: { liveDefinitionRequired: true }, model: { tables: [{ name: 'Fato', columns: [{ name: 'Valor' }] }],
      measures: [{ name: 'Card', table: 'Fato', presentationOnly: true }] },
    reportReferences: [{ version: 1, modelHash: schema.modelHash, reportHash: schema.reportHash, measure: 'Card', page: 'HOME',
      source: { kind: 'static-html' }, notes: [], metrics: [{ id: 'revenue', label: 'Receita realizada', aliases: ['receita'], format: 'currency',
        expression: { op: 'html-text', label: 'REALIZADO', slot: 'currency' } }] }] })
  let definitions = 0, reads = 0, calls = 0, changed = false, turns = 0, logs = 0, refreshVersion = 'v1', refreshDuringQuery = false, memoryFailure = false, toolMode = false
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('gs_ia_provider_config')) return json([])
      if (url.includes('login.microsoftonline.com')) return json({ access_token: 'test-access-token', expires_in: 3600 })
      if (url.includes('/refreshes?')) return json({ value: [{ requestId: refreshVersion, status: 'Completed', startTime: '2026-10-13T00:00:00Z' }] })
      if (url.includes('/getDefinition')) {
        definitions++
        const parts = url.includes('/reports/') ? changed ? [...report, part('definition/report.json', '{"changed":true}')] : report : model
        return json({ definition: { parts } })
      }
      if (url.endsWith('/models')) return json({ data: [{ id: 'deepseek-v4.1-flash', max_output_tokens: 393216 }] })
      if (url.endsWith('/chat/completions')) {
        calls++
        const body = JSON.parse(String(init?.body))
        assert.equal(body.reasoning_effort, 'max')
        assert.equal(body.max_tokens, 393216)
        if (body.messages[0].content.startsWith('Planeje DAX')) return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant',
          content: JSON.stringify(toolMode ? { action: 'report-facts', mode: 'answer', requests: [
            { measure: 'Card', metricIds: ['revenue'], scope: { months: ['2026-10'], region: null } },
            { measure: 'Card2', metricIds: ['expense'], scope: { months: ['2026-10'], region: null } },
          ] } : { answerable: true, queries: [{ purpose: 'Consulta nova ao modelo', dax: 'EVALUATE ROW("Receita", COUNTROWS(\'Fato\'))', maxRows: 1 }] }) } }] })
        return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({
          factIds: ['invented'], comparisons: [{ left: 'f0', right: 'invented' }], answer: 'Receita: R$ 999.999,99',
        }) } }], usage: { total_tokens: 10 } })
      }
      if (url.endsWith('/executeQueries')) {
        reads++
        if (refreshDuringQuery) refreshVersion = 'v2'
        const query = JSON.parse(String(init?.body)).queries[0].query as string
        if (!query.includes('ReportReference')) return json({ results: [{ tables: [{ rows: [{ '[Receita]': 123.45 }] }] }] })
        if (memoryFailure && query.includes('"ReportReference1",') && query.includes('"ReportReference",')) {
          memoryFailure = false
          return new Response(JSON.stringify({ error: { code: 'Resource Governance', message: 'memory limit' } }), { status: 400 })
        }
        const aliases = [...query.matchAll(/"(ReportReference\d*)",/g)].map(match => match[1])
        const row = Object.fromEntries(aliases.map(alias => [`[${alias}]`, `<div>REALIZADO R$ ${query.includes('[Card2]') ? '42,00' : reads === 1 ? '123,45' : '321,00'}</div>`]))
        return json({ results: [{ tables: [{ rows: [row] }] }] })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    const work = (message = 'Qual receita realizada em outubro de 2026?') => withAiRequestCache(async () => {
      await Promise.all([publishedSchema(workspaceId, semanticModelId, reportId, true), publishedSchema(workspaceId, semanticModelId, reportId, true)])
      return answerBiQuestion({ manifest, dashboard: { id: '44444444-4444-4444-8444-444444444444', name: 'BI de teste', department: 'Diretoria',
        allowed_departments: [], assigned_user_id: null, sub_group: null }, userId: '55555555-5555-4555-8555-555555555555',
        isAdmin: false, conversationId: null, message, audit: { configuration: { provedorId: 'opencode-go', modelo: 'deepseek-v4.1-flash',
          enabled: true, reasoningEffort: 'max', fonte: 'banco' }, takeRateLimit: async () => {}, resolveConversation: async () => '66666666-6666-4666-8666-666666666666',
          previousTurns: async () => [], recordTurn: async () => { turns++ }, recordQueryLog: async () => { logs++ } } })
    })
    const first = await work()
    assert('answer' in first && typeof first.answer === 'string' && first.answer.includes('123,45') && !first.answer.includes('999.999'))
    assert.equal(definitions, 2)
    const second = await work()
    assert('answer' in second && typeof second.answer === 'string' && second.answer.includes('321,00'))
    assert.equal(definitions, 4)
    const unknown = await work('Qual receita realizada em 2026 para o cliente ACME?')
    assert('answer' in unknown && unknown.answer?.includes('123,45'))
    assert.equal(reads, 3)
    // Exact single KPI facts do not need model selection/comparison; only the new custom filter does.
    assert.equal(calls, 1)
    refreshDuringQuery = true
    await assert.rejects(work(), /atualização do modelo mudou/)
    refreshDuringQuery = false
    changed = true
    const changedResult = await work()
    assert('answer' in changedResult && changedResult.answer?.includes('123,45'))
    assert.equal(reads, 5)
    assert.equal(turns, 4)
    assert.equal(logs, 5)
    changed = false
    memoryFailure = true
    const firstReference = (manifest.raw.reportReferences as Record<string, unknown>[])[0]
    const multi = { ...manifest, raw: { ...manifest.raw, reportReferences: [firstReference, { ...firstReference, measure: 'Card2',
      metrics: [{ id: 'expense', label: 'Despesa realizada', aliases: ['despesa'], format: 'currency', expression: { op: 'html-text', label: 'REALIZADO', slot: 'currency' } }] }] } }
    const multiResult = await withAiRequestCache(() => answerBiQuestion({
      manifest: multi, dashboard: { id: '44444444-4444-4444-8444-444444444444', name: 'BI de teste', department: 'Diretoria',
        allowed_departments: [], assigned_user_id: null, sub_group: null }, userId: '55555555-5555-4555-8555-555555555555',
      isAdmin: false, conversationId: null, message: 'Qual receita realizada e despesa realizada em outubro de 2026?',
      audit: { configuration: { provedorId: 'opencode-go', modelo: 'deepseek-v4.1-flash', enabled: true, reasoningEffort: 'max', fonte: 'banco' },
        takeRateLimit: async () => {}, resolveConversation: async () => '66666666-6666-4666-8666-666666666666', previousTurns: async () => [],
        recordTurn: async () => {}, recordQueryLog: async () => {} },
    }))
    assert('evidence' in multiResult && multiResult.evidence)
    assert.deepEqual(multiResult.evidence.values.map(fact => fact.value), [321, 42])
    assert.equal(multiResult.queries.length, 2)
    assert.equal(reads, 8)
    toolMode = true
    const selectedByModel = await withAiRequestCache(() => answerBiQuestion({ manifest: multi,
      dashboard: { id: '44444444-4444-4444-8444-444444444444', name: 'BI de teste', department: 'Diretoria', allowed_departments: [], assigned_user_id: null, sub_group: null },
      userId: '55555555-5555-4555-8555-555555555555', isAdmin: false, conversationId: null, message: 'Mostre duas leituras inéditas da tela em outubro de 2026',
      audit: { configuration: { provedorId: 'opencode-go', modelo: 'deepseek-v4.1-flash', enabled: true, reasoningEffort: 'max', fonte: 'banco' },
        takeRateLimit: async () => {}, resolveConversation: async () => '66666666-6666-4666-8666-666666666666', previousTurns: async () => [],
        recordTurn: async () => {}, recordQueryLog: async () => {} } }))
    assert('evidence' in selectedByModel && selectedByModel.evidence)
    assert.deepEqual(selectedByModel.evidence.values.map(fact => fact.value), [321, 42])
    assert('answer' in selectedByModel && selectedByModel.answer?.includes('### 📂 Card'))
    assert.equal(reads, 10)
  } finally {
    globalThis.fetch = originalFetch
    for (const name of Object.keys(env)) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
})
