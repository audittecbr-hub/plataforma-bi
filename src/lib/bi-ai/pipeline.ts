import 'server-only'

import { createHash } from 'node:crypto'
import { chaveDoProvedor, obterProvedor } from '@/lib/llm'
import { lerConfigIa, type ConfigIa } from '@/lib/llm-config'
import { modelEnabled } from '@/lib/ai-keyring'
import { deepSeekThinkingModel, modelSupportedByAdapter } from '@/lib/ai-reasoning'
import { executeDaxQuery, getLatestRefreshStatus, PowerBiQueryError, powerBiUserMessage } from '@/lib/powerbi'
import { BiAiError, type DashboardRow } from './access'
import { expandContextFromPlan, inspectCatalog, normalizeTerm, preloadPlannerContext, selectContext, type SelectedContext } from './context'
import { mapConcurrent } from './concurrency'
import { answerFromReportReference, loadReportFacts } from './report-reference'
import { ReportEvidenceError, validateReportReferences, formatReportValue, type ReportFact } from './report-evidence'
import { answerContext, formatVerifiedAnswer, resultValue } from './presentation'
import { biProgress, type BiProgressReporter } from './progress'
import { escapeMarkdown, SOURCE_SECTION } from './message-format'
import { isGeneralJobLookup, jobCodeIn, resolveJobContext } from './entity-context'
import { loadJobDetails } from './job-details'
import { prepareSemanticQuery } from './semantic-query'
import { maskDax, usesPublishedDataRule, sourceTableFields } from './dax-source'
import { publishedAggregations } from './source-analysis'
import { PLANNER_INSTRUCTIONS } from './planner-instructions'
import { focusedPlannerContext, plannerReportReferences, rankSemanticSources } from './planner-context'
import { nativeMeasureRules } from './measure-dependencies'
import { readWithCapacityFallback, reuseRowCalculations } from './dax-performance'
import { auditResultQuery, resultCatalog } from './result-query'
import { issueAnalysisCheckpoint, readAnalysisCheckpoint, type AnalysisCheckpoint } from './analysis-checkpoint'
import { publishedSchema } from './fabric-context'
import { readStored, writeStored } from './snapshot-store'
import { inBackground } from './background'
import { markCached, recordDax, telemetrySnapshot, withBiTelemetry } from './telemetry'
import { conversarEtapa, explainerEffort, plannerEffort } from './stages'
import { CERTIFIED_INSTRUCTIONS, certifiedMeasures, certifiedOnly } from './ia-table'
import { PublishedSchemaError, withPublishedSchema, type PublishedSchema } from './fabric-schema'
import { clarificationKey, ClarificationError,
  continueClarification, issueClarificationToken, readClarificationToken,
  type ClarificationPrompt } from './clarification'
import { previousTurns, recordQueryLog as persistQueryLog, recordTurn, resolveConversation, takeRateLimit } from './conversations'
import { type BiManifest } from './manifest'
import { answerIsGrounded, normalizeGroupedRows, parseAnswer, parsePlan, parseReviewedPlan, prepareGroupedExecution,
  trimResults, metadataOnlyQuestion, type PlannedQuery, type QueryPlan } from './plan'

const MAX_MESSAGE = 8000

/**
 * 'risco' (default) skips the second AI review when every query reuses the server-injected
 * published rule (sourceMeasure variables) and derives nothing from earlier results; free DAX
 * that re-implements a rule is still reviewed. 'sempre' reviews every aggregated plan.
 * Measured on the golden set (14/10/2026): same accuracy, 60–150 s less on analytical questions.
 */
function reviewPolicy(): 'sempre' | 'risco' {
  return process.env.BI_AI_REVIEW_POLICY === 'sempre' ? 'sempre' : 'risco'
}

/** Bump when the answer logic changes so older cached answers stop being served. */
const ANSWER_CACHE_VERSION = 'v1'
const ANSWER_CACHE_MAX_AGE = 24 * 60 * 60_000

interface CachedAnswer {
  answer: string
  queries: { purpose: string; rowCount: number }[]
}

function answerCachePath(dashboardId: string, key: string): string {
  return `answers/${dashboardId}/${key}.json.gz`
}

/**
 * Same question, same published definition, same refresh and same AI configuration
 * produce the same verified answer, so it can be reused until the next refresh.
 */
function answerCacheKey(input: { dashboardId: string; isAdmin: boolean; message: string; config: ConfigIa
  schema: PublishedSchema; refresh: { requestId: string; status: string; endTime?: string } | null }): string | null {
  if (!input.refresh || !['Completed', 'Failed'].includes(input.refresh.status)) return null
  const question = normalizeTerm(input.message).replace(/[?!.;:]+$/g, '').replace(/\s+/g, ' ').trim()
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  return createHash('sha256').update(JSON.stringify([ANSWER_CACHE_VERSION, input.dashboardId, input.isAdmin, question,
    input.schema.modelHash, input.schema.reportHash ?? '', input.refresh.requestId, input.refresh.status, input.refresh.endTime ?? '',
    input.config.provedorId, input.config.modelo, input.config.reasoningEffort, today])).digest('hex')
}

/** Internal QA storage adapter; HTTP routes never accept this from the browser. */
export interface BiAuditServices {
  configuration: ConfigIa
  takeRateLimit: typeof takeRateLimit
  resolveConversation: typeof resolveConversation
  previousTurns: typeof previousTurns
  recordTurn: typeof recordTurn
  recordQueryLog: typeof persistQueryLog
}

/**
 * Último recurso quando o explicador falha duas vezes.
 * Antes daqui saía `JSON.stringify(...)` e o usuário via JSON cru na tela.
 */
function resumoLegivel(results: { purpose: string; rows: Record<string, unknown>[]; truncated: boolean; formats?: PlannedQuery['formats'] }[]): string {
  const blocos = results.map((result) => {
    const title = `### ${escapeMarkdown(result.purpose)}`
    if (!result.rows.length) return `${title}\n\n- Sem dados neste recorte.`
    const label = (key: string) => escapeMarkdown((key.includes('[') ? key.slice(key.indexOf('[') + 1).replace(/\]$/, '') : key)
      .replace(/^v(?=[A-Z])/, '').replaceAll('_', ' ').replace(/([a-záéíóúãõ])([A-Z])/g, '$1 $2'))
    const value = (entry: unknown, key: string) => escapeMarkdown(resultValue(entry, result.formats?.[key]
      ?? result.formats?.[key.replace(/^.*\[|\]$/g, '')])).replace(/\r?\n/g, ' · ')
    const keys = [...new Set(result.rows.flatMap(row => Object.keys(row)))]
    const content = result.rows.length === 1 ? Object.entries(result.rows[0]).map(([key, entry]) => `- **${label(key)}:** ${value(entry, key)}`).join('\n')
      : [`| ${keys.map(label).join(' | ')} |`, `| ${keys.map(() => '---').join(' | ')} |`,
        ...result.rows.map(row => `| ${keys.map(key => value(row[key], key)).join(' | ')} |`)].join('\n')
    return `${title}\n\n${content}${result.truncated ? '\n\n> ⚠️ Há mais registros. Refine os filtros para consultar o restante; os valores acima são as linhas retornadas.' : ''}`
  })
  return blocos.join('\n\n')
}

/**
 * O relatório está embarcado via Publish to web, que NÃO expõe o estado dos slicers
 * (e a filtragem por URL não funciona nesse modo — documentação oficial da Microsoft).
 * Enquanto isso não mudar, o Chat declara o escopo que usou: assim uma divergência
 * com a tela fica visível em vez de silenciosa.
 */
