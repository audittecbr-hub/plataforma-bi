import assert from 'node:assert/strict'
import test from 'node:test'
import { parseManifest, parseLinkedManifest, manifestHash, ManifestLinkError } from '../src/lib/bi-ai/manifest'
import { expandContextFromPlan, selectContext } from '../src/lib/bi-ai/context'
import { validateDax } from '../src/lib/bi-ai/dax-guard'
import { answerIsGrounded, parsePlan, trimResults } from '../src/lib/bi-ai/plan'
import { conversationBelongsToDashboard, dashboardAccessDecision, montarContextoUsuario, podeAcessarDashboard } from '../src/lib/permissions'
import { validRegistrationSecret } from '../src/lib/bi-ai/registration-secret'
import { executeDaxQuery, PowerBiQueryError, powerBiUserMessage } from '../src/lib/powerbi'
import { decryptApiKey, encryptApiKey, parseEncryptionKey } from '../src/lib/ai-key-crypto'
import { modelProtocol, modelSupportedByAdapter, reasoningOptions } from '../src/lib/ai-reasoning'
import { certifiedPlan, certifiedScopeMessage, validateCertifiedQueries } from '../src/lib/bi-ai/certified'
import { assertPublishedCatalog, parsePublishedSchema } from '../src/lib/bi-ai/fabric-schema'

const raw = {
  schemaVersion: '1.0',
  identity: {
    workspaceId: '11111111-1111-4111-8111-111111111111',
    semanticModelId: '22222222-2222-4222-8222-222222222222',
  },
  source: { workspaceId: '11111111-1111-4111-8111-111111111111' },
  capabilities: {},
  business: { summary: 'Receita das unidades', synonyms: { receita: ['faturamento'], unidade: ['filial'] } },
  model: {
    tables: [
      { name: 'Dim', columns: [{ name: 'Unidade', synonyms: ['Filial'] }] },
      { name: 'Fato', kind: 'fact', columns: [{ name: 'Valor', aggregatable: false }] },
      { name: 'Clientes', columns: [{ name: 'CNPJ', restricted: true }] },
      { name: 'Tecnica', queryable: false, columns: [{ name: 'Segredo' }] },
    ],
    measures: [
      { name: 'Receita Líquida', table: 'Fato', preferredMeasure: true, synonyms: ['Faturamento'] },
      { name: 'Painel HTML', table: 'Fato', presentationOnly: true, expression: '<div>...</div>' },
    ],
  },
  report: {}, queryPolicy: {}, recommendedQuestions: ['Qual a receita por unidade?'],
  queryExamples: [], ambiguities: [],
}

const manifest = parseManifest(raw)
const context = selectContext(manifest, 'faturamento por filial', false)

test('manifest validates identity and stable versioned hash', () => {
  assert.equal(manifest.semanticModelId, raw.identity.semanticModelId)
  assert.equal(manifestHash(raw), manifestHash({ ...raw, source: { ...raw.source } }))
  assert.throws(() => parseManifest({ ...raw, schemaVersion: '3.0' }), /schemaVersion/)
  assert.throws(() => parseManifest({ ...raw, source: { workspaceId: '33333333-3333-4333-8333-333333333333' } }), /diverge/)
})

test('v2 PBIP manifest normalizes queryable flags and blocks a known publication mismatch', () => {
  const v2 = {
    ...raw, schemaVersion: '2.0', source: { ...raw.source, registrationReady: false },
    model: { ...raw.model, tables: raw.model.tables.map((table) => table.name === 'Fato'
      ? { ...table, columns: [...table.columns, { name: 'Categoria', queryable: true, semanticRole: 'dimension' }] }
      : table), measures: [
      { name: 'Receita Líquida', table: 'Fato', preferred: true, queryable: true },
      { name: 'Controle', table: 'Fato', queryable: false },
    ] },
    queryPolicy: { defaultMaxRows: 80 },
    ambiguities: [{ description: 'Regra pendente de revisão.' }],
  }
  const parsed = parseManifest(v2)
  assert.equal(parsed.schemaVersion, '2.0')
  assert.equal(parsed.policy.maxRows, 80)
  assert(parsed.measures.find((measure) => measure.name === 'Receita Líquida')?.preferredMeasure)
  assert(!selectContext(parsed, 'receita', false).measures.some((measure) => measure.name === 'Controle'))
  const categoryContext = selectContext(parsed, 'receita por categoria', false)
  assert.doesNotThrow(() => validateDax('EVALUATE TOPN(10, SUMMARIZECOLUMNS(Fato[Categoria], "Receita", [Receita Líquida]), [Receita Líquida], DESC)', categoryContext, parsed, 80))
  assert.equal(parsed.ambiguities[0], 'Regra pendente de revisão.')
  assert.throws(() => parseLinkedManifest({ ai_enabled: true, ai_manifest: v2 }), (error) =>
    error instanceof ManifestLinkError && error.code === 'PUBLICATION_MISMATCH')
})

