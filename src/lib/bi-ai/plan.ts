import { asRecord, safeText, type BiManifest } from './manifest'
import type { SelectedContext } from './context'
import { prepareSemanticQuery } from './semantic-query'
import type { ClarificationPrompt } from './clarification'
import { normalizeTerm } from './context'
import type { ReportScope } from './report-evidence'
import { reconcileVariableSource } from './dax-source'
import { compileSourceAnalysis } from './source-analysis'
import type { VerifiedResult } from './result-query'

export interface PlannedQuery {
  purpose: string
  dax: string
  maxRows: number
  sourceMeasure?: string
  formats?: Record<string, { type: 'number' | 'currency' | 'percent'; percentScale?: 'ratio' | 'points'; decimals?: number }>
}

export interface QueryPlan {
  answerable: boolean
  intent: string
  reason: string
  objectsUsed: string[]
  queries: PlannedQuery[]
  assumptions: string[]
  explanation?: string
  clarification?: ClarificationPrompt
  inspect?: string[]
  catalogSearch?: string[]
  modelInfo?: boolean
  exploratory?: boolean
  reportRequests?: { measure: string; metricIds: string[]; scope: ReportScope }[]
  reportExploratory?: boolean
  reviewed?: boolean
  answerResults?: { index: number; title: string; limit?: number; sort?: { field: string; descending: boolean }; fields?: string[] }[]
}

function parseObject(text: string): Record<string, unknown> {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return asRecord(JSON.parse(clean)) }
  catch {
    // Alguns modelos gratuitos ignoram response_format e envolvem o JSON em
    // uma frase curta ou em markdown. Extraia somente o primeiro objeto JSON;
    // o conteúdo continua validado abaixo antes de chegar ao Power BI.
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try { return asRecord(JSON.parse(clean.slice(start, end + 1))) }
      catch { /* retry with provider feedback */ }
    }
    throw new Error('A IA não retornou JSON estruturado válido.')
  }
}

function queryFormats(value: unknown): PlannedQuery['formats'] {
  const formats: NonNullable<PlannedQuery['formats']> = {}
  for (const [field, definition] of Object.entries(asRecord(value)).slice(0, 100)) {
    const format = asRecord(definition)
    if (!['number', 'currency', 'percent'].includes(String(format.type))
      || format.type === 'percent' && !['ratio', 'points'].includes(String(format.percentScale))
      || format.decimals !== undefined && (!Number.isInteger(format.decimals) || Number(format.decimals) < 0 || Number(format.decimals) > 10)) {
      throw new Error('Formato numérico inválido. Percentuais precisam declarar percentScale ratio ou points.')
    }
    formats[field] = { type: format.type as 'number' | 'currency' | 'percent',
      ...(format.type === 'percent' ? { percentScale: format.percentScale as 'ratio' | 'points' } : {}),
      ...(typeof format.decimals === 'number' ? { decimals: format.decimals } : {}) }
  }
  return Object.keys(formats).length ? formats : undefined
}

function explanationText(value: unknown): string | undefined {
  // Do not cut a sentence in the middle when a provider ignores the short-paragraph instruction.
  return typeof value === 'string' && value.length <= 8000 ? safeText(value, 8000) || undefined : undefined
}

/** A data answer needs Power BI rows; only model/report explanations may omit DAX. */
export function metadataOnlyQuestion(question: string): boolean {
  const text = normalizeTerm(question)
  if (/\b20\d{2}\b|\b(?:quanto|valor|total|ranking|desvio|variacao|mensal|trimestral|comparacao|compare)\b/.test(text)) return false
  return /^(?:o que (?:e|significa|tem|mostra)|como (?:funciona|e calculad[oa])|qual (?:e |a |o )?(?:regra|definicao|formula|pagina|medida)|quais (?:sao )?(?:as |os )?(?:paginas|indicadores|filtros|medidas)|onde (?:fica|encontro|esta)|esse numero (?:considera|inclui|exclui))\b/.test(text)
}

