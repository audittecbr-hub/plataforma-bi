import { asRecord, safeText, type BiManifest } from './manifest'
import { normalizeTerm } from './context'

type CertifiedMetric = {
  key: string
  label: string
  measure?: string
  sum?: string
  filter?: { field: string; equals: string }
}

type CertifiedRule = {
  id: string
  kind: 'row' | 'monthly' | 'grouped'
  subject: string
  match: { phrases: string[]; allWords: string[]; anyWords: string[]; excludePhrases: string[]; fallbackAllowedPhrases: string[] }
  yearField: string
  monthField?: string
  monthOrderField?: string
  groupField?: string
  maxRows?: number
  format: 'currency' | 'number' | 'percent'
  metrics: CertifiedMetric[]
  derived: { key: string; label: string; add: string[] }[]
  note: string
}

export class CertifiedQueryError extends Error {}

export interface CertifiedPlan {
  id: string
  subject: string
  dax: string
  assumption: string | null
  answer(rows: Record<string, unknown>[]): string
}

function list(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new CertifiedQueryError('Regra semântica inválida.')
  return value.map((item) => safeText(item, 120)).filter(Boolean)
}

function field(manifest: BiManifest, ref: string, aggregated: boolean): string {
  const match = /^([^\[\]]+)\[([^\[\]]+)\]$/.exec(ref)
  if (!match) throw new CertifiedQueryError('Campo certificado inválido.')
  const table = manifest.tables.find((item) => item.name === match[1].replace(/^'|'$/g, ''))
  const column = table?.columns.find((item) => item.name === match[2])
  if (!table?.queryable || !column?.queryable || column.restricted || column.presentationOnly
    || (aggregated && !column.aggregatable)) throw new CertifiedQueryError('Campo certificado não autorizado.')
  return `'${table.name.replace(/'/g, "''")}'[${column.name}]`
}

function measure(manifest: BiManifest, name: string): string {
  const item = manifest.measures.find((candidate) => candidate.name === name)
  if (!item?.queryable || item.restricted || item.presentationOnly || name.includes(']')) {
    throw new CertifiedQueryError('Medida certificada não autorizada.')
  }
  return `[${name}]`
}

function daxString(value: string): string {
  if (!value || value.length > 120 || /[\r\n]/.test(value)) throw new CertifiedQueryError('Valor de filtro inválido.')
  return `"${value.replace(/"/g, '""')}"`
}

