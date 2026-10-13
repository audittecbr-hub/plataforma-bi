import assert from 'node:assert/strict'
import test from 'node:test'
import { conversar } from '../src/lib/llm'
import { lerConfigIa, salvarConfigIa } from '../src/lib/llm-config'
import { withAiRequestCache } from '../src/lib/ai-request-cache'

test('portal requests DeepSeek max reasoning and full output despite legacy token settings', async () => {
  const originalFetch = globalThis.fetch
  const names = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENCODE_API_KEY', 'BI_AI_ENCRYPTION_KEY'] as const
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://portal-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  process.env.OPENCODE_API_KEY = 'test-provider-key'
  delete process.env.BI_AI_ENCRYPTION_KEY
  let request: Record<string, unknown> | undefined
  let settings: Record<string, unknown> | undefined
  let providerReads = 0
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('portal-test.supabase.co/rest/v1/gs_ia_provider_config')) { providerReads++; return json([]) }
    if (url.includes('portal-test.supabase.co/rest/v1/gs_config_ia')) {
      if (init?.method === 'POST') { settings = JSON.parse(String(init.body)); return json([]) }
      return json([{ provedor_id: 'opencode-go', modelo: 'deepseek-v4.1-flash', enabled: true,
        reasoning_effort: 'max', planner_max_tokens: 3000, answer_max_tokens: 1600 }])
    }
    if (url.endsWith('/models')) return json({ data: [{ id: 'deepseek-v4.1-flash', max_output_tokens: 393216 }] })
    if (url.endsWith('/chat/completions')) {
      request = JSON.parse(String(init?.body))
      return json({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }], usage: { total_tokens: 10 } })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  try {
    await withAiRequestCache(async () => {
    const config = await lerConfigIa()
    assert.equal(config.modelo, 'deepseek-v4.1-flash')
    assert.equal(config.reasoningEffort, 'max')
    assert(!('plannerMaxTokens' in config))
    assert(!('answerMaxTokens' in config))
    const reply = await conversar(config, [{ role: 'user', content: 'Teste' }],
      { maxTokens: 'maximum', reasoningEffort: config.reasoningEffort, temperatura: 0 })
    assert.equal(reply.texto, 'OK')
    assert.equal(request?.model, 'deepseek-v4.1-flash')
    assert.equal(request?.max_tokens, 393216)
    assert.equal(request?.reasoning_effort, 'max')
    assert.deepEqual(request?.thinking, { type: 'enabled' })
    assert(!('temperature' in request!))
    assert.deepEqual(await salvarConfigIa(config, 'test-admin-id'), { ok: true })
    assert(settings)
    assert(!('planner_max_tokens' in settings))
    assert(!('answer_max_tokens' in settings))
    assert.equal(providerReads, 1)
    })
  } finally {
    globalThis.fetch = originalFetch
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
})
