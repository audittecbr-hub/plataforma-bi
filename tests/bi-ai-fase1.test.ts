import assert from 'node:assert/strict'
import test from 'node:test'
import { withAiRequestCache } from '../src/lib/ai-request-cache'
import { answerBiQuestion } from '../src/lib/bi-ai/pipeline'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { executeDaxQuery } from '../src/lib/powerbi'
import { parsePublishedSchema } from '../src/lib/bi-ai/fabric-schema'

const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://fase1-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key-long-enough-for-phase-one',
  BI_AI_CACHE_NAMESPACE: 'teste', OPENCODE_API_KEY: 'test-provider-key', POWERBI_TENANT: 'test-tenant', POWERBI_CLIENT_ID: 'test-client',
  POWERBI_CLIENT_SECRET: 'test-secret' }
const workspaceId = '11111111-1111-4111-8111-111111111111', semanticModelId = '22222222-2222-4222-8222-222222222222'
const dashboard = { id: '55555555-5555-4555-8555-555555555555', name: 'BI de teste', department: 'Diretoria',
  allowed_departments: [], assigned_user_id: null, sub_group: null }
const userId = '66666666-6666-4666-8666-666666666666'
const conversationId = '44444444-4444-4444-8444-444444444444'
const manifest = parseManifest({ schemaVersion: '2.0', identity: { workspaceId, semanticModelId },
  capabilities: { liveDefinitionRequired: true }, business: {}, report: {}, model: {
    tables: [{ name: 'Fato', columns: [{ name: 'Valor', dataType: 'decimal' }] }],
    measures: [{ name: 'Receita', table: 'Fato', description: 'Soma oficial.' }],
  } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Supabase, Entra, Power BI, Fabric and the AI provider, with an in-memory Storage bucket. */
function fakeServices() {
  const state = { logins: 0, refreshId: 'r1', ai: [] as { stage: string; maxTokens: number; effort: string }[], daxReads: 0,
    truncateNextPlan: false, explore: false, turns: [] as Record<string, unknown>[], objects: new Map<string, Buffer>(),
    silentProviderCalls: 0, providerAttempts: 0 }
  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    if (url.includes('login.microsoftonline.com')) { state.logins++; await new Promise(r => setTimeout(r, 20)); return json({ access_token: 'token', expires_in: 3600 }) }
    if (url.includes('gs_config_ia')) return json([{ provedor_id: 'opencode-go', modelo: 'deepseek-v4.1-flash', enabled: true, reasoning_effort: 'high' }])
    if (url.includes('gs_ia_provider_config')) return json([])
    if (url.includes('/rpc/gs_bi_take_rate_limit')) return json(true)
    if (url.includes('gs_bi_conversations')) return json(init?.method === 'POST' ? { id: conversationId }
      : init?.method === 'PATCH' ? null : { id: conversationId, user_id: userId, dashboard_id: dashboard.id })
    if (url.includes('gs_chat_log')) {
      if (init?.method === 'POST') { state.turns.push(JSON.parse(String(init.body))); return json(null) }
      return json([])
    }
    if (url.includes('gs_bi_query_logs')) return json(null)
    if (url.includes('/storage/v1/bucket/')) return json({ id: 'bi-ai-cache', name: 'bi-ai-cache', public: false })
    if (url.includes('/storage/v1/object/')) {
      const key = decodeURIComponent(new URL(url).pathname.split('/storage/v1/object/')[1])
      if (init?.method === 'POST' || init?.method === 'PUT') {
        state.objects.set(key, Buffer.from(init.body as Uint8Array))
        return json({ Key: key })
      }
      const stored = state.objects.get(key)
      return stored ? new Response(new Uint8Array(stored)) : json({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400)
    }
    if (url.includes('/refreshes?')) return json({ value: [{ requestId: state.refreshId, status: 'Completed',
      startTime: '2026-10-13T12:00:00Z', endTime: '2026-10-13T12:05:00Z' }] })
    if (url.includes('/getDefinition')) return json({ definition: { parts: [{ path: 'definition/tables/Fato.tmdl', payloadType: 'InlineBase64',
      payload: Buffer.from('table Fato\n\tcolumn Valor\n\tmeasure Receita = SUM(Fato[Valor])').toString('base64') }] } })
    if (url.endsWith('/models')) return json({ data: [{ id: 'deepseek-v4.1-flash', max_output_tokens: 393216 }] })
    if (url.endsWith('/chat/completions')) {
      state.providerAttempts++
      if (state.silentProviderCalls > 0) {
        // The provider accepts the connection but never starts answering.
        state.silentProviderCalls--
        return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }))
      }
      const body = JSON.parse(String(init?.body))
      const planner = body.messages[0].content.startsWith('Planeje DAX')
      state.ai.push({ stage: planner ? 'planejamento' : 'explicacao', maxTokens: body.max_tokens, effort: body.reasoning_effort })
      if (planner && state.truncateNextPlan) {
        state.truncateNextPlan = false
        return json({ choices: [{ finish_reason: 'length', message: { role: 'assistant', content: '' } }], usage: { total_tokens: 32000 } })
      }
      const explored = JSON.parse(body.messages[2]?.content ?? '{}').exploration?.length > 0
      const content = !planner ? { answer: 'Receita conferida no Power BI: 123.' }
        : state.explore && !explored ? { action: 'explore', queries: [{ purpose: 'Conferir o total', dax: 'EVALUATE ROW("Receita", [Receita])', maxRows: 1 }] }
          : { answerable: true, queries: [{ purpose: 'Receita total', dax: 'EVALUATE ROW("Receita", [Receita])', maxRows: 1 }], assumptions: [] }
      return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }], usage: { total_tokens: 10 } })
    }
    if (url.endsWith('/executeQueries')) { state.daxReads++; return json({ results: [{ tables: [{ rows: [{ '[Receita]': 123 }] }] }] }) }
    throw new Error(`Unexpected request: ${url}`)
  }
  return { state, fetcher }
}

