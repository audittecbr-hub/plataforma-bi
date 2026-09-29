import { asRecord, safeText, type BiManifest } from './manifest'
import type { SelectedContext } from './context'
import { validateDax } from './dax-guard'
import type { ClarificationPrompt } from './clarification'
import { normalizeTerm } from './context'

export interface PlannedQuery {
  purpose: string
  dax: string
  maxRows: number
}

export interface QueryPlan {
  answerable: boolean
  intent: string
  reason: string
  objectsUsed: string[]
  queries: PlannedQuery[]
  assumptions: string[]
  clarification?: ClarificationPrompt
  inspect?: string[]
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

/** A data answer needs Power BI rows; only model/report explanations may omit DAX. */
function metadataOnlyQuestion(question: string): boolean {
  const text = normalizeTerm(question)
  if (/\b20\d{2}\b|\b(?:quanto|valor|total|ranking|desvio|variacao|mensal|trimestral|comparacao|compare)\b/.test(text)) return false
  return /^(?:o que (?:e|significa|tem|mostra)|como (?:funciona|e calculad[oa])|qual (?:e |a |o )?(?:regra|definicao|formula|pagina|medida)|quais (?:sao )?(?:as |os )?(?:paginas|indicadores|filtros|medidas)|onde (?:fica|encontro|esta)|esse numero (?:considera|inclui|exclui))\b/.test(text)
}

export function parsePlan(text: string, context: SelectedContext, manifest: BiManifest, question: string): QueryPlan {
  const raw = parseObject(text)
  if (raw.action === 'inspect') {
    const inspect = Array.isArray(raw.inspect)
      ? [...new Set(raw.inspect.map((item) => safeText(item, 200)).filter(Boolean))].slice(0, 12) : []
    if (!inspect.length) throw new Error('Inspeção sem nomes de objetos.')
    return { answerable: false, intent: 'Inspecionar modelo publicado', reason: '',
      objectsUsed: [], queries: [], assumptions: [], inspect }
  }
  if (typeof raw.answerable !== 'boolean') throw new Error('Plano sem answerable.')
  const queryLimit = manifest.policy.maxQueries
  const detail = /lista|liste|detalh|top\s*\d|ranking/i.test(question)
  const rowLimit = detail ? manifest.policy.maxRows : Math.min(100, manifest.policy.maxRows)
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
    const requested = Number.isInteger(row.maxRows) ? row.maxRows as number : rowLimit
    const maxRows = Math.min(Math.max(requested, 1), rowLimit)
    validateDax(dax, context, manifest, maxRows)
    return { purpose: safeText(row.purpose, 160) || 'Consulta', dax, maxRows }
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
    assumptions: Array.isArray(raw.assumptions)
      ? raw.assumptions.map((item) => safeText(item, 150)).filter(Boolean).slice(0, 5) : [],
  }
}

export function trimResults(rows: Record<string, unknown>[], maxRows: number) {
  const trimmed: Record<string, string | number | boolean | null>[] = []
  let bytes = 0
  for (const row of rows.slice(0, maxRows)) {
    const output: Record<string, string | number | boolean | null> = {}
    for (const [key, value] of Object.entries(row).slice(0, 20)) {
      if (value === null || typeof value === 'number' || typeof value === 'boolean') output[key.slice(0, 120)] = value
      else if (typeof value === 'string') output[key.slice(0, 120)] = safeText(value, 250)
    }
    const size = JSON.stringify(output).length
    if (trimmed.length && bytes + size > 8000) break
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
    const tolerance = 0.5 * 10 ** -decimals + 1e-8
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
    ? raw.answer.replace(/<[^>]*>/g, ' ').replace(/[A-Za-z0-9+/]{300,}={0,2}/g, '[conteúdo omitido]').trim().slice(0, 3500)
    : ''
  if (!answer) throw new Error('A IA não devolveu uma explicação.')
  return answer
}
