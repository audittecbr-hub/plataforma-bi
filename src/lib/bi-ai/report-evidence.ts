import { parseFragment } from 'parse5'
import type { BiManifest } from './manifest'
import type { PublishedSchema } from './fabric-schema'
import { normalizeTerm } from './context'

export type ReportExpression =
  | { op: 'sum'; type: string; field: string; at?: 'selected' | 'last' | 'previous'; equals?: Record<string, string>; ignoreProduct?: boolean }
  | { op: 'add' | 'subtract' | 'ratio'; terms: ReportExpression[]; scale?: number }
  | { op: 'html'; label: string; groupClass: string; valueClass: string; fromNote?: boolean }
  | { op: 'html-text'; label: string; slot: 'currency' | 'percent'; occurrence?: number }

export interface ReportMetricReference {
  id: string; label: string; aliases: string[]; format: 'currency' | 'number' | 'percent'
  expression: ReportExpression; decimals?: number
}

export interface ReportReferenceContract {
  version: 1; modelHash: string; semanticHash?: string; reportHash?: string; measure: string; page: string
  source: { kind: 'delimited-html' | 'static-html'; elementId?: string; productDictionaryId?: string;
    fields?: Record<string, string[]>; textFields?: string[]; regionCodes?: Record<string, string>;
    regionLabels?: Record<string, string>; currentMonthVariable?: string; timeField?: string; groupField?: string }
  metrics: ReportMetricReference[]
  notes: string[]
}

export interface ReportScope { months: string[]; region: string | null; products: string[] | null; }
export interface ReportFact { id: string; metricId: string; label: string; value: number | null;
  format: ReportMetricReference['format']; precision: number; scope: string; sourceMeasure?: string; }

export class ReportEvidenceError extends Error {}
const NAME = /^[A-Za-z0-9_ .-]{1,120}$/
const MONTH = /^20\d{2}-(?:0[1-9]|1[0-2])$/
const boundedText = (value: unknown, max = 500): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
const validName = (value: unknown): value is string => typeof value === 'string' && NAME.test(value)

interface Node { tagName?: string; attrs?: { name: string; value: string }[]; childNodes?: Node[]; value?: string }
function attr(node: Node, name: string) { return node.attrs?.find(entry => entry.name === name)?.value ?? '' }
function walk(node: Node): Node[] { return [node, ...(node.childNodes ?? []).flatMap(walk)] }
function text(node: Node): string { return ['style', 'script'].includes(node.tagName ?? '') ? '' : node.value ?? (node.childNodes ?? []).map(text).join(' ') }
function hasClass(node: Node, name: string) { return attr(node, 'class').split(/\s+/).includes(name) }
function root(html: string): Node {
  if (html.length > 4_000_000) throw new ReportEvidenceError('Visual acima do limite de verificação.')
  return parseFragment(html) as unknown as Node
}