export function parsePlan(text: string, context: SelectedContext, manifest: BiManifest, question: string, results?: VerifiedResult[]): QueryPlan {
  const raw = parseObject(text)
  if (raw.action === 'source-analysis') {
    const query = { ...compileSourceAnalysis(raw, context.semanticSources ?? []), formats: queryFormats(raw.formats) }
    prepareSemanticQuery({ ...query, context, manifest })
    return { answerable: true, intent: 'Cruzamento com fórmulas publicadas', reason: '', objectsUsed: [], queries: [query],
      explanation: explanationText(raw.explanation),
      assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(note => safeText(note, 4000)).filter(Boolean).slice(0, 30) : [] }
  }
  if (raw.action === 'focus-source') {
    if (!Array.isArray(raw.measures) || !raw.measures.length || raw.measures.length > 6
      || raw.measures.some(name => typeof name !== 'string' || !context.semanticSources?.some(source => source.measure === name))) {
      throw new Error('Selecione os nomes exatos das fontes publicadas necessárias.')
    }
    return { answerable: false, intent: 'Selecionar fontes do modelo publicado', reason: '', objectsUsed: [], queries: [], assumptions: [],
      inspect: [...new Set(raw.measures.map(name => `${name}::catalog`))] }
  }
  if (raw.action === 'inspect-source') {
    const sourceName = typeof raw.measure === 'string' ? raw.measure.replace(/^\[|\]$/g, '').trim().toLowerCase() : ''
    let source = context.semanticSources?.find(source => source.measure.toLowerCase() === sourceName)
    if (!source) throw new Error('Fonte publicada inexistente. Use o nome exato do catálogo.')
    if (raw.variables === undefined) return { answerable: false, intent: 'Inspecionar catálogo de regras', reason: '', objectsUsed: [],
      queries: [], assumptions: [], inspect: [`${source.measure}::catalog`] }
    if (!Array.isArray(raw.variables) || !raw.variables.length || raw.variables.length > 100) {
      throw new Error('Informe os nomes exatos das variáveis da fonte publicada.')
    }
    const names = raw.variables.map(value => typeof value === 'string' ? value : safeText(asRecord(value).name, 200))
    const originalSource = source.measure
    source = reconcileVariableSource(context.semanticSources ?? [], source, names)
    const variables = names.map(name => source.variables.find(variable => variable.name.toLowerCase() === name.trim().toLowerCase()))
    const found = variables.filter((variable): variable is NonNullable<typeof variable> => !!variable)
    if (!found.length) throw new Error(`Informe os nomes exatos das variáveis: ${source.variables.map(variable => variable.name).join(', ').slice(0, 1500)}`)
    const missing = names.filter((_, index) => !variables[index])
    return { answerable: false, intent: 'Inspecionar regras publicadas',
      reason: [source.measure !== originalSource ? `Estas variáveis pertencem à fonte ${source.measure}; use este sourceMeasure.` : '',
        missing.length ? `Variáveis ausentes na fonte: ${missing.join(', ')}. Use as definições e campos disponíveis.` : ''].filter(Boolean).join(' '),
      objectsUsed: [], queries: [], assumptions: [], inspect: [...new Set(found.map(variable => `${source.measure}::${variable.name}`))] }
  }
  if (raw.action === 'model-info') return { answerable: true, intent: 'Definições do modelo publicado', reason: '', objectsUsed: [],
    queries: [], assumptions: [], modelInfo: true }
  if (raw.action === 'search-catalog') {
    const terms = Array.isArray(raw.terms) ? raw.terms.map(term => safeText(term, 200)).filter(Boolean).slice(0, 12) : []
    if (!terms.length) throw new Error('Informe o que procurar no catálogo completo do modelo.')
    return { answerable: false, intent: 'Pesquisar o catálogo completo', reason: '', objectsUsed: [], queries: [], assumptions: [], catalogSearch: terms }
  }
  if (raw.action === 'answer-from-results') {
    if (!Array.isArray(raw.results) || !raw.results.length || raw.results.length > 100) throw new Error('Selecione os resultados consultados que respondem à pergunta.')
    const answerResults = raw.results.map(value => {
      const item = asRecord(value), order = asRecord(item.sort)
      if (!Number.isInteger(item.index) || Number(item.index) < 0 || item.limit !== undefined && (!Number.isInteger(item.limit) || Number(item.limit) < 1)
        || item.fields !== undefined && (!Array.isArray(item.fields) || item.fields.some(field => typeof field !== 'string'))) throw new Error('Seleção de resultados inválida.')
      return { index: Number(item.index), title: safeText(item.title, 1000) || 'Dados conferidos',
        ...(typeof item.limit === 'number' ? { limit: item.limit } : {}),
        ...(typeof order.field === 'string' ? { sort: { field: order.field, descending: order.descending !== false } } : {}),
        ...(Array.isArray(item.fields) ? { fields: item.fields as string[] } : {}) }
    })
    return { answerable: true, intent: 'Responder com dados já consultados', reason: '', objectsUsed: [], queries: [], assumptions: [], answerResults,
      explanation: explanationText(raw.explanation) }
  }
  if (raw.action === 'report-facts') {
    if (!Array.isArray(raw.requests) || !raw.requests.length || raw.requests.length > 30) throw new Error('Informe as fontes dos indicadores solicitados.')
    const reportRequests = raw.requests.map(value => {
      const request = asRecord(value), scope = asRecord(request.scope)
      if (typeof request.measure !== 'string' || !Array.isArray(request.metricIds) || !request.metricIds.length
        || request.metricIds.some(id => typeof id !== 'string') || !Array.isArray(scope.months) || !scope.months.length
        || scope.months.some(month => typeof month !== 'string' || !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month))
        || scope.region !== undefined && scope.region !== null && typeof scope.region !== 'string'
        || scope.products !== undefined && scope.products !== null) throw new Error('Fonte ou recorte do indicador inválido. Para outros filtros, use DAX.')
      return { measure: request.measure, metricIds: request.metricIds as string[], scope: {
        months: scope.months as string[], region: typeof scope.region === 'string' ? scope.region : null, products: null,
      } }
    })
    return { answerable: true, intent: 'Indicadores publicados', reason: '', objectsUsed: [], queries: [], assumptions: [], reportRequests,
      reportExploratory: raw.mode === 'explore' }
  }
  if (raw.action === 'inspect') {
    const inspect = Array.isArray(raw.inspect)
      ? [...new Set(raw.inspect.map((item) => safeText(item, 200)).filter(Boolean))].slice(0, 12) : []
    if (!inspect.length) throw new Error('Inspeção sem nomes de objetos.')
    return { answerable: false, intent: 'Inspecionar modelo publicado', reason: '',
      objectsUsed: [], queries: [], assumptions: [], inspect }
  }
  if (raw.action === 'explore') raw.answerable = true
  if (raw.action === 'result-query') raw.answerable = true
  if (typeof raw.answerable !== 'boolean') throw new Error('Plano sem answerable.')
  const queryLimit = 100
  // The model can ask for more detail than the old prompt default; Power BI caps one result at 100k rows.
  const rowLimit = 100_000
  const objectsUsed = Array.isArray(raw.objectsUsed)
    ? raw.objectsUsed.filter((item): item is string => typeof item === 'string').slice(0, 50) : []
  if (!raw.answerable) {
    const clarification = asRecord(raw.clarification)
    const followUp = safeText(clarification.question, 240)
    const options = Array.isArray(clarification.options)
      ? [...new Set(clarification.options.map((item) => safeText(item, 100)).filter(Boolean))].slice(0, 4) : []
    return {
      answerable: false, intent: safeText(raw.intent, 100), reason: safeText(raw.reason, 300),
      objectsUsed: [], queries: [], assumptions: [],
      ...(followUp ? { clarification: { question: followUp, options } } : {}),
    }
  }
  // objectsUsed is explanatory metadata. The actual DAX below is the
  // authoritative source for object validation; models often quote the names
  // in this list differently (e.g. 'Tabela'[Coluna] or [Medida]).
  // Consultas podem ser zero: perguntas sobre o próprio relatório (o que uma página
  // mostra, qual o filtro padrão, o que significa um indicador) são respondidas do
  // contexto, sem executar DAX.
  if (!Array.isArray(raw.queries) || raw.queries.length > queryLimit) {
    throw new Error(`Plano precisa conter no máximo ${queryLimit} consultas.`)
  }
  const queries = raw.queries.map((item) => {
    // OpenCode Go's free models occasionally compress the requested object
    // into a plain DAX string. Accept that shorthand and apply the same guard
    // and row limit as the verbose form.
    const row = typeof item === 'string' ? { dax: item } : asRecord(item)
    const dax = typeof row.dax === 'string' ? row.dax.trim() : ''
    const requested = Number.isInteger(row.maxRows) ? row.maxRows as number : manifest.policy.maxRows
    const maxRows = Math.min(Math.max(requested, 1), rowLimit)
    const sourceMeasure = typeof row.sourceMeasure === 'string' ? row.sourceMeasure.trim() : undefined
    const prepared = prepareSemanticQuery({ dax, maxRows, sourceMeasure, context, manifest, results })
    if (raw.action === 'result-query' && !prepared.resultNames.length) throw new Error('A composição precisa usar resultados já conferidos nesta análise.')
    const formats = queryFormats(row.formats)
    const resolvedSource = prepared.sourceMeasure ?? sourceMeasure
    return { purpose: safeText(row.purpose, 1000) || 'Consulta', dax: prepared.body, maxRows, ...(resolvedSource ? { sourceMeasure: resolvedSource } : {}),
      ...(formats ? { formats } : {}) }
  })
  if (!queries.length && !metadataOnlyQuestion(question)) {
    throw new Error('Uma resposta sobre dados precisa consultar o modelo Power BI com DAX.')
  }
  return {
    answerable: true,
    intent: safeText(raw.intent, 100),
    reason: safeText(raw.reason, 300),
    objectsUsed,
    queries,
    explanation: explanationText(raw.explanation),
    ...(raw.action === 'explore' ? { exploratory: true } : {}),
    assumptions: Array.isArray(raw.assumptions)
      ? raw.assumptions.map((item) => safeText(item, 4000)).filter(Boolean).slice(0, 30) : [],
  }
}