test('dashboard without manifest or with mismatched identity fails before Power BI', () => {
  assert.throws(() => parseLinkedManifest({ ai_enabled: true }), (error) =>
    error instanceof ManifestLinkError && error.code === 'MANIFEST_MISSING')
  assert.throws(() => parseLinkedManifest({ ai_enabled: true, ai_manifest: raw,
    dataset_id: manifest.semanticModelId, workspace_id: '33333333-3333-4333-8333-333333333333',
    ai_manifest_version: '1.0', ai_manifest_hash: manifestHash(raw) }), (error) =>
    error instanceof ManifestLinkError && error.code === 'MANIFEST_IDENTITY_MISMATCH')
})

test('context selects business synonyms and excludes protected objects', () => {
  assert(context.measures.some((measure) => measure.name === 'Receita Líquida'))
  assert(context.columns.some((column) => column.name === 'Unidade'))
  assert(!context.measures.some((measure) => measure.name === 'Painel HTML'))
  assert(!context.columns.some((column) => column.name === 'CNPJ'))
  assert(!context.tables.some((table) => table.name === 'Tecnica'))
})

test('monthly wording supplies an authorized month dimension for DAX planning', () => {
  const monthly = parseManifest({ ...raw, model: { ...raw.model,
    tables: [...raw.model.tables, { name: 'Calendario', columns: [
      { name: 'Ano' }, { name: 'MesAno', synonyms: ['mês'] },
    ] }],
    measures: [...raw.model.measures, { name: 'Resultado Realizado', table: 'Fato',
      preferredMeasure: true, synonyms: ['resultado'] }],
    timeFields: ['Calendario[Ano]', 'Calendario[MesAno]'],
  } })
  const monthlyContext = selectContext(monthly, 'qual resultado mensal?', false)
  assert(monthlyContext.columns.some((column) => column.table === 'Calendario' && column.name === 'MesAno'))
  assert(selectContext(monthly, 'quais foram os resultados mensais?', false).columns
    .some((column) => column.table === 'Calendario' && column.name === 'MesAno'))
  assert.doesNotThrow(() => validateDax(
    'EVALUATE TOPN(12, SUMMARIZECOLUMNS(Calendario[MesAno], "Resultado", [Resultado Realizado]), [Resultado Realizado], DESC)',
    monthlyContext, monthly, 100,
  ))
})