function notaDeEscopo(message: string, context: SelectedContext): string {
  const periodoExplicito = /\b20\d{2}\b|\b(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|trimestre|semestre|ytd|acumulad|este m[eê]s|m[eê]s passado|ano passado)/i.test(message)
  if (periodoExplicito) return ''
  const padroes = [...new Set(context.reportMap
    .flatMap((line) => (line.split('filtros:')[1] ?? '').split('|'))
    .map((entry) => entry.trim().split(' (')[0])
    .filter((entry) => entry.includes(' = ')))]
  const partes: string[] = []
  if (padroes.length) partes.push(`Filtros padrão do relatório: ${padroes.slice(0, 4).join(', ')}.`)
  partes.push('O Chat não enxerga os filtros aplicados na tela: se você filtrou uma operação ou um mês, escreva o filtro na pergunta.')
  return partes.join(' ')
}

export async function providerReady(selectedConfig?: ConfigIa): Promise<boolean> {
  const config = selectedConfig ?? await lerConfigIa()
  const provider = obterProvedor(config.provedorId)
  if (!config.enabled || provider.id !== config.provedorId || !provider.baseUrl
    || !modelSupportedByAdapter(provider.id, config.modelo)
    || !(await modelEnabled(provider.id, config.modelo))) return false
  try { return !!(await chaveDoProvedor(provider)) } catch { return false }
}

async function saveTurn(input: {
  userId: string; dashboard: DashboardRow; conversationId: string; message: string; answer: string
  queries: { purpose: string; dax: string; rowCount: number }[]
  provider: string; model: string; tokens: number; started: number
  audit?: BiAuditServices
  /** Answer-cache key of this question; null when it is contextual or the data is changing. */
  cacheKey?: string | null
  /** Fallback answers (clarification limit, not answerable) are never reused. */
  cacheable?: boolean
  cached?: boolean
}) {
  await (input.audit?.recordTurn ?? recordTurn)({
    userId: input.userId, dashboardId: input.dashboard.id,
    conversationId: input.conversationId, dashboardName: input.dashboard.name,
    question: input.message, answer: input.answer, queries: input.queries,
    provider: input.provider, model: input.model, tokens: input.tokens,
    durationMs: Date.now() - input.started, cached: input.cached === true, telemetry: telemetrySnapshot(),
  })
  if (input.cacheKey && input.cacheable !== false && !input.cached) {
    const entry: CachedAnswer = { answer: input.answer, queries: input.queries.map(({ purpose, rowCount }) => ({ purpose, rowCount })) }
    const path = answerCachePath(input.dashboard.id, input.cacheKey)
    inBackground(() => writeStored(path, entry))
  }
}

export interface BiQuestionInput {
  dashboard: DashboardRow
  manifest: BiManifest
  userId: string
  isAdmin: boolean
  conversationId: string | null
  message: string
  clarificationToken?: string | null
  continuationToken?: string | null
  yieldAnalysis?: boolean
  /**
   * With yieldAnalysis, keep investigating inside this request until this much time has passed,
   * then hand a continuation to the browser. Keeps short analyses in one request without
   * risking the function time limit on long ones. 0 yields after every step.
   */
  yieldAfterMs?: number
  signal?: AbortSignal
  audit?: BiAuditServices
  onProgress?: BiProgressReporter
}

export async function answerBiQuestion(input: BiQuestionInput) {
  return withBiTelemetry(async () => {
    const began = Date.now()
    let current = input
    while (true) {
      const result = await answerBiQuestionStep(current)
      if (!('continuationToken' in result)) return result
      if (input.yieldAnalysis && Date.now() - began >= (input.yieldAfterMs ?? 0)) return result
      current = { ...current, conversationId: result.conversationId, continuationToken: result.continuationToken, clarificationToken: null }
    }
  })
}