/** Declarative references are bound to the exact model and an actual published visual. */
export function validateReportReferences(manifest: BiManifest, schema: PublishedSchema): ReportReferenceContract[] {
  const value = manifest.raw.reportReferences
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 30) throw new ReportEvidenceError('Referências do relatório inválidas.')
  return value.map(raw => {
    const c = raw as ReportReferenceContract
    // A source-only republication keeps the semantic hash; any measure, column or relationship change does not.
    const sameModel = !!c && (c.modelHash === schema.modelHash || typeof c.semanticHash === 'string' && c.semanticHash === schema.semanticHash)
    if (!c || c.version !== 1 || !sameModel || schema.reportHash && c.reportHash !== schema.reportHash
      || !['delimited-html', 'static-html'].includes(c.source?.kind)
      || !boundedText(c.measure, 200) || !boundedText(c.page, 200)
      || !Array.isArray(c.notes) || c.notes.length > 30 || c.notes.some(note => !boundedText(note, 2_000))
      || !Array.isArray(c.metrics) || !c.metrics.length || c.metrics.length > 100
      || !schema.visuals.some(visual => visual.page === c.page && visual.fields.some(field => field.endsWith(`[${c.measure}]`)))) {
      throw new ReportEvidenceError('A referência não corresponde ao visual e à versão publicados.')
    }
    if (c.source.kind === 'delimited-html' && (!c.source.fields || !NAME.test(c.source.elementId ?? ''))) {
      throw new ReportEvidenceError('Fonte tabular do visual inválida.')
    }
    if (c.source.fields && Object.entries(c.source.fields).some(([type, fields]) => !NAME.test(type)
      || !Array.isArray(fields) || !fields.length || fields.length > 100
      || fields.some(field => !validName(field) || ['type', 'month', 'region', 'product'].includes(field))
      || new Set(fields).size !== fields.length)) throw new ReportEvidenceError('Layout do payload inválido.')
    for (const dictionary of [c.source.regionCodes, c.source.regionLabels]) {
      if (dictionary && Object.entries(dictionary).some(([key, value]) => !NAME.test(key) || !boundedText(value, 160))) {
        throw new ReportEvidenceError('Dicionário de regionais inválido.')
      }
    }
    if (c.source.textFields && (!Array.isArray(c.source.textFields) || c.source.textFields.some(field => !validName(field)))) {
      throw new ReportEvidenceError('Campos de texto inválidos.')
    }
    if (c.source.currentMonthVariable && !/^[A-Za-z_][A-Za-z0-9_]{0,100}$/.test(c.source.currentMonthVariable)) {
      throw new ReportEvidenceError('Variável de data inválida.')
    }
    const ids = new Set<string>()
    function expression(e: ReportExpression, depth = 0): void {
      if (!e || depth > 8) throw new ReportEvidenceError('Expressão de referência inválida.')
      if (e.op === 'sum') {
        if (!Object.hasOwn(c.source.fields ?? {}, e.type) || !c.source.fields![e.type].includes(e.field)
          || (e.at && !['selected', 'last', 'previous'].includes(e.at))
          || Object.keys(e.equals ?? {}).some(field => !c.source.fields![e.type].includes(field))) {
          throw new ReportEvidenceError('Campo inexistente no payload do visual.')
        }
      } else if (e.op === 'html') {
        if (![e.groupClass, e.valueClass].every(name => NAME.test(name)) || !boundedText(e.label, 160)) throw new ReportEvidenceError('Seletor do visual inválido.')
      } else if (e.op === 'html-text') {
        if (!e.label || e.label.length > 160 || !['currency', 'percent'].includes(e.slot)
          || e.occurrence !== undefined && (!Number.isInteger(e.occurrence) || e.occurrence < 0 || e.occurrence > 10)) {
          throw new ReportEvidenceError('Marcador do visual inválido.')
        }
      } else if (['add', 'subtract', 'ratio'].includes(e.op)) {
        if (!Array.isArray(e.terms) || e.terms.length < 2 || e.terms.length > 12 || e.op === 'ratio' && e.terms.length !== 2
          || (e.scale !== undefined && (!Number.isFinite(e.scale) || Math.abs(e.scale) > 1_000_000))) {
          throw new ReportEvidenceError('Operação da referência inválida.')
        }
        e.terms.forEach(term => expression(term, depth + 1))
      } else throw new ReportEvidenceError('Operação não suportada na referência.')
    }
    for (const metric of c.metrics) {
      if (!metric || !validName(metric.id) || ids.has(metric.id) || !boundedText(metric.label, 200) || !Array.isArray(metric.aliases)
        || metric.aliases.length > 40 || metric.aliases.some(alias => !boundedText(alias, 200))
        || !['currency', 'number', 'percent'].includes(metric.format)) throw new ReportEvidenceError('Indicador de referência inválido.')
      if (metric.decimals !== undefined && (!Number.isInteger(metric.decimals) || metric.decimals < 0 || metric.decimals > 4)) throw new ReportEvidenceError('Precisão do visual inválida.')
      ids.add(metric.id); expression(metric.expression)
    }
    return c
  })
}

const MONTH_NAMES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export function matchReportMetrics(question: string, contract: ReportReferenceContract): ReportMetricReference[] {
  const q = ` ${normalizeTerm(question)} `
  const matches = contract.metrics.map(metric => ({ metric,
    aliases: [metric.label, ...metric.aliases].map(normalizeTerm).filter(alias => q.includes(` ${alias} `)),
  })).filter(entry => entry.aliases.length)
  const selected = matches.filter(entry => !matches.some(other => other !== entry && entry.aliases.every(alias =>
    other.aliases.some(long => long.length > alias.length && long.includes(alias))))).map(entry => entry.metric)
  if (/\b(?:atingimento|percentual|porcentagem)\b|%/.test(q)) {
    const percent = selected.filter(metric => metric.format === 'percent')
    if (percent.length) return percent
    const level = /\bmeta (\d)\b/.exec(q)?.[1]
    if (selected.length && level) return contract.metrics.filter(metric => metric.format === 'percent'
      && normalizeTerm(metric.label).includes(`meta ${level}`))
    return []
  }
  return selected
}