test('certified recipes compile scoped aggregate DAX and refuse uncovered entity questions', () => {
  const recipe = {
    id: 'unit-a', kind: 'row', subject: 'Unidade A', format: 'currency', yearField: 'Calendario[Ano]',
    match: { phrases: ['Unidade A'], anyWords: ['receita'], excludePhrases: ['mensal'] },
    metrics: [{ key: 'receita', label: 'Receita da unidade', sum: 'Fato[Valor]',
      filter: { field: 'Dim[Unidade]', equals: 'A' } }],
  }
  const withRecipe = parseManifest({ ...raw,
    model: { ...raw.model, tables: [
      { name: 'Dim', columns: [{ name: 'Unidade', synonyms: ['Filial'] }] },
      { name: 'Fato', kind: 'fact', columns: [{ name: 'Valor', queryable: true, aggregatable: true }] },
      { name: 'Calendario', columns: [{ name: 'Ano', semanticRole: 'time' }] },
    ] },
    certifiedQueries: [recipe],
  })
  assert.doesNotThrow(() => validateCertifiedQueries(withRecipe))
  const plan = certifiedPlan(withRecipe, 'Qual a receita da Unidade A em 2026?')!
  assert.match(plan.dax, /SUM\('Fato'\[Valor\]\)/)
  assert.match(plan.dax, /'Dim'\[Unidade\] = "A"/)
  assert.match(plan.dax, /'Calendario'\[Ano\] = 2026/)
  assert.match(plan.answer([{ '[Receita da unidade]': 1234.56 }]), /1\.234,56/)
  assert.match(certifiedScopeMessage(withRecipe, 'Qual a receita mensal da Unidade A?') ?? '', /não tem uma consulta validada/)
  assert.equal(certifiedPlan(withRecipe, 'Qual a receita da Unidade A em janeiro de 2026?'), null)
  assert.match(certifiedScopeMessage(withRecipe, 'Qual a receita da Unidade A em janeiro de 2026?') ?? '', /não tem uma consulta validada/)
  const invalid = parseManifest({ ...withRecipe.raw, model: { ...raw.model,
    tables: [
      { name: 'Dim', columns: [{ name: 'Unidade' }] },
      { name: 'Fato', kind: 'fact', columns: [{ name: 'Valor', queryable: true, aggregatable: false }] },
      { name: 'Calendario', columns: [{ name: 'Ano', semanticRole: 'time' }] },
    ] } })
  assert.throws(() => validateCertifiedQueries(invalid), /não autorizado/)
  const withGrouping = parseManifest({ ...withRecipe.raw, certifiedQueries: [recipe, {
    id: 'by-unit', kind: 'grouped', subject: 'Receita por unidade', format: 'currency',
    yearField: 'Calendario[Ano]', groupField: 'Dim[Unidade]', maxRows: 10,
    match: { allWords: ['receita', 'unidade'] },
    metrics: [{ key: 'receita', label: 'Receita', measure: 'Receita Líquida' }],
  }] })
  const grouped = certifiedPlan(withGrouping, 'Receita por unidade em 2026?')!
  assert.match(grouped.dax, /NOT ISBLANK\('Dim'\[Unidade\]\)/)
})

test('DAX guard accepts an official measure and bounded dimension grouping', () => {
  const valid = `EVALUATE TOPN(50, SUMMARIZECOLUMNS('Dim'[Unidade], "Receita", [Receita Líquida]), [Receita Líquida], DESC)`
  assert.deepEqual(validateDax(valid, context, manifest, 100).measures, ['Receita Líquida'])
  assert.doesNotThrow(() => validateDax(
    'EVALUATE TOPN(10, SUMMARIZECOLUMNS(Dim[Unidade], "Receita", CALCULATE([Receita Líquida])), [Receita], DESC)',
    context, manifest, 100,
  ))
  assert.throws(() => validateDax('EVALUATE ROW("X", [Inexistente])', context, manifest, 100), /fora do contexto/)
  assert.throws(() => validateDax('EVALUATE ROW("X", [Painel HTML])', context, manifest, 100), /fora do contexto/)
  assert.throws(() => validateDax(`EVALUATE TOPN(10, SUMMARIZECOLUMNS('Clientes'[CNPJ], "X", [Receita Líquida]))`, context, manifest, 100), /fora do contexto/)
  assert.throws(() => validateDax('EVALUATE Fato', context, manifest, 100), /ROW para totais/)
  assert.throws(() => validateDax('EVALUATE ROW("X", [Receita Líquida] + 1000000)', context, manifest, 100), /Aritmética/)
  assert.throws(() => validateDax(`EVALUATE TOPN(1000, SUMMARIZECOLUMNS('Dim'[Unidade], "X", [Receita Líquida]))`, context, manifest, 100), /TOPN/)
  assert.throws(() => validateDax(`EVALUATE TOPN(10, SUMMARIZECOLUMNS('Fato'[Valor], "X", [Receita Líquida]))`, context, manifest, 100), /factual/)
})

test('a plan can inspect another authorized manifest object without granting restricted fields', () => {
  const narrow = { ...context, measures: [], columns: [] }
  const expanded = expandContextFromPlan(narrow, manifest,
    'EVALUATE TOPN(10, SUMMARIZECOLUMNS(Dim[Unidade], "Receita", [Receita Líquida]))')
  assert(expanded.measures.some((measure) => measure.name === 'Receita Líquida'))
  assert(expanded.columns.some((column) => column.table === 'Dim' && column.name === 'Unidade'))
  assert(!expanded.columns.some((column) => column.name === 'CNPJ'))
})