async function answerBiQuestionStep(input: BiQuestionInput) {
  let started = Date.now()
  const incomingMessage = input.message.trim()
  input.onProgress?.(biProgress(1, 'Identificando indicadores, período e filtros no modelo atualizado.'))
  if (!incomingMessage || incomingMessage.length > MAX_MESSAGE) {
    throw new BiAiError(400, 'INVALID_MESSAGE', `A pergunta deve ter de 1 a ${MAX_MESSAGE} caracteres.`)
  }
  const config = input.audit?.configuration ?? await lerConfigIa()
  const persistLog = input.audit?.recordQueryLog ?? persistQueryLog
  const recordQueryLog: typeof persistQueryLog = async (entry) => {
    recordDax(entry.durationMs)
    return persistLog(entry)
  }
  const provider = obterProvedor(config.provedorId)
  if (!config.enabled) throw new BiAiError(409, 'AI_DISABLED', 'O Chat IA está desativado pelo administrador.')
  let keyReady = false
  try { keyReady = !!(await chaveDoProvedor(provider)) } catch (error) { console.error('[bi-ai] key unavailable:', error) }
  if (provider.id !== config.provedorId || !provider.baseUrl || !keyReady
    || !modelSupportedByAdapter(provider.id, config.modelo)
    || !(await modelEnabled(provider.id, config.modelo))) {
    throw new BiAiError(409, 'AI_NOT_CONFIGURED', 'O provedor de IA escolhido ainda não tem chave configurada.')
  }
  const conversationId = await (input.audit?.resolveConversation ?? resolveConversation)(input.userId, input.dashboard.id, input.conversationId)
  let checkpoint: AnalysisCheckpoint | null = null
  if (input.continuationToken) {
    try { checkpoint = readAnalysisCheckpoint(input.continuationToken, { userId: input.userId, dashboardId: input.dashboard.id, conversationId }) }
    catch (error) { throw new BiAiError(400, 'INVALID_ANALYSIS_CONTINUATION', error instanceof Error ? error.message : 'Continuação inválida.') }
    started = checkpoint.started
  } else await (input.audit?.takeRateLimit ?? takeRateLimit)(input.userId)
  const history = await (input.audit?.previousTurns ?? previousTurns)(conversationId)
  let message = checkpoint?.question ?? incomingMessage
  let clarificationCount = 0
  let clarifierKey: Buffer | null = null
  const key = () => {
    if (clarifierKey) return clarifierKey
    try { clarifierKey = clarificationKey(); return clarifierKey }
    catch { throw new BiAiError(503, 'CLARIFICATION_UNAVAILABLE', 'Esclarecimentos do Chat indisponíveis.') }
  }
  const ask = (prompt: ClarificationPrompt, original: string, count: number) => {
    if (count > 2) return { conversationId, answer: 'Não consegui confirmar o indicador e o recorte com segurança. Refaça a pergunta com indicador, período e filtros explícitos.',
      queries: [], assumptions: [] }
    const token = issueClarificationToken({ userId: input.userId, dashboardId: input.dashboard.id,
      conversationId, original, count, required: prompt.required ?? [], issuedAt: Date.now() }, key())
    return { conversationId, clarification: { question: prompt.question, options: prompt.options, token },
      queries: [], assumptions: [] }
  }
  if (input.clarificationToken) {
    let pending
    try {
      pending = readClarificationToken(input.clarificationToken,
        { userId: input.userId, dashboardId: input.dashboard.id, conversationId }, key())
    } catch (error) {
      if (error instanceof ClarificationError) throw new BiAiError(400, 'INVALID_CLARIFICATION', error.message)
      throw error
    }
    // An explicit entity starts its own topic, even if a previous question asked for a period/indicator.
    clarificationCount = jobCodeIn(incomingMessage) ? 0 : pending.count
    const continued = continueClarification(pending, incomingMessage)
    message = jobCodeIn(incomingMessage) ? incomingMessage : continued.question
    if (continued.followUp && !jobCodeIn(message)) {
      if (clarificationCount >= 2) throw new BiAiError(400, 'CLARIFICATION_INCOMPLETE',
        'Ainda faltam informações para consultar com segurança. Refaça a pergunta com indicador e período.')
      return ask(continued.followUp, message, clarificationCount + 1)
    }
  }
  const entity = resolveJobContext(message, history)
  message = entity.question
  // The synchronized snapshot and the refresh stamp are read together; the stamp is what makes
  // a stored answer reusable and what every final answer compares against.
  const [schemaResult, refreshResult] = await Promise.allSettled([
    publishedSchema(input.manifest.workspaceId, input.manifest.semanticModelId, input.manifest.reportId),
    checkpoint ? Promise.resolve(checkpoint.refreshBefore)
      : getLatestRefreshStatus(input.manifest.workspaceId, input.manifest.semanticModelId, input.signal),
  ])
  let context = selectContext(input.manifest, message, input.isAdmin)
  const initialContext = context
  if (deepSeekThinkingModel(provider.id, config.modelo)) context = preloadPlannerContext(context, input.manifest)
  const preloaded = context !== initialContext
  let contextLimit = preloaded ? 360_000 : 90_000
  let liveSchema: PublishedSchema | null = null
  try {
    if (schemaResult.status === 'rejected') throw schemaResult.reason
    liveSchema = schemaResult.value
    context = withPublishedSchema(context, input.manifest, liveSchema, contextLimit)
  } catch (error) {
    console.error('[bi-ai] published Fabric definition unavailable:', error instanceof Error ? `${error.name}: ${error.message}` : error)
    // Erro de programação não é indisponibilidade do Fabric. Sem esta distinção,
    // um TypeError aqui virava "tente novamente em instantes" e escondia o defeito.
    if (error instanceof TypeError || error instanceof ReferenceError) {
      throw new BiAiError(500, 'CONTEXT_ERROR', 'Falha ao montar o contexto do modelo publicado. Avise o administrador.')
    }
    if (input.manifest.capabilities.liveDefinitionRequired === true || error instanceof PublishedSchemaError) {
      throw new BiAiError(503, 'LIVE_SCHEMA_UNAVAILABLE',
        'Não consegui confirmar a definição atual do modelo publicado no Fabric. Tente novamente em instantes.')
    }
  }
  let currentReportRules: ReturnType<typeof validateReportReferences> = []
  if (liveSchema) {
    try { currentReportRules = validateReportReferences(input.manifest, liveSchema) }
    catch (error) { if (!(error instanceof ReportEvidenceError)) throw error }
  }
  const currentManifest = { ...input.manifest, raw: { ...input.manifest.raw, reportReferences: currentReportRules } }
  if (checkpoint && (checkpoint.modelHash !== liveSchema?.modelHash || checkpoint.reportHash !== liveSchema?.reportHash)) {
    throw new BiAiError(409, 'MODEL_CHANGED', 'A definição do modelo ou relatório mudou durante a análise. Refaça a pergunta.')
  }
  // Only the first question of a new conversation is reusable: follow-ups depend on history.
  const answerKey = checkpoint ? checkpoint.cacheKey ?? null
    : !input.clarificationToken && input.conversationId === null && liveSchema && refreshResult.status === 'fulfilled'
      ? answerCacheKey({ dashboardId: input.dashboard.id, isAdmin: input.isAdmin, message, config, schema: liveSchema, refresh: refreshResult.value })
      : null
  const save = (turn: Parameters<typeof saveTurn>[0]) => saveTurn({ ...turn, cacheKey: answerKey })
  if (answerKey && !checkpoint) {
    const stored = await readStored<CachedAnswer>(answerCachePath(input.dashboard.id, answerKey))
    if (stored && Date.now() - stored.savedAt < ANSWER_CACHE_MAX_AGE && typeof stored.value?.answer === 'string') {
      markCached()
      input.onProgress?.(biProgress(3, 'Resposta já conferida nesta mesma atualização do modelo.'))
      await save({ ...input, conversationId, message, answer: stored.value.answer, queries: [], provider: 'cache',
        model: config.modelo, tokens: 0, started, cached: true })
      return { conversationId, answer: stored.value.answer, queries: stored.value.queries ?? [], assumptions: [], truncated: false, cached: true }
    }
  }
  if (!checkpoint && entity.jobCode && isGeneralJobLookup(message)) {
    const details = await loadJobDetails({ manifest: input.manifest, jobCode: entity.jobCode, question: message,
      isAdmin: input.isAdmin, signal: input.signal, onProgress: input.onProgress,
      onQuery: entry => recordQueryLog({ ...entry, userId: input.userId, dashboardId: input.dashboard.id,
        semanticModelId: input.manifest.semanticModelId }) })
    if (details) {
      await save({ ...input, conversationId, message, answer: details.answer, queries: details.queries,
        provider: 'powerbi-records', model: config.modelo, tokens: 0, started })
      return { conversationId, answer: details.answer, queries: details.queries.map(({ purpose, rowCount }) => ({ purpose, rowCount })),
        assumptions: [], truncated: details.truncated, entity: { kind: 'job', id: entity.jobCode } }
    }
  }
  const normalizedMessage = normalizeTerm(message)
  const rawDataQuestion = !!entity.jobCode || /\b(?:tabelas?|registros|lancamentos|movimentos|cnpj|cpf)\b/.test(normalizedMessage)
    || /\b(?:liste|listar|detalhamento|detalhe|detalhar|detalhes)\b/.test(normalizedMessage)
      && /\b(?:jobs?|clientes?)\b/.test(normalizedMessage)
  if (!checkpoint && liveSchema && !rawDataQuestion && !metadataOnlyQuestion(message)) {
    try {
      const reference = await answerFromReportReference({ manifest: currentManifest, schema: liveSchema,
        question: message, config, signal: input.signal,
        onProgress: input.onProgress,
        onQuery: entry => recordQueryLog({ ...entry, userId: input.userId, dashboardId: input.dashboard.id,
          semanticModelId: input.manifest.semanticModelId }) })
      // A reference is an optional fast path. A new question/filter is investigated by the planner.
      if (reference?.answer) {
        await save({ ...input, conversationId, message, answer: reference.answer,
          queries: reference.queries, provider: provider.id, model: config.modelo, tokens: reference.tokens ?? 0, started })
        return { conversationId, answer: reference.answer,
          queries: reference.queries.map(({ purpose, rowCount }) => ({ purpose, rowCount })),
          assumptions: [], evidence: reference.evidence, truncated: false }
      }
    } catch (error) {
      if (error instanceof ReportEvidenceError) {
        if (/atualizad|atualizacao/.test(normalizeTerm(error.message))) throw new BiAiError(409, 'REPORT_REFERENCE_INVALID', error.message)
        // The current live model remains available when an optional reference has changed.
      } else throw error
    }
  }
  const session = conversationId
  const inspectedObjects = new Set<string>(checkpoint?.inspected)
  // Inspection survives every HTTP continuation, including ordinary tables/columns.
  if (checkpoint?.inspected.length) {
    context = inspectCatalog(context, input.manifest, checkpoint.inspected)
    if (liveSchema) context = withPublishedSchema(context, input.manifest, liveSchema, 700_000)
  }
  const executionContext = () => ({ ...context, semanticSources: context.semanticSources?.map(source =>
    liveSchema?.measures.find(measure => measure.name === source.measure)?.semanticSource ?? source) })
  // With certified measures, the visual's HTML program is not loaded up front: the IA table already carries its rules.
  const hasCertified = certifiedMeasures(input.manifest).length > 0
  if (!checkpoint && !hasCertified) {
    const source = rankSemanticSources(executionContext().semanticSources ?? [], message, currentReportRules)[0]
    if (source) inspectedObjects.add(`${source.measure}::auto`)
  }
  const plannerContext = () => focusedPlannerContext(context, input.manifest, message,
    executionContext().semanticSources ?? [], [...inspectedObjects], currentReportRules)
  const plannerReferences = () => plannerReportReferences(currentReportRules, [...inspectedObjects].map(name => name.split('::')[0]))
  const plannerSystem = hasCertified ? `${PLANNER_INSTRUCTIONS}\n${CERTIFIED_INSTRUCTIONS}` : PLANNER_INSTRUCTIONS
  if (checkpoint && liveSchema) context.semanticSources = context.semanticSources?.map(source => inspectedObjects.has(source.measure)
    ? structuredClone(liveSchema!.measures.find(measure => measure.name === source.measure)!.semanticSource!) : source)
  let plan: QueryPlan | undefined = checkpoint?.plan
  let plannerTokens = checkpoint?.tokens ?? 0
  let planError = checkpoint?.feedback ?? ''
  let invalidPlans = checkpoint?.invalidPlans ?? 0
  const exploration: { purpose: string; rows: Record<string, unknown>[]; truncated: boolean }[] = checkpoint?.exploration ?? []
  const explorationMeta: { purpose: string; dax: string; rowCount: number; body?: string; sourceMeasure?: string; formats?: PlannedQuery['formats'] }[] = checkpoint?.queryMeta ?? []
  const modelActivity = (step: 1 | 2 | 3, reasoning: string, output: string) => (activity: 'reasoning' | 'output') => {
    input.onProgress?.({ ...biProgress(step, activity === 'reasoning' ? reasoning : output), completedQueries: explorationMeta.length })
  }
  const catalogResults: unknown[] = checkpoint?.catalogResults ?? []
  const refreshBefore = checkpoint ? checkpoint.refreshBefore : refreshResult.status === 'fulfilled' ? refreshResult.value
    : await getLatestRefreshStatus(input.manifest.workspaceId, input.manifest.semanticModelId, input.signal)
  if (refreshBefore && ['Unknown', 'InProgress'].includes(refreshBefore.status)) throw new BiAiError(409, 'MODEL_REFRESH_IN_PROGRESS', 'O modelo está sendo atualizado. Repita a pergunta após a conclusão.')
  const verifyCurrentData = async () => {
    // Every final answer checks the refresh live. The definition is the synchronized snapshot
    // (revalidated every 15 minutes); a newer one seen by this server still blocks the answer.
    const [refresh, schema] = await Promise.all([
      getLatestRefreshStatus(input.manifest.workspaceId, input.manifest.semanticModelId, input.signal),
      publishedSchema(input.manifest.workspaceId, input.manifest.semanticModelId, input.manifest.reportId),
    ])
    if (liveSchema && (liveSchema.modelHash !== schema.modelHash || liveSchema.reportHash !== schema.reportHash)) {
      throw new BiAiError(409, 'MODEL_CHANGED', 'A definição do modelo ou relatório mudou durante a análise. Refaça a pergunta.')
    }
    const stamp = (entry: typeof refresh) => entry && [entry.requestId, entry.status, entry.startTime, entry.endTime].join('|')
    if (stamp(refreshBefore) !== stamp(refresh)) throw new BiAiError(409, 'MODEL_REFRESH_CHANGED', 'A atualização do modelo mudou durante a análise. Repita a pergunta.')
    return refresh
  }
  const continueAnalysis = (plan?: QueryPlan) => {
    if (!liveSchema) throw new BiAiError(503, 'LIVE_SCHEMA_UNAVAILABLE', 'A definição atual do modelo está indisponível.')
    const round = (checkpoint?.round ?? 0) + 1
    if (round > 32) throw new BiAiError(502, 'ANALYSIS_INCOMPLETE', 'A investigação não conseguiu concluir a pergunta. Detalhe o recorte para continuar.')
    return { conversationId, continuationToken: issueAnalysisCheckpoint({ userId: input.userId, dashboardId: input.dashboard.id,
      conversationId, question: message, modelHash: liveSchema.modelHash, reportHash: liveSchema.reportHash,
      issuedAt: Date.now(), started, round, inspected: [...inspectedObjects], exploration, queryMeta: explorationMeta,
      tokens: plannerTokens, feedback: planError, invalidPlans, refreshBefore, catalogResults,
      ...(answerKey ? { cacheKey: answerKey } : {}), ...(plan ? { plan } : {}) }), queries: [], assumptions: [] }
  }
  const executePlanned = async (query: PlannedQuery) => {
    const prepared = prepareSemanticQuery({ ...query, context: executionContext(), manifest: input.manifest, results: exploration })
    const shaped = prepared.sourceMeasure ? { dax: prepared.dax } : prepareGroupedExecution(prepared.dax, query.maxRows)
    const execution = { ...shaped, dax: reuseRowCalculations(shaped.dax) }
    const read = async (dax: string) => {
      const began = Date.now()
      try {
        const rows = await executeDaxQuery({ workspaceId: input.manifest.workspaceId, semanticModelId: input.manifest.semanticModelId,
          dax, signal: input.signal })
        await recordQueryLog({ userId: input.userId, dashboardId: input.dashboard.id, semanticModelId: input.manifest.semanticModelId,
          dax: auditResultQuery(dax), durationMs: Date.now() - began, rowCount: rows.length, status: 'success' })
        return rows
      } catch (error) {
        await recordQueryLog({ userId: input.userId, dashboardId: input.dashboard.id, semanticModelId: input.manifest.semanticModelId,
          dax: auditResultQuery(dax), durationMs: Date.now() - began, rowCount: 0, status: 'error', errorCode: error instanceof PowerBiQueryError ? error.code : 'UNKNOWN' })
        throw error
      }
    }
    const raw = await readWithCapacityFallback(execution.dax, read, () => input.onProgress?.(biProgress(2,
      'A consulta excedeu a memória do BI. Dividindo os cálculos em leituras menores, com as mesmas fórmulas e filtros.')))
    const normalized = normalizeGroupedRows(raw, execution, message), result = trimResults(normalized.rows, query.maxRows)
    return { query: { ...query, dax: auditResultQuery(execution.dax), body: prepared.body, sourceMeasure: prepared.sourceMeasure }, ...result, blankGroupsExcluded: normalized.blankGroupsExcluded }
  }
  const loadRequestedReportFacts = async (requests: NonNullable<QueryPlan['reportRequests']>) => {
    if (!liveSchema) throw new Error('A definição publicada está indisponível.')
    const contracts = validateReportReferences(currentManifest, liveSchema)
    return mapConcurrent(requests, 3, async request => {
      const contract = contracts.find(contract => contract.measure === request.measure)
      if (!contract) throw new Error('Esta fonte não possui contrato de KPI. Use as regras DAX ou medidas do modelo.')
      const began = Date.now(), loaded = await loadReportFacts(input.manifest, contract, request.scope, request.metricIds, input.signal)
      await recordQueryLog({ userId: input.userId, dashboardId: input.dashboard.id, semanticModelId: input.manifest.semanticModelId,
        dax: loaded.dax, durationMs: Date.now() - began, rowCount: 1, status: 'success' })
      return { ...loaded, contract, scope: request.scope }
    }, input.signal)
  }
  for (let attempt = 0; !plan && attempt < 32; attempt++) {
    const feedback = planError ? `Retorno do servidor: ${planError}. Use o catálogo e o formato DAX permitido.` : ''
    input.onProgress?.(biProgress(exploration.length ? 2 : 1, exploration.length
      ? 'A IA está analisando os dados investigados e preparando as próximas consultas.' : 'A IA está lendo as regras do modelo e planejando as consultas desta pergunta.'))
    const response = await conversarEtapa(config, 'planejamento', [
      { role: 'system', content: plannerSystem },
      { role: 'user', content: JSON.stringify({ dashboard: input.dashboard.name,
        context: plannerContext(), verifiedReportRules: plannerReferences() }) },
      { role: 'user', content: JSON.stringify({
        question: message,
        currentDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()),
        history,
        exploration,
        verifiedResults: resultCatalog(exploration, input.manifest),
        catalogResults,
        feedback,
      }) },
    ], { temperatura: 0, sessao: session,
      reasoningEffort: plannerEffort(config, hasCertified), signal: input.signal, jsonObrigatorio: true,
      onActivity: modelActivity(exploration.length ? 2 : 1, 'A IA está analisando as regras para escolher as próximas consultas.', 'A IA está concluindo o plano das próximas consultas.') })
    plannerTokens += response.tokens
    try {
      const candidate = parsePlan(response.texto ?? '', executionContext(), input.manifest, message, exploration)
      if (candidate.catalogSearch) {
        const terms = candidate.catalogSearch.map(normalizeTerm)
        const matches = (object: { name: string; description: string; synonyms: string[] }) => terms.some(term =>
          normalizeTerm([object.name, object.description, ...object.synonyms].join(' ')).includes(term))
        catalogResults.push({ terms: candidate.catalogSearch,
          tables: input.manifest.tables.filter(matches).map(table => ({ name: table.name, description: table.description })),
          columns: input.manifest.tables.flatMap(table => table.columns).filter(matches).map(column => ({
            table: column.table, name: column.name, description: column.description, dataType: column.dataType })),
          measures: input.manifest.measures.filter(matches).map(measure => ({ table: measure.table, name: measure.name, description: measure.description })),
        })
        planError = 'Busca no catálogo completo concluída. Inspecione os nomes exatos ou consulte os campos encontrados.'
        return continueAnalysis()
      }
      if (candidate.reportRequests && candidate.reportExploratory) {
        input.onProgress?.(biProgress(2, 'Consultando os valores dos indicadores nos próprios visuais publicados.'))
        let loaded: Awaited<ReturnType<typeof loadRequestedReportFacts>>
        try { loaded = await loadRequestedReportFacts(candidate.reportRequests) }
        catch (error) {
          if (!(error instanceof ReportEvidenceError)) throw error
          planError = `O visual não aceita esse recorte (${error.message}). Consulte as medidas do modelo com DAX.`
          return continueAnalysis()
        }
        exploration.push(...loaded.map(result => ({ purpose: `KPIs de ${result.contract.measure}`, rows: result.facts.map(fact => ({
          metric: fact.metricId, label: fact.label, value: fact.value, scope: fact.scope, format: fact.format })), truncated: false })))
        explorationMeta.push(...loaded.map(result => ({ purpose: `KPIs de ${result.contract.measure}`, dax: result.dax, rowCount: 1 })))
        planError = 'Indicadores conferidos no visual. Conclua a análise solicitada.'
        return continueAnalysis()
      }
      if (candidate.inspect) {
        // A visual is a DAX program: first inspect its rule catalog, then request
        // exact variable/dependency slices instead of resending every calculation.
        const names = candidate.inspect.map(name => executionContext().semanticSources?.some(source => source.measure === name && usesPublishedDataRule(source.variables))
          ? `${name}::catalog` : name)
        const sourceNames = new Set(candidate.inspect.map(name => name.toLowerCase()))
        const priorSources = new Map(context.semanticSources?.map(source => [source.measure, source]))
        const expanded = inspectCatalog(context, input.manifest, candidate.inspect)
        contextLimit = Math.min(700_000, contextLimit + 100_000)
        context = liveSchema ? withPublishedSchema(expanded, input.manifest, liveSchema, contextLimit) : expanded
        if (liveSchema) context.semanticSources = context.semanticSources?.map(source => sourceNames.has(source.measure.toLowerCase())
          ? structuredClone(liveSchema!.measures.find(measure => measure.name === source.measure)!.semanticSource!) : priorSources.get(source.measure) ?? source)
        names.forEach((name) => inspectedObjects.add(name))
        planError = `Inspeção concluída de ${candidate.inspect.join(', ').slice(0, 200)}. ${candidate.reason}`
        return continueAnalysis()
      }
      if (candidate.exploratory) {
        input.onProgress?.(biProgress(2, 'A IA está investigando os dados e conferindo as regras publicadas do modelo.'))
        try {
          const results = await mapConcurrent(candidate.queries, 3, executePlanned, input.signal)
          exploration.push(...results.map(result => ({ purpose: result.query.purpose, rows: result.rows, truncated: result.truncated })))
          explorationMeta.push(...results.map(result => ({ purpose: result.query.purpose, dax: result.query.dax, rowCount: result.rowCount,
            body: result.query.body, sourceMeasure: result.query.sourceMeasure, formats: result.query.formats })))
          // Measured: some questions wandered through 10–20 tiny explorations. After a few, ask for a conclusion.
          planError = exploration.length >= 6
            ? `Exploração executada (${exploration.length} consultas até aqui). Na maioria dos casos os dados já bastam: conclua agora com a consulta final ou answer-from-results; explore de novo só se faltar um dado indispensável.`
            : 'Exploração executada. Analise as linhas reais e conclua ou investigue o que falta.'
        } catch (error) {
          if (!(error instanceof PowerBiQueryError) || error.code !== 'INVALID_DAX') throw error
          planError = `Exploração recusada pelo modelo: ${error.message.slice(0, 700)}. Corrija a consulta mantendo a intenção.`
        }
        return continueAnalysis()
      }
      plan = candidate
      break
    }
    catch (error) {
      const expanded = expandContextFromPlan(context, input.manifest, response.texto ?? '')
      if (expanded !== context) {
        context = expanded
        try { plan = parsePlan(response.texto ?? '', executionContext(), input.manifest, message, exploration); break }
        catch { /* The retry receives the enriched metadata. */ }
      }
      const draft = response.texto ?? ''
      console.error('[bi-ai] invalid query plan:', error, {
        length: draft.length, startsWithBrace: draft.trimStart().startsWith('{'),
        fenced: /^```/i.test(draft.trimStart()), hasAnswerable: /answerable/i.test(draft),
        hasQueries: /queries/i.test(draft), hasAction: /action/i.test(draft),
      })
      planError = error instanceof Error ? error.message.slice(0, 240) : 'DAX inválido'
      invalidPlans++
      if (invalidPlans >= 4) throw new BiAiError(502, 'INVALID_PLAN', 'A IA não conseguiu gerar uma consulta válida para esta pergunta.')
      return continueAnalysis()
    }
  }
  if (!plan) throw new BiAiError(502, 'INVALID_PLAN', 'A IA não conseguiu planejar a consulta.')
  if (plan.clarification) {
    if (clarificationCount >= 2) {
      const answer = `Ainda falta contexto para consultar este BI com segurança: ${plan.clarification.question} Refaça a pergunta com esses detalhes.`
      await save({ ...input, conversationId, message, answer, queries: [], provider: provider.id,
        model: config.modelo, tokens: plannerTokens, started, cacheable: false })
      return { conversationId, answer, queries: [], assumptions: [] }
    }
    return ask(plan.clarification, message, clarificationCount + 1)
  }
  if (!plan.answerable) {
    const answer = 'Este BI não contém informações suficientes para responder com segurança. Tente uma pergunta sobre as medidas e dimensões deste relatório.'
    await save({ ...input, conversationId, message, answer, queries: [], provider: provider.id,
      model: config.modelo, tokens: plannerTokens, started, cacheable: false })
    return { conversationId, answer, queries: [], assumptions: [] }
  }
  if (plan.answerResults) {
    const queryIndexes = [...new Set(plan.answerResults.map(selection => selection.index))]
    const unreviewed = queryIndexes.flatMap(index => {
      const meta = explorationMeta[index]
      if (!meta || !meta.body && /^DEFINE\b/i.test(meta.dax.trim()) || !liveSchema?.measures.some(measure => measure.semanticSource)
        || !/\b(?:TOPN|SUM|SUMX|GROUPBY|SUMMARIZECOLUMNS|DISTINCTCOUNT|COUNTROWS|AVERAGE)\b/i.test(maskDax(meta.body ?? meta.dax))) return []
      return [{ purpose: exploration[index]?.purpose ?? meta.purpose, dax: meta.body ?? meta.dax, sourceMeasure: meta.sourceMeasure,
        maxRows: Math.max(100, exploration[index]?.rows.length ?? 100), formats: meta.formats }]
    })
    if (unreviewed.length) return continueAnalysis({ ...plan, answerResults: undefined, queries: unreviewed })
    const selected = plan.answerResults.map(selection => {
      const source = exploration[selection.index]
      if (!source) throw new BiAiError(502, 'ANSWER_SOURCE_MISSING', 'A IA selecionou uma fonte que ainda não foi consultada.')
      let rows = source.rows.map(row => ({ ...row }))
      if (selection.sort) {
        const { field, descending } = selection.sort
        if (rows.some(row => !Object.hasOwn(row, field))) throw new BiAiError(502, 'ANSWER_FIELD_MISSING', 'O campo de ordenação não está na fonte consultada.')
        rows.sort((a, b) => {
          const left = a[field], right = b[field]
          const delta = typeof left === 'number' && typeof right === 'number' ? left - right : String(left ?? '').localeCompare(String(right ?? ''), 'pt-BR', { numeric: true })
          return descending ? -delta : delta
        })
      }
      if (selection.limit) rows = rows.slice(0, selection.limit)
      if (selection.fields) rows = rows.map(row => Object.fromEntries(selection.fields!.map(field => {
        if (!Object.hasOwn(row, field)) throw new BiAiError(502, 'ANSWER_FIELD_MISSING', 'Um campo escolhido não está na fonte consultada.')
        return [field, row[field]]
      })))
      return { purpose: selection.title, rows, truncated: source.truncated, formats: explorationMeta[selection.index]?.formats }
    })
    const refresh = await verifyCurrentData()
    const answer = [answerContext(plan.explanation, `A análise reúne os registros consultados no relatório ${escapeMarkdown(input.dashboard.name)}. Os resultados abaixo usam o recorte investigado e mantêm a associação entre cada item e seu valor.`),
      resumoLegivel(selected), ...(refresh?.status === 'Failed' ? ['> ⚠️ A última atualização falhou. Estes são os dados disponíveis no modelo Power BI.'] : []),
      SOURCE_SECTION, `- **Fonte:** ${escapeMarkdown(input.dashboard.name)}, consultado no Power BI.`,
      ...selected.map(result => `- **Consulta:** ${escapeMarkdown(result.purpose)}`)].join('\n\n')
    input.onProgress?.(biProgress(3, 'Conferindo os registros e os valores já consultados antes de responder.'))
    await save({ ...input, conversationId, message, answer, queries: explorationMeta, provider: provider.id, model: config.modelo, tokens: plannerTokens, started })
    return { conversationId, answer, queries: explorationMeta.map(({ purpose, rowCount }) => ({ purpose, rowCount })), assumptions: [], truncated: selected.some(result => result.truncated) }
  }
  if (plan.reportRequests && !checkpoint?.plan) return continueAnalysis(plan)
  if (plan.reportRequests) {
    input.onProgress?.(biProgress(2, 'Consultando os indicadores solicitados na fonte publicada do BI.'))
    let loaded: Awaited<ReturnType<typeof loadRequestedReportFacts>>
    try { loaded = await loadRequestedReportFacts(plan.reportRequests) }
    catch (error) {
      // A visual reads only the cuts it publishes; any other cut goes back to the planner, which can use DAX.
      if (!(error instanceof ReportEvidenceError)) throw error
      planError = `O visual não aceita esse recorte (${error.message}). Consulte as medidas do modelo com DAX.`
      return continueAnalysis()
    }
    const refresh = await verifyCurrentData()
    const counts = new Map<string, number>()
    loaded.flatMap(result => result.facts).forEach(fact => counts.set(fact.label, (counts.get(fact.label) ?? 0) + 1))
    const displaySource = (measure: string) => measure.replace(/^KPI_/i, '').replace(/^HTML_Detalhamento_/i, '').replaceAll('_', ' ')
    const facts: ReportFact[] = loaded.flatMap(result => result.facts.map(fact => ({ ...fact,
      label: counts.get(fact.label)! > 1 ? `${fact.label} (${displaySource(result.contract.measure)})` : fact.label })))
    const formatted = formatVerifiedAnswer({ facts, insights: [], pages: [...new Set(loaded.map(result => result.contract.page))],
      notes: loaded.flatMap(result => result.contract.notes), refreshFailed: refresh?.status === 'Failed' })
    const groups = loaded.map(result => `### ${escapeMarkdown(displaySource(result.contract.measure))}\n\n${result.facts
      .map(fact => `- **${escapeMarkdown(fact.label)}:** ${formatReportValue(fact)}`).join('\n')}`)
    const answer = loaded.length === 1 ? formatted : [formatted.split('### Valores conferidos')[0].trim(), '### Valores conferidos',
      ...(refresh?.status === 'Failed' ? ['> ⚠️ A última atualização falhou. Estes são os dados que permanecem publicados no BI.'] : []),
      ...groups, formatted.slice(formatted.indexOf(SOURCE_SECTION))].join('\n\n')
    const queries = [...explorationMeta, ...loaded.map(result => ({ purpose: `Indicadores em ${result.contract.measure}`, dax: result.dax, rowCount: 1 }))]
    input.onProgress?.(biProgress(3, 'Conferindo os valores com as fontes publicadas do relatório.'))
    await save({ ...input, conversationId, message, answer, queries, provider: provider.id, model: config.modelo, tokens: plannerTokens, started })
    return { conversationId, answer, queries: queries.map(({ purpose, rowCount }) => ({ purpose, rowCount })), assumptions: [], truncated: false,
      evidence: { modelHash: liveSchema!.modelHash, reportHash: liveSchema!.reportHash,
        scope: loaded[0].scope, values: facts.map(({ metricId, label, value, precision, scope }) => ({ metricId, label, value, precision, scope })) } }
  }
  if (!checkpoint?.plan && plan.queries.length) return continueAnalysis(plan)

  if (!plan.reviewed && plan.queries.length && liveSchema) {
    const expressions = plan.queries.map(query => query.dax).join('\n')
    const declaredSources = plan.queries.flatMap(query => liveSchema!.measures.find(measure => measure.name === query.sourceMeasure)?.semanticSource ?? [])
    const derivesResults = plan.queries.some(query => /\b_bi_result_\d+\b/.test(maskDax(query.dax)))
    const focusedSources = derivesResults ? liveSchema.measures.flatMap(measure => measure.semanticSource
      && [...inspectedObjects].some(name => name.split('::')[0] === measure.name) ? [measure.semanticSource] : []) : []
    const relevant = declaredSources.length ? [...new Set(declaredSources)] : focusedSources.length ? focusedSources : liveSchema.measures.flatMap(measure => measure.semanticSource ? [measure.semanticSource] : [])
      .filter(source => source.variables.some(variable => variable.expression && input.manifest.tables.some(table =>
        expressions.toLowerCase().replaceAll("'", '').includes(`${table.name.toLowerCase()}[`)
        && variable.expression.toLowerCase().replaceAll("'", '').includes(`${table.name.toLowerCase()}[`))))
    const preparedQueries = plan.queries.map(query => prepareSemanticQuery({ ...query, context: executionContext(), manifest: input.manifest, results: exploration }))
    const pending = plan.queries.some(query => /\b(?:TOPN|SUM|SUMX|GROUPBY|SUMMARIZECOLUMNS|DISTINCTCOUNT|COUNTROWS|AVERAGE|MIN|MAX)\b/i.test(maskDax(query.dax)))
      || declaredSources.length > 0 || derivesResults
    const sourceBacked = preparedQueries.every(query => usesPublishedDataRule(query.variables))
    // Queries built on the server-injected published rule need no second AI pass under 'risco';
    // free DAX that re-implements a rule, or derives from earlier results, is still reviewed.
    const certifiedPlan = hasCertified && plan.queries.every(query => certifiedOnly(query.dax, input.manifest))
    const reviewNeeded = !(reviewPolicy() === 'risco' && (sourceBacked || certifiedPlan) && !derivesResults)
    if (reviewNeeded && pending && (sourceBacked || relevant.length)) {
      const sourceRules = sourceBacked ? preparedQueries.map(prepared => {
        const source = executionContext().semanticSources!.find(source => source.measure === prepared.sourceMeasure)!
        const fields = sourceTableFields(source), used = new Set(prepared.variables.map(variable => variable.name))
        return { measure: source.measure, description: source.description.slice(0, 1600),
          variables: prepared.variables.map(({ name, expression }) => ({ name, expression, fields: fields.get(name) })),
          sourceAggregations: publishedAggregations(source).filter(aggregate => used.has(aggregate.base)),
        }
      }) : undefined
      const rankedRules = rankSemanticSources(relevant, message, currentReportRules)
      const ordered = rankedRules.map(source => ({ measure: source.measure, table: source.table,
        description: source.description.slice(0, inspectedObjects.has(source.measure) ? undefined : 2500),
        variables: source.variables.map(({ name, expression }) => ({ name, expression })),
      }))
      let size = 0
      const sources = ordered.filter((source, index) => { const bytes = JSON.stringify(source).length;
        if (index && !inspectedObjects.has(source.measure) && size + bytes > 42_000) return false; size += bytes; return true })
      input.onProgress?.(biProgress(2, 'Conferindo as regras do relatório antes de executar as consultas.'))
      const review = await conversarEtapa(config, 'revisao', [
        { role: 'system', content: `Revise o plano DAX antes de executar. Retorne somente JSON. A pergunta é o objetivo; as regras são a definição atual do modelo publicado. Confira se CADA consulta responde ao pedido, preserva status, data do evento, chaves, deduplicação, grão, filtros, arredondamento por registro e ordenação. SUM(Valor) com ROUND só no final pode diferir de SUMX(tabela, ROUND(Valor, 2)) usado no visual. Use a expressão publicada para o indicador; outro recorte explicitamente pedido é válido e deve ser declarado. Uma medida auxiliar de nome parecido não redefine a fórmula do visual. missingTables indica dependência quebrada. Uma medida HTML é apresentação. Variáveis escalares não são reavaliadas ao mudar filtros; a expressão deve estar dentro do contexto do período. Em iteradores, filtros explícitos não podem apagar a dimensão que está sendo comparada. Projeção precisa de método e horizonte explícitos, inclui o restante do mês corrente ou projeta desde o último mês fechado sem contar o parcial novamente; gap sozinho não é previsão. Não acrescente novos cenários, consultas ou métricas por iniciativa própria. Se o plano já é adequado, retorne SOMENTE {"approved":true}, sem repetir ou reescrever o plano. Se houver erro concreto, retorne {"approved":false,"issues":[{"queryIndex":0,"reason":"problema encontrado"}],"queries":[todas as consultas originais, corrigindo apenas as identificadas],"assumptions":[]}. Preserve a quantidade, o objetivo, explanation e formats; se mudar uma regra ou método, ajuste também a explicação. Percentuais em formats têm type percent e percentScale ratio ou points conforme o DAX. Não peça esclarecimento sobre informação já disponível.` },
        { role: 'user', content: JSON.stringify({ question: message, plan,
          context: sourceBacked ? undefined : plannerContext(),
          ...(derivesResults ? { verifiedResults: resultCatalog(exploration, input.manifest), resultProvenance: explorationMeta, results: exploration } : {}),
          nativeInputs: nativeMeasureRules([expressions, ...(derivesResults ? explorationMeta.map(query => query.body ?? query.dax) : []),
            ...(sourceRules ?? sources).flatMap(source => source.variables.map(variable => variable.expression))], liveSchema, input.manifest),
          publishedRules: sourceRules ?? sources, visualIndicators: plannerReportReferences(currentReportRules, [...new Set((sourceRules ?? sources).map(source => source.measure))]) }) },
      ], { temperatura: 0, sessao: session, reasoningEffort: plannerEffort(config, hasCertified), jsonObrigatorio: true, signal: input.signal,
        onActivity: modelActivity(2, 'A IA está conferindo os filtros e cálculos com as fórmulas publicadas.', 'A conferência das regras está sendo concluída.') })
      plannerTokens += review.tokens
      try {
        return continueAnalysis(parseReviewedPlan(review.texto ?? '', plan, executionContext(), input.manifest, message, exploration))
      } catch (error) {
        planError = `A revisão das consultas precisa ser corrigida: ${error instanceof Error ? error.message : 'plano inválido'}`
        return continueAnalysis()
      }
    }
    plan.reviewed = true
  }

  const queryResults: { query: PlannedQuery; rows: Record<string, unknown>[]; truncated: boolean; rowCount: number }[] = []
  async function repairQuery(failed: PlannedQuery, cause: PowerBiQueryError) {
    let rejectedDax = failed.dax
    let reason = cause.message.slice(0, 350)
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await conversarEtapa(config, 'correcao', [
        { role: 'system', content: `${plannerSystem}\nEsta consulta foi recusada pelo Power BI. Retorne uma consulta final corrigida, preservando intenção e filtros. Se a medida depender de uma tabela inexistente, use a regra ou fonte válida do próprio visual publicado, e não outra métrica. Pode declarar sourceMeasure para usar as variáveis da definição publicada. Não repita a consulta ou medida que falhou.` },
        { role: 'user', content: JSON.stringify({ question: message, context: plannerContext(), rejectedDax,
          powerBiError: reason, previousQueries: plan!.queries.filter(query => query !== failed).map(query => query.purpose) }) },
      ], { temperatura: 0, sessao: session,
        reasoningEffort: plannerEffort(config, hasCertified), signal: input.signal, jsonObrigatorio: true,
        onActivity: modelActivity(2, 'A IA está corrigindo a consulta com o retorno do Power BI.', 'A correção da consulta está sendo concluída.') })
      plannerTokens += response.tokens
      let candidate: PlannedQuery
      try {
        const repaired = parsePlan(response.texto ?? '', executionContext(), input.manifest, message, exploration)
        if (!repaired.answerable || repaired.queries.length !== 1) throw new Error('Correção sem consulta única.')
        candidate = repaired.queries[0]
      } catch (error) {
        reason = error instanceof Error ? error.message.slice(0, 240) : 'Plano inválido'
        continue
      }
      try {
        return await executePlanned(candidate)
      } catch (error) {
        if (!(error instanceof PowerBiQueryError) || error.code !== 'INVALID_DAX') throw error
        rejectedDax = candidate.dax
        reason = error.message.slice(0, 350)
      }
    }
    return null
  }
  let blankGroupsExcluded = false
  input.onProgress?.(biProgress(2, plan.queries.length ? 'Executando as buscas com os filtros informados.' : 'Lendo as definições publicadas dos indicadores.'))
  const completedQueries = await mapConcurrent(plan.queries, 3, async (query) => {
    try {
      return await executePlanned(query)
    } catch (error) {
      if (error instanceof PowerBiQueryError && error.code === 'INVALID_DAX') {
        const repaired = await repairQuery(query, error)
        if (repaired) return repaired
      }
      if (error instanceof PowerBiQueryError) throw new BiAiError(502, error.code, powerBiUserMessage(error))
      throw error
    }
  }, input.signal)
  blankGroupsExcluded = completedQueries.some(result => result.blankGroupsExcluded)
  queryResults.push(...completedQueries)
  const refresh = await verifyCurrentData()
  input.onProgress?.(biProgress(3, 'Analisando os resultados e conferindo a resposta com o modelo.'))
  if (blankGroupsExcluded) plan.assumptions.push('Grupos sem nome foram excluídos da lista.')
  const queryMeta = [...explorationMeta, ...queryResults.map(({ query, rowCount }) => ({ purpose: query.purpose, dax: query.dax, rowCount }))]
  // Plano sem consulta: pergunta sobre o próprio relatório, respondida do contexto.
  const semConsulta = plan.queries.length === 0
  if (!semConsulta && queryResults.every((result) => result.rows.length === 0)) {
    const answer = 'O modelo semântico não retornou dados para esta pergunta e os filtros informados.'
    await save({ ...input, conversationId, message, answer, queries: queryMeta,
      provider: provider.id, model: config.modelo, tokens: plannerTokens, started })
    return { conversationId, answer, queries: queryMeta.map(({ purpose, rowCount }) => ({ purpose, rowCount })), assumptions: plan.assumptions }
  }
  const dataForAnswer = queryResults.map((result) => ({
    purpose: result.query.purpose,
    rows: result.rows,
    rowCount: result.rowCount,
    truncated: result.truncated,
    formats: result.query.formats,
    types: Object.fromEntries(Object.entries(result.rows[0] ?? {}).map(([key, value]) => [key, typeof value])),
  }))
  // Row/field association is authoritative; a generated paragraph must not attach one row's amount to another entity.
  if (!semConsulta) {
    const notes = [notaDeEscopo(message, context), ...plan.assumptions,
      ...dataForAnswer.filter(result => result.purpose.length > 120).map(result => `Consulta: ${result.purpose}`)].filter(Boolean)
    const answer = [answerContext(plan.explanation, `A análise usa os dados publicados do relatório ${escapeMarkdown(input.dashboard.name)}. Os resultados abaixo mostram ${dataForAnswer.map(result => escapeMarkdown(result.purpose)).join('; ')}, considerando os períodos e filtros informados na pergunta.`),
      resumoLegivel(dataForAnswer),
      ...(refresh?.status === 'Failed' ? ['> ⚠️ A última atualização falhou. Estes são os dados disponíveis no modelo Power BI.'] : []),
      SOURCE_SECTION, `- **Fonte:** ${escapeMarkdown(input.dashboard.name)}, consultado no Power BI.`,
      ...notes.map(note => `- ${escapeMarkdown(note)}`)].join('\n\n')
    await save({ ...input, conversationId, message, answer, queries: queryMeta,
      provider: provider.id, model: config.modelo, tokens: plannerTokens, started })
    return { conversationId, answer, queries: queryMeta.map(({ purpose, rowCount }) => ({ purpose, rowCount })),
      assumptions: plan.assumptions, truncated: queryResults.some(result => result.truncated) }
  }
  const explainerSystem = `Explique em português os resultados do Power BI. Use apenas valores presentes nas linhas recebidas. Não invente números, não faça cálculo manual que deveria ser feito no modelo e não some linhas truncadas. Se os dados forem insuficientes, diga isso. Cite o período/filtros somente quando aparecerem na pergunta ou nas linhas. O relatório Publish to web não informa slicers ativos; considere somente filtros descritos pelo usuário.
Quando a pergunta for sobre o PRÓPRIO RELATÓRIO e não houver linhas de resultado, responda com o campo reference: use reportMap para dizer o que cada página mostra e quais filtros ela tem, e as descrições das medidas para explicar indicadores, regras e cuidados. Nesse caso não há números para citar: descreva com palavras.
Explique o significado no negócio. Nomes de variáveis, blocos internos, aliases e códigos de medidas só ajudam quando o usuário pede a fórmula técnica; para os demais pedidos, use os nomes compreensíveis das etapas e indicadores. A unidade R$ pode ser mencionada sem inventar um valor.
Comece com um parágrafo curto que explique o indicador ou a regra em linguagem simples para quem conhece pouco o negócio. Depois organize detalhes com títulos curtos, tópicos e linhas em branco. Use emojis somente quando tiverem função clara, como ⚠️ para um cuidado real; não decore todos os títulos ou itens. Escreva frases completas, sem truncar com reticências. Use tabelas quando ajudarem a comparar dados; mantenha todos os fatos necessários à pergunta. Sem HTML. Retorne SOMENTE JSON: {"answer": string}.`
  const reference = semConsulta ? {
    modelStructure: { tables: input.manifest.tables.length, columns: input.manifest.tables.reduce((count, table) => count + table.columns.length, 0),
      measures: input.manifest.measures.length, tableNames: input.manifest.tables.map(table => table.name) },
    business: context.business,
    businessRules: context.businessRules,
    reportMap: context.reportMap,
    ambiguities: context.ambiguities,
    measures: context.measures.map((measure) => ({ name: measure.name, description: measure.description, expression: measure.publishedExpression })),
    semanticSources: plannerContext().semanticSources,
    catalogResults,
    verifiedReportRules: currentReportRules,
  } : undefined
  let answer = ''
  let tokens = plannerTokens
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await conversarEtapa(config, 'explicacao', [
      { role: 'system', content: explainerSystem },
      { role: 'user', content: JSON.stringify({ question: message, dashboard: input.dashboard.name,
        results: dataForAnswer, assumptions: plan.assumptions, reference,
        correction: attempt ? 'A resposta anterior incluiu um número ausente dos dados. Reescreva usando somente números das linhas.' : undefined }) },
    ], { temperatura: 0, sessao: session,
      reasoningEffort: explainerEffort(config), signal: input.signal, jsonObrigatorio: true,
      onActivity: modelActivity(3, 'A IA está organizando a explicação das regras do relatório.', 'A explicação do relatório está sendo concluída.') })
    tokens += response.tokens
    try {
      answer = parseAnswer(response.texto ?? '')
      // Sem linhas não há o que ancorar: a resposta vem do contexto do relatório.
      if (semConsulta ? !/R\$\s*[-+]?\s*\d/.test(answer) && answerIsGrounded(answer, [[{ reference: JSON.stringify(reference) }]], message)
        : answerIsGrounded(answer, queryResults.map((result) => result.rows), message)) break
      answer = ''
    } catch (error) { console.error('[bi-ai] invalid explanation:', error) }
  }
  if (!answer) {
    answer = semConsulta ? ['Informações publicadas do relatório:', ...context.reportMap,
      ...context.businessRules, ...context.measures.filter(measure => measure.description)
        .map(measure => `${measure.name}: ${measure.description}`)].join('\n')
      : resumoLegivel(dataForAnswer.map(({ purpose, rows, truncated }) => ({ purpose, rows, truncated })))
  }
  // Declara o escopo só em resposta numérica sem período explícito: é onde a
  // divergência com a tela filtrada causaria erro silencioso.
  if (!semConsulta) {
    const nota = notaDeEscopo(message, context)
    if (nota) answer = `${answer}\n\n${nota}`
  }
  await save({ ...input, conversationId, message, answer, queries: queryMeta,
    provider: provider.id, model: config.modelo, tokens, started })
  return {
    conversationId, answer,
    queries: queryMeta.map(({ purpose, rowCount }) => ({ purpose, rowCount })),
    assumptions: plan.assumptions,
    truncated: queryResults.some((result) => result.truncated),
  }
}
