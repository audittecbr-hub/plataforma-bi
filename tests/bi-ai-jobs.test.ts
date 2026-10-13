import assert from 'node:assert/strict'
import test from 'node:test'
import { withAiRequestCache } from '../src/lib/ai-request-cache'
import { jobCodeIn, isGeneralJobLookup, resolveJobContext } from '../src/lib/bi-ai/entity-context'
import { loadJobDetails, jobTables, formatJobDetails } from '../src/lib/bi-ai/job-details'
import { parseManifest } from '../src/lib/bi-ai/manifest'
import { answerBiQuestion } from '../src/lib/bi-ai/pipeline'
import { clarificationKey, issueClarificationToken } from '../src/lib/bi-ai/clarification'

test('job context recognizes identifiers, follows the current entity and stops at a new topic', () => {
  for (const question of ['me fale mais sobre esse job 12345-ftx', 'Job: 12345-FTX', 'Detalhes do 12345-ftx', 'job de código 12345-ftx']) {
    assert.equal(jobCodeIn(question), '12345-FTX')
    assert.equal(isGeneralJobLookup(question), true)
  }
  assert.equal(jobCodeIn('job 12345'), '12345')
  assert.equal(jobCodeIn('job 12345-ftx e job 56789-tax'), null)
  assert.equal(isGeneralJobLookup('dados dos jobs 12345-ftx e 56789-tax'), false)
  assert.equal(jobCodeIn('total aprovado em outubro de 2026'), null)
  const history = [{ question: 'fale mais sobre o job 12345-ftx', answer: 'Dados' }]
  for (const question of ['quero tudo', 'e os honorários?', 'Honorários encontrados', 'mais detalhes']) {
    const resolved = resolveJobContext(question, history)
    assert.equal(resolved.jobCode, '12345-FTX')
    assert.equal(resolved.inherited, true)
    assert.equal(isGeneralJobLookup(resolved.question), true)
  }
  assert.equal(resolveJobContext('quero tudo', [...history, { question: 'total aprovado em outubro de 2026', answer: 'Total' }]).jobCode, null)
  assert.equal(resolveJobContext('fale mais sobre o job 56789-tax', history).jobCode, '56789-TAX')
  assert.equal(resolveJobContext('quero tudo', [], history[0].question).jobCode, '12345-FTX')
  for (const extra of ['em outubro de 2026', 'somente aprovados', 'para a regional Sul', 'com produto TAX', 'no último trimestre', 'compare as etapas', 'quanto foi aprovado']) {
    assert.equal(isGeneralJobLookup(`job 12345-ftx ${extra}`), false, extra)
  }
})

test('job values respect explicit Power BI number masks and time fields', () => {
  const answer = formatJobDetails('12345-FTX', [{ table: 'Cadastro Jobs', columns: ['JOB', 'Honorario', 'Taxa', 'Hora'],
    formats: { Honorario: 'R$ #,0.00', Taxa: '0.0%', Hora: 'Long Time' },
    rows: [{ JOB: '12345-FTX', Honorario: 1234.567, Taxa: 0.375, Hora: '1899-12-30T10:30:00' }], truncated: false, dax: '' }])
  assert(answer.includes('R$\u00a01.234,57'))
  assert(answer.includes('37,5%'))
  assert(answer.includes('10:30:00') && !answer.includes('1899'))
})