test('Fabric definition parser keeps model and report schema without source connections', () => {
  const part = (path: string, contents: string) => ({ path, payloadType: 'InlineBase64',
    payload: Buffer.from(contents).toString('base64') })
  const schema = parsePublishedSchema([
    part('definition/tables/Fato.tmdl', `table Fato\n\tcolumn Valor\n\tmeasure 'Receita Líquida' = SUM(Fato[Valor])\n\tpartition Fato = m\n\t\tsource = Sql.Database("private-server", "db")`),
    part('definition/relationships.tmdl', 'relationship r1\n\tfromColumn: Fato.Valor\n\ttoColumn: Dim.Unidade'),
  ], [
    part('definition/pages/page1/page.json', JSON.stringify({ displayName: 'Resumo' })),
    part('definition/pages/page1/visuals/v1/visual.json', JSON.stringify({ visual: { visualType: 'card' } })),
  ])
  assert.equal(schema.measures[0].name, 'Receita Líquida')
  assert.equal(schema.measures[0].expression, 'SUM(Fato[Valor])')
  assert.equal(schema.columns[0].name, 'Valor')
  assert.deepEqual(schema.pages, ['Resumo'])
  assert.equal(schema.visualCount, 1)
  assert(!JSON.stringify(schema).includes('private-server'))
  const stale = parseManifest({ ...raw, source: { ...raw.source, publishedModelHash: 'old-version' },
    model: { tables: [{ name: 'Fato', columns: [{ name: 'Valor' }] }],
      measures: [{ name: 'Receita Líquida', table: 'Fato' }] } })
  assert.throws(() => assertPublishedCatalog(stale, schema), /mudou/)
  assert.doesNotThrow(() => assertPublishedCatalog(stale, schema, false))
})

test('planner caps queries and refuses unanswerable questions without DAX', () => {
  const no = parsePlan(JSON.stringify({ answerable: false, reason: 'sem dados', queries: [] }), context, manifest, 'clima')
  assert.equal(no.queries.length, 0)
  const tooMany = { answerable: true, queries: Array.from({ length: 4 }, () => ({
    purpose: 'total', dax: 'EVALUATE ROW("Receita", [Receita Líquida])', maxRows: 100,
  })) }
  assert.throws(() => parsePlan(JSON.stringify(tooMany), context, manifest, 'receita'), /1 a 3/)
  const qualified = parsePlan(JSON.stringify({ answerable: true,
    objectsUsed: ['Fato[Receita Líquida]'], queries: [{ purpose: 'total',
      dax: 'EVALUATE ROW("Receita", [Receita Líquida])', maxRows: 1 }] }),
  context, manifest, 'receita')
  assert.equal(qualified.queries.length, 1)
})

test('answer numbers must be present in real result or user period', () => {
  const result = trimResults([{ Receita: 1234.56, Ano: 2026 }], 100)
  assert(answerIsGrounded('A receita foi 1.234,56 em 2026.', [result.rows], 'Receita em 2026?'))
  assert(answerIsGrounded('A receita foi 1.234,56.', [[{ Receita: 1234.556 }]], 'Receita?'))
  assert(answerIsGrounded('O atingimento foi 75,6%.', [[{ Percentual: 0.7562 }]], 'Atingimento?'))
  assert(!answerIsGrounded('A receita foi 9.999,00.', [result.rows], 'Receita em 2026?'))
})

test('shared dashboard authorization preserves leader and department rules', () => {
  const user = montarContextoUsuario('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
    department: 'Expansão', allowed_sub_departments: [], is_admin: false, is_leader: false,
  })
  assert(podeAcessarDashboard({ department: 'Expansão' }, user))
  assert(!podeAcessarDashboard({ department: 'Financeiro' }, user))
  assert(!podeAcessarDashboard({ department: 'Expansão', assigned_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, user))
  assert.equal(dashboardAccessDecision(null, null, { department: 'Expansão' }), 401)
  assert.equal(dashboardAccessDecision(user.userId, null, null), 404)
  assert.equal(dashboardAccessDecision(user.userId, { department: 'Expansão' }, { department: 'Financeiro' }), 403)
  assert.equal(dashboardAccessDecision(user.userId, { department: 'Expansão' }, { department: 'Expansão' }), 200)
})

test('a conversation cannot be carried to a different dashboard', () => {
  const conversation = { user_id: 'user-1', dashboard_id: 'dashboard-a' }
  assert(conversationBelongsToDashboard(conversation, 'user-1', 'dashboard-a'))
  assert(!conversationBelongsToDashboard(conversation, 'user-1', 'dashboard-b'))
  assert(!conversationBelongsToDashboard(conversation, 'user-2', 'dashboard-a'))
})

test('registration requires the exact integration secret', () => {
  assert(validRegistrationSecret('correct', 'correct'))
  assert(!validRegistrationSecret('wrong', 'correct'))
  assert(!validRegistrationSecret('', 'correct'))
})