/** An independent reviewer approves a concrete plan or corrects identified queries; it cannot invent another analysis. */
export function parseReviewedPlan(text: string, original: QueryPlan, context: SelectedContext, manifest: BiManifest, question: string, results?: VerifiedResult[]): QueryPlan {
  const raw = parseObject(text)
  if (raw.approved === true) {
    if (raw.queries !== undefined || raw.assumptions !== undefined || raw.explanation !== undefined) throw new Error('A aprovação deve preservar o plano original.')
    return { ...original, reviewed: true }
  }
  if (raw.approved !== false || !Array.isArray(raw.issues) || !raw.issues.length) throw new Error('A revisão deve aprovar ou identificar os problemas das consultas.')
  const indexes = new Set<number>()
  for (const issue of raw.issues) {
    const row = asRecord(issue)
    if (!Number.isInteger(row.queryIndex) || Number(row.queryIndex) < 0 || Number(row.queryIndex) >= original.queries.length || !safeText(row.reason, 2000)) {
      throw new Error('A revisão precisa identificar a consulta e o problema encontrados.')
    }
    indexes.add(Number(row.queryIndex))
  }
  const corrected = parsePlan(JSON.stringify({ ...raw, answerable: true, explanation: raw.explanation ?? original.explanation,
    assumptions: raw.assumptions ?? original.assumptions }), context, manifest, question, results)
  if (!corrected.answerable || corrected.queries.length !== original.queries.length || corrected.exploratory || corrected.reportRequests || corrected.inspect) {
    throw new Error('A revisão deve corrigir as consultas existentes, sem acrescentar outra análise.')
  }
  corrected.queries = corrected.queries.map((query, index) => {
    if (!indexes.has(index) && query.dax !== original.queries[index].dax) throw new Error('A revisão alterou uma consulta sem identificar o problema.')
    return { ...query, formats: query.formats ?? (query.dax === original.queries[index].dax ? original.queries[index].formats : undefined) }
  })
  return { ...corrected, reviewed: true }
}