test('job dossiers read every eligible table, preserve source values and reject incomplete or changing data', async () => {
  const originalFetch = globalThis.fetch
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://job-test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-job-service-secret-long-enough',
    OPENCODE_API_KEY: 'test-provider-key', POWERBI_TENANT: 'test-tenant', POWERBI_CLIENT_ID: 'test-client', POWERBI_CLIENT_SECRET: 'test-secret' }
  const saved = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]))
  Object.assign(process.env, env)
  const manifest = parseManifest({ schemaVersion: '2.0', identity: {
    workspaceId: '11111111-1111-4111-8111-111111111111', semanticModelId: '77777777-7777-4777-8777-777777777777',
  }, capabilities: { liveDefinitionRequired: true }, model: { tables: [
    { name: 'Cadastro Jobs', columns: [{ name: 'JOB_CODIGO', dataType: 'integer' }, { name: 'JOB' }, { name: 'Cliente' }, { name: 'Credito', dataType: 'decimal' }, { name: 'Observacao' }, { name: 'Sigilo', restricted: true },
      ...Array.from({ length: 30 }, (_, i) => ({ name: `Campo${i}` }))] },
    { name: 'Etapas', columns: [{ name: 'JOB' }, { name: 'Etapa' }, { name: 'Valor', dataType: 'decimal' }] },
    { name: 'Sem registros', columns: [{ name: 'JOB' }, { name: 'Data', dataType: 'dateTime' }] },
    { name: 'Outra entidade', columns: [{ name: 'ID' }] },
  ], measures: [{ name: 'Quantidade', table: 'Cadastro Jobs' }] }, queryPolicy: { maxRows: 20 } })
  const dashboard = { id: '44444444-4444-4444-8444-444444444444', name: 'BI de teste', department: 'Diretoria', allowed_departments: [], assigned_user_id: null, sub_group: null }
  const conversationId = '66666666-6666-4666-8666-666666666666', userId = '55555555-5555-4555-8555-555555555555'
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  let wrongJob = false, missingField = false, failedTable = false, refreshDuringQuery = false, refreshStatus = 'Completed', refreshVersion = 'v1'
  let queries = 0, active = 0, peak = 0, saves = 0
  const history: { question: string; answer: string }[] = []
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input)
      if (url.includes('gs_ia_provider_config')) return json([])
      if (url.includes('login.microsoftonline.com')) return json({ access_token: 'test-access-token', expires_in: 3600 })
      if (url.includes('/refreshes?')) return json({ value: [{ requestId: refreshVersion, status: refreshStatus, startTime: '2026-10-13T00:00:00Z' }] })
      if (url.includes('/getDefinition')) return json({ definition: { parts: manifest.tables.map(table => ({
        path: `definition/tables/${table.name}.tmdl`, payloadType: 'InlineBase64',
        payload: Buffer.from(`table '${table.name}'\n${table.columns.map(column => `\tcolumn '${column.name}'`).join('\n')}\n${table.name === 'Cadastro Jobs' ? '\tmeasure Quantidade = COUNTROWS(\'Cadastro Jobs\')' : ''}`).toString('base64'),
      })) } })
      if (url.endsWith('/executeQueries')) {
        const dax = JSON.parse(String(init?.body)).queries[0].query as string
        assert(dax.includes('UPPER(TRIM(') && dax.includes('= "12345-FTX"'))
        assert(!dax.includes("'Outra entidade'"))
        queries++; active++; peak = Math.max(peak, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active--
        if (refreshDuringQuery) refreshVersion = 'v2'
        if (dax.includes("'Cadastro Jobs'")) return json({ results: [{ tables: [{ rows: [{ '[JOB_CODIGO]': 99, '[JOB]': wrongJob ? '54321-TAX' : '12345-FTX',
          '[Cliente]': 'Empresa [Teste]', '[Credito]': 1234.56789, '[Sigilo]': 'Permitido no modelo autorizado',
          ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`[Campo${i}]`, null])),
          ...(missingField ? {} : { '[Observacao]': null }) }] }] }] })
        if (dax.includes("'Etapas'")) return failedTable ? json({ error: { code: 'SourceUnavailable' } }, 503)
          : json({ results: [{ tables: [{ rows: [{ '[JOB]': '12345-FTX', '[Etapa]': 'Negociação', '[Valor]': 1234.56789 },
            { '[JOB]': '12345-FTX', '[Etapa]': 'Reunião técnica', '[Valor]': 1234.56789 }] }] }] })
        return json({ results: [{ tables: [{ rows: [] }] }] })
      }
      throw new Error(`Unexpected request: ${url}`)
    }
    assert.equal(jobTables(manifest).length, 3)
    const work = (message: string, clarificationToken?: string) => withAiRequestCache(() => answerBiQuestion({ manifest, dashboard,
      userId, isAdmin: false, conversationId, message, clarificationToken,
      audit: { configuration: { provedorId: 'opencode-go', modelo: 'deepseek-v4.1-flash', enabled: true, reasoningEffort: 'max', fonte: 'banco' },
        takeRateLimit: async () => {}, resolveConversation: async () => conversationId, previousTurns: async () => history,
        recordTurn: async turn => { saves++; history.push({ question: turn.question, answer: turn.answer }) }, recordQueryLog: async () => {} },
    }))
    const first = await work('me fale mais sobre esse job 12345-ftx')
    assert('answer' in first && typeof first.answer === 'string')
    assert(first.answer.includes('1.234,56789'))
    assert(first.answer.includes('Empresa \\[Teste\\]'))
    assert(first.answer.includes('Negociação') && first.answer.includes('Reunião técnica'))
    assert(first.answer.includes('Campos sem valor no modelo'))
    assert(first.answer.includes('Campo29'))
    assert(!first.answer.includes('2.469') && first.answer.includes('Permitido no modelo autorizado'))
    assert.equal(first.queries.length, 3)
    assert.equal(peak, 3)
    const second = await work('quero tudo')
    assert('answer' in second && second.answer === first.answer)
    // Recover a clarification issued by the previous deployment for this exact job.
    const token = issueClarificationToken({ userId, dashboardId: dashboard.id, conversationId,
      original: 'me fale mais sobre esse job 12345-ftx', count: 2, required: [], issuedAt: Date.now() }, clarificationKey())
    const recovered = await work('quero tudo', token)
    assert('answer' in recovered && recovered.answer === first.answer)
    const beforeFailure = saves
    const detail = () => loadJobDetails({ manifest, jobCode: '12345-FTX', question: 'detalhes do job 12345-FTX' })
    wrongJob = true
    await assert.rejects(work('job 12345-FTX'), /filtro do job/)
    wrongJob = false; missingField = true
    await assert.rejects(detail(), /todos os campos/)
    missingField = false; failedTable = true
    await assert.rejects(work('job 12345-FTX'), /consulta ao Power BI falhou/)
    failedTable = false; refreshDuringQuery = true
    await assert.rejects(detail(), /atualização do modelo mudou/)
    refreshDuringQuery = false; refreshStatus = 'InProgress'
    const beforeRefresh = queries
    await assert.rejects(detail(), /sendo atualizado/)
    assert.equal(queries, beforeRefresh)
    assert.equal(saves, beforeFailure)
    refreshStatus = 'Failed'
    const stale = await detail()
    assert(stale!.answer.indexOf('⚠️') < stale!.answer.indexOf('### Registros:'))
  } finally {
    globalThis.fetch = originalFetch
    for (const name of Object.keys(env)) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  }
})