test('admin API keys are encrypted and bound to their provider', () => {
  const key = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'))!
  const sealed = encryptApiKey('deepseek', 'sensitive-api-key', key)
  assert(!JSON.stringify(sealed).includes('sensitive-api-key'))
  assert.equal(decryptApiKey('deepseek', sealed, key), 'sensitive-api-key')
  assert.throws(() => decryptApiKey('openai', sealed, key))
  assert.throws(() => parseEncryptionKey('not-an-encryption-key'))
})

test('reasoning controls follow adapter and model support', () => {
  assert(reasoningOptions('deepseek', 'deepseek-flash').includes('high'))
  assert.deepEqual(reasoningOptions('opencode-go', 'deepseek-v4.1-flash'), ['auto'])
  assert(reasoningOptions('openai', 'gpt-5').includes('medium'))
  assert.deepEqual(reasoningOptions('openai', 'gpt-4o-mini'), ['auto'])
  assert(reasoningOptions('anthropic', 'claude-sonnet-4-6').includes('high'))
  assert.deepEqual(reasoningOptions('anthropic', 'claude-sonnet-4-5'), ['auto'])
  assert(modelSupportedByAdapter('opencode-go', 'deepseek-v4.1-flash'))
  assert.equal(modelProtocol('opencode-go', 'gpt-6-luna'), 'responses')
  assert.equal(modelProtocol('opencode-go', 'qwen3.8-flash'), 'messages')
  assert(!modelSupportedByAdapter('opencode-go', 'unknown-future-protocol'))
})

test('Power BI adapter uses a real shaped result and controls permission, DAX and timeout errors', async () => {
  const originalFetch = globalThis.fetch
  const originalError = console.error
  const saved = {
    tenant: process.env.POWERBI_TENANT,
    client: process.env.POWERBI_CLIENT_ID,
    secret: process.env.POWERBI_CLIENT_SECRET,
  }
  process.env.POWERBI_TENANT = 'tenant'
  process.env.POWERBI_CLIENT_ID = 'client'
  process.env.POWERBI_CLIENT_SECRET = 'secret'
  let mode: 'success' | 'unauthorized' | 'forbidden' | 'dax' | 'timeout' = 'success'
  console.error = () => {}
  globalThis.fetch = async (url) => {
    if (String(url).includes('login.microsoftonline.com')) {
      return Response.json({ access_token: 'test-token', expires_in: 3600 })
    }
    if (mode === 'timeout') throw new DOMException('timed out', 'TimeoutError')
    if (mode === 'unauthorized') return new Response('denied', { status: 401 })
    if (mode === 'forbidden') return new Response('denied', { status: 403 })
    if (mode === 'dax') return new Response('DAX query failure: syntax error', { status: 400 })
    return Response.json({ results: [{ tables: [{ rows: [{ '[Receita]': 123.45 }] }] }] })
  }
  const input = { workspaceId: manifest.workspaceId, semanticModelId: manifest.semanticModelId,
    dax: 'EVALUATE ROW("Receita", [Receita Líquida])' }
  try {
    const rows = await executeDaxQuery(input)
    assert.equal(rows[0]['[Receita]'], 123.45)
    assert(answerIsGrounded('A receita é 123,45.', [rows], 'Qual a receita?'))
    mode = 'unauthorized'
    await assert.rejects(executeDaxQuery(input), (error) => error instanceof PowerBiQueryError
      && error.code === 'WORKSPACE_ACCESS' && !powerBiUserMessage(error).includes('denied'))
    mode = 'forbidden'
    await assert.rejects(executeDaxQuery(input), (error) => error instanceof PowerBiQueryError
      && error.code === 'WORKSPACE_ACCESS')
    mode = 'dax'
    await assert.rejects(executeDaxQuery(input), (error) => error instanceof PowerBiQueryError
      && error.code === 'INVALID_DAX')
    mode = 'timeout'
    await assert.rejects(executeDaxQuery(input), (error) => error instanceof PowerBiQueryError
      && error.code === 'TIMEOUT')
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
    for (const [key, value] of Object.entries(saved)) {
      const envKey = key === 'tenant' ? 'POWERBI_TENANT' : key === 'client' ? 'POWERBI_CLIENT_ID' : 'POWERBI_CLIENT_SECRET'
      if (value === undefined) delete process.env[envKey]
      else process.env[envKey] = value
    }
  }
})
