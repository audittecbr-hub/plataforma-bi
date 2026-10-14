import assert from 'node:assert/strict'
import test from 'node:test'
import { boundedReadQuery } from '../src/lib/bi-ai/semantic-query'
import { reportQuestionShape } from '../src/lib/bi-ai/report-reference'
import { normalizeTerm } from '../src/lib/bi-ai/context'
import { plannerEffort } from '../src/lib/bi-ai/stages'
import { executeDaxQuery, PowerBiQueryError, powerBiUserMessage } from '../src/lib/powerbi'
import type { ConfigIa } from '../src/lib/llm-config'

test('um ranking renomeado por SELECTCOLUMNS mantém a ordem do TOPN', () => {
  const query = boundedReadQuery(`EVALUATE SELECTCOLUMNS(TOPN(5, SUMMARIZECOLUMNS('IA Job'[Job], "Valor", [Total Aprovado]), [Valor], DESC),
    "Job", 'IA Job'[Job], "Total aprovado", [Valor])`, 100)
  assert(query.endsWith('ORDER BY [Total aprovado] DESC'), query)
  // Sem direção explícita, o TOPN já ordena do maior para o menor.
  assert(boundedReadQuery(`EVALUATE TOPN(3, SUMMARIZECOLUMNS('IA Produto'[Produto], "Valor", [Total Aprovado]), [Valor])`, 100)
    .endsWith('ORDER BY [Valor] DESC'))
  assert(boundedReadQuery(`EVALUATE TOPN(3, SUMMARIZECOLUMNS('IA Produto'[Produto], "Valor", [Total Aprovado]), [Valor], ASC)`, 100)
    .endsWith('ORDER BY [Valor] ASC'))
  // Ordem escrita pelo planejador prevalece; projeção sem a coluna de ordenação não ganha ORDER BY inventado.
  assert(boundedReadQuery(`EVALUATE SELECTCOLUMNS(TOPN(2, VALUES('IA Job'[Job]), 'IA Job'[Job], ASC), "Job", 'IA Job'[Job]) ORDER BY [Job] DESC`, 100)
    .endsWith('ORDER BY [Job] DESC'))
  assert(!/ORDER BY/.test(boundedReadQuery(`EVALUATE SELECTCOLUMNS(TOPN(2, VALUES('IA Job'[Job]), [Total Aprovado], DESC), "Job", 'IA Job'[Job])`, 100)))
})

test('comparações e séries pedem um valor por mês no caminho dos visuais', () => {
  const shape = (pergunta: string) => reportQuestionShape(normalizeTerm(pergunta))
  assert.deepEqual(shape('Os honorários encontrados cresceram de agosto para setembro de 2026?'), { monthly: false, compare: true })
  assert.deepEqual(shape('Como evoluiu o estoque em negociação no fim de cada mês, de junho a setembro?'), { monthly: true, compare: false })
  assert.equal(shape('aprovado de agosto x setembro').compare, true)
  assert.equal(shape('o aprovado caiu em setembro?').compare, true)
  assert.deepEqual(shape('Qual o total aprovado em setembro de 2026?'), { monthly: false, compare: false })
  assert.equal(shape('qual o saldo em caixa de setembro?').compare, false)
})

test('limite de consultas do Power BI (429): espera o tempo pedido e tenta de novo; persistindo, avisa sem culpar o administrador', async () => {
  const env = { POWERBI_TENANT: 'test-tenant', POWERBI_CLIENT_ID: 'test-client', POWERBI_CLIENT_SECRET: 'test-secret' }
  const salvo = Object.fromEntries(Object.keys(env).map(nome => [nome, process.env[nome]]))
  const fetchOriginal = globalThis.fetch
  Object.assign(process.env, env)
  let limitadas = 0, chamadas = 0
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('login.microsoftonline.com')) return Response.json({ access_token: 'token', expires_in: 3600 })
    chamadas++
    if (limitadas > 0) { limitadas--; return new Response('{"message":"Retry in 1 seconds."}', { status: 429, headers: { 'Retry-After': '1' } }) }
    return Response.json({ results: [{ tables: [{ rows: [{ '[x]': 1 }] }] }] })
  }) as typeof fetch
  try {
    const consulta = { workspaceId: '11111111-1111-4111-8111-111111111111', semanticModelId: '22222222-2222-4222-8222-222222222222', dax: 'EVALUATE ROW("x", 1)' }
    limitadas = 1
    assert.deepEqual(await executeDaxQuery(consulta), [{ '[x]': 1 }])
    assert.equal(chamadas, 2)
    limitadas = 3
    const erro = await executeDaxQuery(consulta).catch(e => e)
    assert(erro instanceof PowerBiQueryError && erro.code === 'RATE_LIMITED')
    assert.match(powerBiUserMessage(erro), /muitas consultas/)
  } finally {
    globalThis.fetch = fetchOriginal
    for (const nome of Object.keys(env)) { if (salvo[nome] === undefined) delete process.env[nome]; else process.env[nome] = salvo[nome] }
  }
})

test('o esforço do planejador só muda com a tabela IA e no DeepSeek com raciocínio', () => {
  const deepseek = { provedorId: 'opencode-go', modelo: 'deepseek-v4.1-flash', reasoningEffort: 'high' } as ConfigIa
  const antes = process.env.BI_AI_CERTIFIED_PLANNER_EFFORT
  try {
    delete process.env.BI_AI_CERTIFIED_PLANNER_EFFORT
    assert.equal(plannerEffort(deepseek, true), 'low')
    assert.equal(plannerEffort(deepseek, false), 'high')
    assert.equal(plannerEffort({ ...deepseek, provedorId: 'anthropic', modelo: 'claude-sonnet-5-5' } as ConfigIa, true), 'high')
    process.env.BI_AI_CERTIFIED_PLANNER_EFFORT = 'high'
    assert.equal(plannerEffort(deepseek, true), 'high')
  } finally {
    if (antes === undefined) delete process.env.BI_AI_CERTIFIED_PLANNER_EFFORT
    else process.env.BI_AI_CERTIFIED_PLANNER_EFFORT = antes
  }
})