export function reportScope(question: string, contract: ReportReferenceContract, additionalTerms: string[] = []): ReportScope | null {
  const q = normalizeTerm(question)
  if (/\b(?:cliente|cnpj|cpf|job|bandeira|franquead|forma|modalidade|diario|hoje|ontem|dia)\b/.test(q)) return null
  if (/\bsem (?:a )?regra rt\b|\bregra rt (?:off|desativad)|\bsem repasse\b|\brepasse off\b|\bfundo off\b/.test(q)) return null
  const years = [...new Set(question.match(/\b20\d{2}\b/g) ?? [])]
  if (years.length !== 1) return null
  let months = MONTH_NAMES.flatMap((name, i) => new RegExp(`\\b${name}\\b`).test(q) ? [i + 1] : [])
  for (const match of question.matchAll(/\b(0?[1-9]|1[0-2])[/-](20\d{2})\b/g)) if (match[2] === years[0]) months.push(Number(match[1]))
  for (const match of question.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g)) if (match[1] === years[0]) months.push(Number(match[2]))
  if (/\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/20\d{2}\b/.test(question)) return null
  const ordinal = '(primeiro|segundo|terceiro|quarto|[1-4])'
  const parts = [...q.matchAll(new RegExp(`\\b${ordinal} (trimestre|semestre)\\b`, 'g'))]
  if (/trimestre|semestre/.test(q)) {
    if (parts.length !== 1 || months.length) return null
    const n = ['primeiro', 'segundo', 'terceiro', 'quarto'].indexOf(parts[0][1]) + 1 || Number(parts[0][1])
    const size = parts[0][2] === 'semestre' ? 6 : 3
    if (n > 12 / size) return null
    months = Array.from({ length: size }, (_, i) => (n - 1) * size + i + 1)
  }
  months = [...new Set(months)].sort((a, b) => a - b)
  if (!months.length) months = Array.from({ length: 12 }, (_, i) => i + 1)
  if (months.length === 2 && /\bentre\b|\b(?:a|ate) (?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(q)) {
    months = Array.from({ length: months[1] - months[0] + 1 }, (_, i) => months[0] + i)
  }
  const regions = Object.entries(contract.source.regionLabels ?? {}).filter(([, label]) =>
    ` ${q} `.includes(` ${normalizeTerm(label)} `)).sort((a, b) => b[1].length - a[1].length)
  const region = regions[0]?.[0] ?? null
  if (/\b(?:regional|regiao|operacao|filial|unidade)\b/.test(q) && !region && !/\b(?:todas|todos|geral|consolidado|ranking|por regional)\b/.test(q)) return null
  if (regions.length > 1 && !normalizeTerm(regions[0][1]).includes(normalizeTerm(regions[1][1]))) return null
  if (/\b(?:produto|tributo)\b/.test(q) && !/\btodos (?:os )?(?:produtos|tributos)\b/.test(q)) return null
  const known = new Set(('qual quais quanto quantas quantos o a as os um uma de do da das dos e em no na nos nas para por com sem considerando todos todas total geral consolidado valor valores percentual porcentagem receita resultado periodo ano anos mes meses relatorio modelo tela card cards painel bi informe mostre mostrar me diga retorne trazer traga favor publicado visual pergunta responda explique analise analisar completa completo detalhada detalhado desempenho comparar compare comparacao diferenca variacao evolucao mensal mensais ranking entre ate primeiro segundo terceiro quarto semestre trimestre janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro produto tributo produtos tributos regional regionais regiao regioes operacao operacoes departamento departamentos ativo ativa regra rt esclarecimento usuario').split(' '))
  for (const label of [...contract.metrics.flatMap(metric => [metric.label, ...metric.aliases]), ...Object.values(contract.source.regionLabels ?? {}), ...additionalTerms])
    normalizeTerm(label).split(' ').forEach(word => known.add(word))
  for (const word of 'faca fazer traz foi foram teve tem tinha gostaria saber esta estao eram era quanto vale atingimento percentuais contas'.split(' ')) known.add(word)
  if (q.split(' ').some(word => word && !/^\d+$/.test(word) && !known.has(word))) return null
  // A day or other numeric qualifier must never silently become a whole month/year.
  let withoutKnownNumbers = normalizeTerm(question.replace(/\b20\d{2}-(?:0[1-9]|1[0-2])\b|\b(?:0?[1-9]|1[0-2])[/-]20\d{2}\b|\b20\d{2}\b/g, ''))
    .replace(/\bmeta [1-3]\b|\b[1-4] trimestre\b|\b[1-2] semestre\b/g, '')
  if (region) withoutKnownNumbers = withoutKnownNumbers.replace(normalizeTerm(contract.source.regionLabels![region]), '')
  if (/\b\d+\b/.test(withoutKnownNumbers)) return null
  return { months: months.map(month => `${years[0]}-${String(month).padStart(2, '0')}`), region, products: null }
}

