import { asRecord, safeText, type BiManifest } from './manifest'
import type { SelectedContext } from './context'
import { validateDax } from './dax-guard'
import type { ClarificationPrompt } from './clarification'

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
}

function parseObject(text: string): Record<string, unknown> {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return asRecord(JSON.parse(clean)) }
  catch { throw new Error('A IA não retornou JSON estruturado válido.') }
}

export function parsePlan(text: string, context: SelectedContext, manifest: BiManifest, question: string): QueryPlan {
  const raw = parseObject(text)
  if (typeof raw.answerable !== 'boolean') throw new Error('Plano sem answerable.')
  const complex = /por que|porque|motivo|causa|queda|caiu|variou|compar|explic/i.test(question)
  const queryLimit = Math.min(manifest.policy.maxQueries, complex ? 5 : 3)
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
  const allowed = new Set([
    ...context.tables.map((table) => table.name.toLowerCase()),
    ...context.measures.map((measure) => measure.name.toLowerCase()),
    ...context.measures.filter((measure) => measure.table)
      .map((measure) => `${measure.table}[${measure.name}]`.toLowerCase()),
    ...context.columns.map((column) => `${column.table}[${column.name}]`.toLowerCase()),
  ])
  if (objectsUsed.some((name) => !allowed.has(name.toLowerCase()))) {
    throw new Error('Plano citou objeto fora do contexto autorizado.')
  }
  if (!Array.isArray(raw.queries) || raw.queries.length < 1 || raw.queries.length > queryLimit) {
    throw new Error(`Plano precisa conter de 1 a ${queryLimit} consultas.`)
  }
  const queries = raw.queries.map((item) => {
    const row = asRecord(item)
    const dax = typeof row.dax === 'string' ? row.dax.trim() : ''
    const requested = Number.isInteger(row.maxRows) ? row.maxRows as number : rowLimit
    const maxRows = Math.min(Math.max(requested, 1), rowLimit)
    validateDax(dax, context, manifest, maxRows)
    return { purpose: safeText(row.purpose, 160) || 'Consulta', dax, maxRows }
  })
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
  const raw = parseObject(text)
  const answer = typeof raw.answer === 'string'
    ? raw.answer.replace(/<[^>]*>/g, ' ').replace(/[A-Za-z0-9+/]{300,}={0,2}/g, '[conteúdo omitido]').trim().slice(0, 3500)
    : ''
  if (!answer) throw new Error('A IA não devolveu uma explicação.')
  return answer
}