export function trimResults(rows: Record<string, unknown>[], maxRows: number) {
  const trimmed: Record<string, string | number | boolean | null>[] = []
  let bytes = 0
  for (const row of rows.slice(0, maxRows)) {
    const output: Record<string, string | number | boolean | null> = {}
    for (const [key, value] of Object.entries(row)) {
      if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') output[key] = value
    }
    const size = JSON.stringify(output).length
    if (trimmed.length && bytes + size > 2_000_000) break
    trimmed.push(output)
    bytes += size
  }
  return { rows: trimmed, truncated: rows.length > trimmed.length, rowCount: rows.length }
}

export interface GroupedExecution {
  dax: string
  groupKey?: string
  sortKey?: string
  descending?: boolean
}

/** TOPN selects rows but does not guarantee their presentation order. */
export function prepareGroupedExecution(dax: string, visibleRows: number): GroupedExecution {
  const top = /^(\s*EVALUATE\s+TOPN\s*\(\s*)(\d+)/i.exec(dax)
  const group = /\bSUMMARIZECOLUMNS\s*\(\s*(?:'((?:[^']|'')+)'|([A-Za-z_]\w*))\s*\[([^\]]+)\]/i.exec(dax)
    ?? /\bADDCOLUMNS\s*\(\s*VALUES\s*\(\s*(?:'((?:[^']|'')+)'|([A-Za-z_]\w*))\s*\[([^\]]+)\]/i.exec(dax)
  const sort = /,\s*\[([^\]]+)\]\s*,\s*(ASC|DESC)\s*\)\s*$/i.exec(dax)
  if (!top || !group || !sort) return { dax }
  const table = (group[1] ?? group[2]).replace(/''/g, "'")
  const requested = Number(top[2])
  const fetched = Math.min(500, Math.max(requested, visibleRows) + 10)
  return {
    dax: dax.replace(top[0], `${top[1]}${fetched}`),
    groupKey: `${table}[${group[3]}]`,
    sortKey: sort[1],
    descending: sort[2].toUpperCase() === 'DESC',
  }
}