async function withFakes(work: (fakes: ReturnType<typeof fakeServices>) => Promise<void>) {
  const originalFetch = globalThis.fetch
  const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]))
  Object.assign(process.env, env)
  const fakes = fakeServices()
  globalThis.fetch = fakes.fetcher as typeof fetch
  try { await work(fakes) } finally {
    globalThis.fetch = originalFetch
    for (const name of Object.keys(env)) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name] }
  }
}

const ask = (message: string, extra: Partial<Parameters<typeof answerBiQuestion>[0]> = {}) =>
  withAiRequestCache(() => answerBiQuestion({ manifest, dashboard, userId, isAdmin: false, conversationId: null, message, ...extra }))

async function until(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise(r => setTimeout(r, 10))
  assert(condition(), 'a gravação em segundo plano não terminou')
}

test('leituras paralelas pedem um único token da Microsoft', async () => {
  await withFakes(async ({ state }) => {
    await Promise.all(Array.from({ length: 4 }, () => executeDaxQuery({ workspaceId, semanticModelId, dax: 'EVALUATE ROW("x", 1)' })))
    assert.equal(state.logins, 1)
  })
})

test('a mesma pergunta na mesma atualização reaproveita a resposta conferida, e uma nova atualização não', async () => {
  await withFakes(async ({ state }) => {
    const first = await ask('Qual a receita total em 2026?')
    assert('answer' in first && first.answer?.includes('123'))
    // Data answers are rendered from the rows by the server: one planning step, under a ceiling.
    assert.deepEqual(state.ai.map(call => [call.stage, call.maxTokens, call.effort]), [['planejamento', 32000, 'high']])
    const telemetry = state.turns[0].conferencia as { etapas: { etapa: string }[]; totalMs: number; daxConsultas: number }
    assert.deepEqual(telemetry.etapas.map(stage => stage.etapa), ['planejamento'])
    assert(telemetry.totalMs >= 0)
    assert.equal(telemetry.daxConsultas, 1)
    assert.equal(state.turns[0].cacheado, false)
    await until(() => [...state.objects.keys()].some(key => key.includes('/answers/')))

    const repeated = await ask('qual a receita total em 2026')
    assert('cached' in repeated && repeated.cached === true)
    assert.equal('answer' in repeated && repeated.answer, first.answer)
    assert.equal(state.ai.length, 1)
    assert.equal(state.daxReads, 1)
    assert.equal(state.turns[1].cacheado, true)

    // Follow-ups depend on history and are never served from the cache.
    await ask('Qual a receita total em 2026?', { conversationId })
    assert.equal(state.ai.length, 2)

    state.refreshId = 'r2'
    const refreshed = await ask('Qual a receita total em 2026?')
    assert(!('cached' in refreshed))
    assert.equal(state.ai.length, 3)
  })
})