function localized(value: string): number | null {
  if (/^(?:—|–|-|n\/?a)?$/i.test(value.trim())) return null
  if (!/\d/.test(value)) throw new ReportEvidenceError('Valor numérico vazio no visual.')
  const v = value.replace(/R\$|%|\s/g, '').replace(/\./g, '').replace(',', '.')
  const number = Number(v)
  if (!Number.isFinite(number)) throw new ReportEvidenceError('Número inválido no visual.')
  return number
}

export interface PreparedReportHtml {
  contract: ReportReferenceContract
  nodes: Node[]
  rows: Record<string, string | number>[]
  current: string | null
  plain: string
}

/** Parse once per query; the immutable data can serve several scopes in the same request. */
export function prepareReportHtml(html: string, contract: ReportReferenceContract): PreparedReportHtml {
  const doc = root(html), nodes = walk(doc)
  const element = nodes.find(node => attr(node, 'id') === contract.source.elementId)
  const rows: Record<string, string | number>[] = []
  let current: string | null = null
  if (contract.source.kind === 'delimited-html') {
    if (!element) throw new ReportEvidenceError('Payload numérico ausente no visual.')
    if (contract.source.currentMonthVariable) {
      const name = contract.source.currentMonthVariable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const match = new RegExp(`window\\.${name}=['"](20\\d{2}-(?:0[1-9]|1[0-2]))['"]`).exec(html)
      if (!match) throw new ReportEvidenceError('Data de corte do visual ausente.')
      current = match[1]
    }
    for (const line of text(element).trim().split('~')) {
      if (!line) continue
      const cells = line.split('|'), fields = contract.source.fields?.[cells[0]]
      if (!fields || cells.length !== fields.length + 4 || !MONTH.test(cells[1])) throw new ReportEvidenceError('Estrutura do payload divergiu.')
      const row: Record<string, string | number> = { type: cells[0], month: cells[1],
        region: contract.source.regionCodes?.[cells[2]] ?? 'outside', product: cells[3] }
      fields.forEach((field, i) => {
        if (contract.source.textFields?.includes(field)) row[field] = cells[i + 4]
        else {
          const raw = cells[i + 4]
          if (!/^-?(?:\d+(?:[,.]\d*)?|[,.]\d+)$/.test(raw)) throw new ReportEvidenceError('Valor inválido no payload do visual.')
          row[field] = Number(raw.replace(',', '.'))
          if (!Number.isFinite(row[field])) throw new ReportEvidenceError('Valor não finito no payload do visual.')
        }
      })
      rows.push(row)
    }
  }
  return { contract, nodes, rows, current, plain: text(doc).replace(/\s+/g, ' ').trim() }
}

/** Read data embedded by Power BI. HTML and scripts are parsed as data, never executed. */
export function factsFromReportHtml(html: string, contract: ReportReferenceContract, scope: ReportScope,
  metrics: ReportMetricReference[]): ReportFact[] {
  return factsFromPreparedReport(prepareReportHtml(html, contract), scope, metrics)
}