function parseRules(manifest: BiManifest): CertifiedRule[] {
  const source = manifest.raw.certifiedQueries
  if (source === undefined) return []
  if (!Array.isArray(source) || source.length > 30) throw new CertifiedQueryError('Catálogo certificado inválido.')
  return source.map((value) => {
    const row = asRecord(value)
    const match = asRecord(row.match)
    const kind = row.kind
    const format = row.format
    const metrics = Array.isArray(row.metrics) ? row.metrics : []
    const derived = Array.isArray(row.derived) ? row.derived : []
    if ((kind !== 'row' && kind !== 'monthly' && kind !== 'grouped') || !['currency', 'number', 'percent'].includes(String(format))
      || !metrics.length || metrics.length > 8 || derived.length > 4) {
      throw new CertifiedQueryError('Regra semântica inválida.')
    }
    const parsedMetrics = metrics.map((entry) => {
      const metric = asRecord(entry)
      const key = safeText(metric.key, 40)
      const label = safeText(metric.label, 100)
      const measureName = safeText(metric.measure, 200)
      const sum = safeText(metric.sum, 200)
      const filter = asRecord(metric.filter)
      if (!/^[a-z][a-z0-9_]*$/.test(key) || !label || (!!measureName === !!sum)) {
        throw new CertifiedQueryError('Métrica certificada inválida.')
      }
      if (measureName) measure(manifest, measureName)
      if (sum) field(manifest, sum, true)
      const filterField = safeText(filter.field, 200)
      const filterValue = safeText(filter.equals, 120)
      if (sum && (!filterField || !filterValue)) throw new CertifiedQueryError('Agregação certificada sem filtro.')
      if (filterField) { field(manifest, filterField, false); daxString(filterValue) }
      return { key, label, measure: measureName || undefined, sum: sum || undefined,
        filter: filterField ? { field: filterField, equals: filterValue } : undefined }
    })
    const keys = new Set(parsedMetrics.map((item) => item.key))
    if (keys.size !== parsedMetrics.length) throw new CertifiedQueryError('Métricas certificadas duplicadas.')
    const parsedDerived = derived.map((entry) => {
      const item = asRecord(entry)
      const key = safeText(item.key, 40)
      const label = safeText(item.label, 100)
      const add = list(item.add, 4)
      if (!/^[a-z][a-z0-9_]*$/.test(key) || !label || keys.has(key)
        || add.length < 2 || add.some((part) => !keys.has(part))) {
        throw new CertifiedQueryError('Cálculo certificado inválido.')
      }
      keys.add(key)
      return { key, label, add }
    })
    const yearField = safeText(row.yearField, 200)
    const monthField = safeText(row.monthField, 200)
    const monthOrderField = safeText(row.monthOrderField, 200)
    const groupField = safeText(row.groupField, 200)
    const maxRows = Number(row.maxRows)
    field(manifest, yearField, false)
    if (kind === 'monthly') {
      if (!monthField || !monthOrderField || parsedMetrics.length !== 1 || parsedDerived.length) {
        throw new CertifiedQueryError('Consulta mensal certificada inválida.')
      }
      field(manifest, monthField, false)
      field(manifest, monthOrderField, false)
    }
    if (kind === 'grouped') {
      if (!groupField || !Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100
        || parsedMetrics.length !== 1 || !parsedMetrics[0].measure || parsedDerived.length) {
        throw new CertifiedQueryError('Consulta agrupada certificada inválida.')
      }
      field(manifest, groupField, false)
    }
    const parsedMatch = {
      phrases: list(match.phrases ?? [], 12), allWords: list(match.allWords ?? [], 12),
      anyWords: list(match.anyWords ?? [], 12), excludePhrases: list(match.excludePhrases ?? [], 12),
      fallbackAllowedPhrases: list(match.fallbackAllowedPhrases ?? [], 12),
    }
    if (!parsedMatch.phrases.length && !parsedMatch.allWords.length) throw new CertifiedQueryError('Regra sem gatilho.')
    return {
      id: safeText(row.id, 60), kind, subject: safeText(row.subject, 100),
      match: parsedMatch, yearField, monthField: monthField || undefined,
      monthOrderField: monthOrderField || undefined,
      groupField: groupField || undefined, maxRows: kind === 'grouped' ? maxRows : undefined,
      format, metrics: parsedMetrics, derived: parsedDerived, note: safeText(row.note, 400),
    } as CertifiedRule
  })
}

export function validateCertifiedQueries(manifest: BiManifest): void {
  parseRules(manifest)
}

function containsPhrase(haystack: string, phrase: string): boolean {
  return ` ${haystack} `.includes(` ${normalizeTerm(phrase)} `)
}

function matches(rule: CertifiedRule, question: string): boolean {
  const normalized = normalizeTerm(question)
  const { phrases, allWords, anyWords, excludePhrases } = rule.match
  // Certified recipes in this version apply to a whole year. An explicit
  // month/quarter must never be silently widened to the entire year.
  const finerPeriod = /\b(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|trimestre|quinzena|semana|dia|hoje|agora|ultimos|ultimas)\b/.test(normalized)
  if (finerPeriod) return false
  return (!phrases.length || phrases.some((phrase) => containsPhrase(normalized, phrase)))
    && allWords.every((word) => containsPhrase(normalized, word))
    && (!anyWords.length || anyWords.some((word) => containsPhrase(normalized, word)))
    && !excludePhrases.some((phrase) => containsPhrase(normalized, phrase))
}

function yearFromQuestion(question: string, currentYear: number): { year: number; assumption: string | null } {
  const years = [...new Set([...question.matchAll(/\b20\d{2}\b/g)].map((match) => Number(match[0])))]
  if (years.length > 1) throw new CertifiedQueryError('Informe um único ano para esta análise.')
  const normalized = normalizeTerm(question)
  if (!years.length && /\bano passado\b/.test(normalized)) return { year: currentYear - 1, assumption: null }
  if (!years.length && /\b(?:este ano|ano atual|ano corrente)\b/.test(normalized)) {
    return { year: currentYear, assumption: null }
  }
  return years.length ? { year: years[0], assumption: null }
    : { year: currentYear, assumption: `Ano ${currentYear} assumido por ser o ano atual.` }
}

function formatValue(value: unknown, format: CertifiedRule['format']): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'sem valor no modelo'
  return new Intl.NumberFormat('pt-BR', format === 'currency'
    ? { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }
    : format === 'percent' ? { style: 'percent', maximumFractionDigits: 2 }
      : { maximumFractionDigits: 2 }).format(value)
}

function rowValue(row: Record<string, unknown>, label: string): unknown {
  return row[`[${label}]`] ?? row[label]
}