test('uma etapa que atinge o teto é refeita sem teto, sem truncar a análise', async () => {
  await withFakes(async ({ state }) => {
    state.truncateNextPlan = true
    const result = await ask('Qual a receita total de 2026 por completo?')
    assert('answer' in result && result.answer?.includes('123'))
    assert.deepEqual(state.ai.map(call => call.maxTokens), [32000, 393216])
    const telemetry = state.turns[0].conferencia as { etapas: { etapa: string }[] }
    assert.deepEqual(telemetry.etapas.map(stage => stage.etapa), ['planejamento', 'planejamento-sem-teto'])
  })
})

test('a investigação continua no mesmo pedido até o limite de tempo, em vez de voltar ao navegador a cada etapa', async () => {
  await withFakes(async ({ state }) => {
    state.explore = true
    const yielded = await ask('Investigue a receita total de 2026.', { yieldAnalysis: true, yieldAfterMs: 0 })
    assert('continuationToken' in yielded && typeof yielded.continuationToken === 'string')
    const complete = await ask('Investigue a receita total de 2026 com calma.', { yieldAnalysis: true, yieldAfterMs: 60_000 })
    assert(!('continuationToken' in complete))
    assert('answer' in complete && complete.answer?.includes('123'))
  })
})

test('republicar só a fonte de dados mantém o hash semântico; mudar uma medida não', () => {
  const tabela = (fonte: string, medida: string) => [{ path: 'definition/tables/Fato.tmdl', payloadType: 'InlineBase64',
    payload: Buffer.from(['table Fato', '\tmeasure Receita = ' + medida, '', '\tcolumn Valor', '\t\tdataType: double', '',
      '\tpartition Fato = m', '\t\tmode: import', '\t\tsource =', '\t\t\t\tlet', `\t\t\t\t    Fonte = Sql.Database("${fonte}", "base")`,
      '\t\t\t\tin', '\t\t\t\t    Fonte', '', '\tannotation PBI_ResultType = Table', ''].join('\n')).toString('base64') }]
  const original = parsePublishedSchema(tabela('servidor-antigo', 'SUM(Fato[Valor])'))
  const novaFonte = parsePublishedSchema(tabela('servidor-novo', 'SUM(Fato[Valor])'))
  const novaRegra = parsePublishedSchema(tabela('servidor-antigo', 'SUMX(Fato, ROUND(Fato[Valor], 2))'))
  assert.notEqual(original.modelHash, novaFonte.modelHash)
  assert.equal(original.semanticHash, novaFonte.semanticHash)
  assert.notEqual(original.semanticHash, novaRegra.semanticHash)
})

test('um provedor que não começa a responder é chamado de novo em vez de travar a pergunta', async () => {
  await withFakes(async ({ state }) => {
    process.env.BI_AI_FIRST_BYTE_MS = '50'
    try {
      state.silentProviderCalls = 1
      const result = await ask('Qual a receita total do ano de 2026 inteiro?')
      assert('answer' in result && result.answer?.includes('123'))
      assert.equal(state.providerAttempts, 2)
    } finally { delete process.env.BI_AI_FIRST_BYTE_MS }
  })
})