export function normalizeGroupedRows(rows: Record<string, unknown>[], execution: GroupedExecution,
  question: string): { rows: Record<string, unknown>[]; blankGroupsExcluded: boolean } {
  if (!execution.groupKey || !execution.sortKey) return { rows, blankGroupsExcluded: false }
  const keepBlank = /\b(?:em branco|sem (?:opera[cç][aã]o|categoria|departamento)|n[aã]o atribu[ií]d[oa])\b/i.test(question)
  const filtered = keepBlank ? rows : rows.filter((row) => {
    const value = row[execution.groupKey!]
    return value !== null && value !== undefined && String(value).trim() !== ''
  })
  const key = `[${execution.sortKey}]`
  if (filtered.every((row) => typeof (row[key] ?? row[execution.sortKey!]) === 'number')) {
    filtered.sort((a, b) => {
      const left = Number(a[key] ?? a[execution.sortKey!])
      const right = Number(b[key] ?? b[execution.sortKey!])
      return execution.descending ? right - left : left - right
    })
  }
  return { rows: filtered, blankGroupsExcluded: filtered.length < rows.length }
}

function numericValue(token: string): number | null {
  let value = token.replace(/[%\s]/g, '').replace(/[.,]+$/, '')
  const comma = value.lastIndexOf(',')
  const dot = value.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    value = comma > dot ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '')
  } else if (comma >= 0) {
    value = /,\d{3}$/.test(value) ? value.replace(/,/g, '') : value.replace(',', '.')
  } else if (dot >= 0 && /\.\d{3}$/.test(value)) {
    value = value.replace(/\./g, '')
  }
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

interface DisplayNumber { value: number; decimals: number; percent: boolean }

function numbersIn(text: string): DisplayNumber[] {
  return [...text.matchAll(/(?<![\p{L}\d])[-+]?\d[\d.,]*(?:%)?/gu)]
    .map((match) => {
      const value = numericValue(match[0])
      const decimal = /[.,](\d{1,2})%?$/.exec(match[0])
      return value === null ? null : {
        value, decimals: decimal?.[1].length ?? 0, percent: match[0].endsWith('%'),
      }
    }).filter((number): number is DisplayNumber => number !== null)
}

/** Reject prose containing numbers absent from Power BI results or the user's period/filter. */
export function answerIsGrounded(answer: string, results: Record<string, unknown>[][], question: string): boolean {
  const allowed = numbersIn(question).map((item) => item.value)
  const numberWords: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, três: 3,
    quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 }
  for (const [word, value] of Object.entries(numberWords)) {
    if (new RegExp(`\\b${word}\\b`, 'iu').test(question)) allowed.push(value)
  }
  for (const rows of results) for (const row of rows) for (const value of Object.values(row)) {
    if (typeof value === 'number') allowed.push(value)
    else if (typeof value === 'string') allowed.push(...numbersIn(value).map((item) => item.value))
  }
  return numbersIn(answer).every(({ value, decimals, percent }) => {
    const tolerance = (percent ? 0.5 * 10 ** -decimals : Math.min(0.005, 0.5 * 10 ** -decimals)) + 1e-8
    return allowed.some((item) => Math.abs(item - value) <= tolerance
      || (percent && Math.abs(item * 100 - value) <= tolerance))
  })
}

export function parseAnswer(text: string): string {
  let raw: Record<string, unknown>
  try { raw = parseObject(text) }
  catch {
    // The free OpenCode models can return the explanation as plain text even
    // when response_format=json_object was requested. It is still checked for
    // grounding by the caller before it is shown to the user.
    raw = { answer: text.trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '') }
  }
  const answer = typeof raw.answer === 'string'
    ? raw.answer.replace(/<[^>]*>/g, ' ').replace(/[A-Za-z0-9+/]{300,}={0,2}/g, '[conteúdo omitido]').trim()
    : ''
  if (!answer) throw new Error('A IA não devolveu uma explicação.')
  return answer
}
