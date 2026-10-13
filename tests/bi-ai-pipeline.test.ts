import assert from 'node:assert/strict'
import test from 'node:test'
import { withAiRequestCache } from '../src/lib/ai-request-cache'
import { answerBiQuestion } from '../src/lib/bi-ai/pipeline'
import { parseManifest } from '../src/lib/bi-ai/manifest'

test('parallel BI pipeline preserves verification, auditing and failure handling', async () => {
  const originalFetch = globalThis.fetch
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://pipeline-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    OPENCODE_API_KEY: 'test-provider-key', POWERBI_TENANT: 'test-tenant', POWERBI_CLIENT_ID: 'test-client', POWERBI_CLIENT_SECRET: 'test-secret' }
  const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]))
  Object.assign(process.env, env)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  try {
    for (const failure of [false, true]) {
      let active = 0, peak = 0, queries = 0, savedTurns = 0, providerReads = 0
      const audit: string[] = []
      const modelId = failure ? '33333333-3333-4333-8333-333333333333' : '22222222-2222-4222-8222-222222222222'
      const manifest = parseManifest({ schemaVersion: '2.0', identity: {
        workspaceId: '11111111-1111-4111-8111-111111111111', semanticModelId: modelId,
      }, capabilities: { liveDefinitionRequired: true }, business: {}, report: {}, model: {
        tables: [{ name: 'Fato', columns: [{ name: 'Valor', dataType: 'decimal' }] }],
        measures: [{ name: 'Receita', table: 'Fato', description: 'Soma oficial.' }],
      } })
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url.includes('gs_config_ia')) return json([{ provedor_id: 'opencode-go', modelo: 'deepseek-v4.1-flash', enabled: true, reasoning_effort: 'max' }])
        if (url.includes('gs_ia_provider_config')) { providerReads++; return json([]) }
        if (url.includes('/rpc/gs_bi_take_rate_limit')) return json(true)
        if (url.includes('gs_bi_conversations')) return json(init?.method === 'POST'
          ? { id: '44444444-4444-4444-8444-444444444444' } : null)
        if (url.includes('gs_chat_log')) {
          if (init?.method === 'POST') { savedTurns++; return json(null) }
          return json([])
        }
        if (url.includes('gs_bi_query_logs')) {
          audit.push(JSON.parse(String(init?.body)).status)
          return json(null)
        }
        if (url.includes('login.microsoftonline.com')) return json({ access_token: 'test-access-token', expires_in: 3600 })
        if (url.includes('/getDefinition')) return json({ definition: { parts: [{
          path: 'definition/tables/Fato.tmdl', payloadType: 'InlineBase64',
          payload: Buffer.from('table Fato\n\tcolumn Valor\n\tmeasure Receita = SUM(Fato[Valor])').toString('base64'),
        }] } })
        if (url.endsWith('/models')) return json({ data: [{ id: 'deepseek-v4.1-flash', max_output_tokens: 393216 }] })
        if (url.endsWith('/chat/completions')) {
          const body = JSON.parse(String(init?.body))
          assert.equal(body.reasoning_effort, 'max')
          assert.equal(body.max_tokens, 393216)
          const planner = body.messages[0].content.startsWith('Planeje DAX')
          if (planner) {
            assert.equal(body.messages.length, 3)
            assert(JSON.parse(body.messages[1].content).context.measures.some((m: { name: string }) => m.name === 'Receita'))
          }
          const content = planner ? { answerable: true, queries: Array.from({ length: 3 }, (_, i) =>
            ({ purpose: `Consulta ${i}`, dax: `EVALUATE ROW("Receita${i}", [Receita])`, maxRows: 1 })), objectsUsed: [], assumptions: [] }
            : { answer: 'Receita conferida no Power BI: 123.' }
          return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }], usage: { total_tokens: 10 } })
        }
        if (url.endsWith('/executeQueries')) {
          const i = queries++
          active++; peak = Math.max(peak, active)
          await new Promise(resolve => setTimeout(resolve, 25 + i * 5))
          active--
          return failure && i === 1 ? json({ error: { code: 'SourceUnavailable' } }, 503)
            : json({ results: [{ tables: [{ rows: [{ [`[Receita${i}]`]: 123 }] }] }] })
        }
        throw new Error(`Unexpected request: ${url}`)
      }
      const work = () => withAiRequestCache(() => answerBiQuestion({ manifest,
        dashboard: { id: '55555555-5555-4555-8555-555555555555', name: 'BI de teste', department: 'Diretoria',
          allowed_departments: [], assigned_user_id: null, sub_group: null },
        userId: '66666666-6666-4666-8666-666666666666', isAdmin: false, conversationId: null,
        message: 'Consulte a receita na tabela Fato em 2026, com as três consultas de conferência.' }))
      if (failure) await assert.rejects(work(), error => error instanceof Error && 'status' in error && error.status === 502)
      else {
        const answer = await work()
        assert('answer' in answer)
        assert.equal(answer.answer, 'Resultados do Power BI:\n\nConsulta 0:\nReceita0: 123\n\nConsulta 1:\nReceita1: 123\n\nConsulta 2:\nReceita2: 123')
        assert.deepEqual(answer.queries.map(query => query.purpose), ['Consulta 0', 'Consulta 1', 'Consulta 2'])
      }
      assert.equal(queries, 3)
      assert.equal(peak, 3)
      assert.equal(active, 0)
      assert.equal(providerReads, 1)
      assert.equal(audit.length, 3)
      assert.equal(savedTurns, failure ? 0 : 1)
      assert.equal(audit.filter(status => status === 'error').length, failure ? 1 : 0)
    }
  } finally {
    globalThis.fetch = originalFetch
    for (const name of Object.keys(env)) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
})