export function certifiedPlan(manifest: BiManifest, question: string, currentYear = new Date().getUTCFullYear()): CertifiedPlan | null {
  const rule = parseRules(manifest).find((item) => matches(item, question))
  if (!rule) return null
  const { year, assumption } = yearFromQuestion(question, currentYear)
  const yearDax = field(manifest, rule.yearField, false)
  const expressions = new Map<string, string>()
  for (const item of rule.metrics) {
    const core = item.measure ? measure(manifest, item.measure) : `SUM(${field(manifest, item.sum!, true)})`
    const filters = [item.filter && `${field(manifest, item.filter.field, false)} = ${daxString(item.filter.equals)}`,
      `${yearDax} = ${year}`].filter(Boolean)
    expressions.set(item.key, `CALCULATE(${core}, ${filters.join(', ')})`)
  }
  for (const item of rule.derived) {
    expressions.set(item.key, `(${item.add.map((key) => expressions.get(key)).join(' + ')})`)
  }
  if (rule.kind === 'monthly') {
    const month = field(manifest, rule.monthField!, false)
    const order = field(manifest, rule.monthOrderField!, false)
    const metric = rule.metrics[0]
    const dax = `EVALUATE TOPN(12, SUMMARIZECOLUMNS(${yearDax}, ${order}, ${month}, FILTER(VALUES(${yearDax}), ${yearDax} = ${year}), "${metric.label}", ${measure(manifest, metric.measure!)}), ${order}, ASC)`
    return { id: rule.id, subject: rule.subject, dax, assumption,
      answer(rows) {
        const sorted = [...rows].sort((a, b) => Number(a[rule.monthOrderField!] ?? 0) - Number(b[rule.monthOrderField!] ?? 0))
        const lines = sorted.map((row) => `${String(row[rule.monthField!] ?? 'Mês não identificado')}: ${formatValue(rowValue(row, metric.label), rule.format)}`)
        return `${rule.subject} em ${year}${assumption ? ' (ano atual assumido)' : ''}:\n${lines.join('\n')}${rule.note ? `\n${rule.note}` : ''}`
      } }
  }
  if (rule.kind === 'grouped') {
    const group = field(manifest, rule.groupField!, false)
    const metric = rule.metrics[0]
    const dax = `EVALUATE TOPN(${rule.maxRows}, SUMMARIZECOLUMNS(${group}, FILTER(VALUES(${yearDax}), ${yearDax} = ${year}), FILTER(VALUES(${group}), NOT ISBLANK(${group})), "${metric.label}", ${measure(manifest, metric.measure!)}), ${group}, ASC)`
    return { id: rule.id, subject: rule.subject, dax, assumption,
      answer(rows) {
        const lines = rows.map((row) => `${String(row[rule.groupField!] ?? 'Não identificado')}: ${formatValue(rowValue(row, metric.label), rule.format)}`)
        return `${rule.subject} em ${year}${assumption ? ' (ano atual assumido)' : ''}:\n${lines.join('\n')}${rule.note ? `\n${rule.note}` : ''}`
      } }
  }
  const labels = [...rule.metrics, ...rule.derived]
  const dax = `EVALUATE ROW(${labels.map((item) => `"${item.label.replace(/"/g, '""')}", ${expressions.get(item.key)}`).join(', ')})`
  return { id: rule.id, subject: rule.subject, dax, assumption,
    answer(rows) {
      const row = rows[0] ?? {}
      const lines = labels.map((item) => `${item.label}: ${formatValue(rowValue(row, item.label), rule.format)}`)
      return `${rule.subject} em ${year}${assumption ? ' (ano atual assumido)' : ''}:\n${lines.join('\n')}${rule.note ? `\n${rule.note}` : ''}`
    } }
}

/** Named subjects with curated scope rules must not silently fall back to a general measure. */
export function certifiedScopeMessage(manifest: BiManifest, question: string): string | null {
  const rules = parseRules(manifest)
  if (rules.some((rule) => matches(rule, question))) return null
  for (const rule of rules) {
    if (!rule.match.phrases.some((phrase) => containsPhrase(normalizeTerm(question), phrase))) continue
    if (rule.match.fallbackAllowedPhrases.some((phrase) => containsPhrase(normalizeTerm(question), phrase))) continue
    return `O escopo pedido para ${rule.subject} não tem uma consulta validada neste BI. Informe um único ano e pergunte pelo resultado próprio e pela provisão; não vou usar o resultado geral como substituto.`
  }
  return null
}