export function factsFromPreparedReport(prepared: PreparedReportHtml, scope: ReportScope,
  metrics: ReportMetricReference[]): ReportFact[] {
  if (!scope.months.length || !scope.months.every(month => MONTH.test(month))) throw new ReportEvidenceError('Período inválido.')
  const { contract, nodes, rows, plain } = prepared
  const current = prepared.current ?? scope.months.at(-1)!
  if (prepared.current && scope.months.some(month => month.slice(0, 4) !== current.slice(0, 4))) throw new ReportEvidenceError('O visual não possui esse ano no seletor.')
  const selected = new Set(scope.months), last = scope.months.at(-1)! > current ? current : scope.months.at(-1)!
  const first = scope.months[0], [year, month] = first.split('-').map(Number)
  const previous = `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`
  function evaluate(e: ReportExpression): { value: number | null; precision: number } {
    if (e.op === 'sum') {
      const period = e.at === 'last' ? last : e.at === 'previous' ? previous : null
      let value = 0
      for (const row of rows) {
        if (row.type !== e.type || (period ? row.month !== period : !selected.has(String(row.month)))
          || (scope.region && row.region !== scope.region)
          || (!e.ignoreProduct && scope.products && !scope.products.includes(String(row.product)))
          || Object.entries(e.equals ?? {}).some(([field, expected]) => row[field] !== expected)) continue
        if (typeof row[e.field] !== 'number') throw new ReportEvidenceError('Campo de texto usado como valor.')
        value += row[e.field] as number
      }
      return { value, precision: 0.005 }
    }
    if (e.op === 'html') {
      const groups = nodes.filter(node => hasClass(node, e.groupClass))
      const cards = groups.flatMap(group => walk(group).filter(node => hasClass(node, 'kpi')))
      const matching = [...new Set(cards)].filter(node => walk(node).some(child => hasClass(child, 'k-label') && normalizeTerm(text(child)) === normalizeTerm(e.label)))
      if (matching.length !== 1) throw new ReportEvidenceError('Indicador ausente ou ambíguo no HTML publicado.')
      const card = matching[0]
      const valueNode = card && walk(card).find(node => hasClass(node, e.valueClass))
      if (!valueNode) throw new ReportEvidenceError('Indicador ausente no HTML publicado.')
      let value = text(valueNode).trim()
      if (e.fromNote) value = /R\$\s*-?[\d.,]+/.exec(value)?.[0] ?? /\d+[,.]\d+%/.exec(value)?.[0] ?? ''
      return { value: localized(value), precision: value.includes('%') ? 0.05 : value.includes(',') ? 0.005 : 0.5 }
    }
    if (e.op === 'html-text') {
      let index = -1
      for (let i = 0; i <= (e.occurrence ?? 0); i++) {
        index = plain.toLocaleUpperCase('pt-BR').indexOf(e.label.toLocaleUpperCase('pt-BR'), index + 1)
        if (index < 0) throw new ReportEvidenceError('Marcador não encontrado no visual.')
      }
      let after = plain.slice(index + e.label.length, index + e.label.length + 140)
      const markers = contract.metrics.map(metric => metric.expression).filter((other): other is Extract<ReportExpression, { op: 'html-text' }> => other.op === 'html-text')
      for (const marker of markers) if (marker.label !== e.label) {
        const boundary = after.toLocaleUpperCase('pt-BR').indexOf(marker.label.toLocaleUpperCase('pt-BR'))
        if (boundary >= 0) after = after.slice(0, boundary)
      }
      const match = (e.slot === 'currency' ? /R\$\s*-?[\d.,]+/ : /-?\d+(?:[,.]\d+)?%/).exec(after)
      if (!match) throw new ReportEvidenceError('Valor não encontrado após o marcador.')
      return { value: localized(match[0]), precision: e.slot === 'percent'
        ? 0.5 * 10 ** -(match[0].match(/[,.](\d+)%/)?.[1].length ?? 0)
        : match[0].includes(',') ? 0.005 : 0.5 }
    }
    const terms = e.terms.map(term => evaluate(term).value)
    if (terms.some(value => value === null)) return { value: null, precision: 0.005 }
    const values = terms as number[]
    const value = e.op === 'add' ? values.reduce((a, b) => a + b, 0)
      : e.op === 'subtract' ? values.slice(1).reduce((a, b) => a - b, values[0])
        : values[1] === 0 ? null : values[0] / values[1] * (e.scale ?? 1)
    return { value, precision: 0.005 }
  }
  return metrics.map((metric, i) => {
    const result = evaluate(metric.expression)
    if (result.value !== null && !Number.isFinite(result.value)) throw new ReportEvidenceError('Resultado não finito no visual.')
    return { id: `f${i}`, metricId: metric.id, label: metric.label, ...result,
      precision: metric.decimals !== undefined ? 0.5 * 10 ** -metric.decimals : result.precision, format: metric.format,
      scope: `${scope.months.join(', ')} · ${scope.region ? contract.source.regionLabels?.[scope.region] ?? scope.region : 'todas as regionais/operações'} · todos os produtos${metric.expression.op === 'sum' && metric.expression.at === 'last' ? ` · corte ${last}` : ''}` }
  })
}

export function formatReportValue(fact: ReportFact): string {
  const decimals = Math.min(4, Math.max(0, Math.round(-Math.log10(fact.precision * 2))))
  const value = fact.value === null ? 'sem base para calcular' :
    new Intl.NumberFormat('pt-BR', fact.format === 'currency' ? { style: 'currency', currency: 'BRL', minimumFractionDigits: decimals, maximumFractionDigits: decimals }
      : { minimumFractionDigits: fact.format === 'percent' ? decimals : 0, maximumFractionDigits: decimals }).format(fact.value)
  return `${value}${fact.value !== null && fact.format === 'percent' ? '%' : ''}`
}

export function formatReportFact(fact: ReportFact): string {
  return `${fact.label}: ${formatReportValue(fact)}`
}
