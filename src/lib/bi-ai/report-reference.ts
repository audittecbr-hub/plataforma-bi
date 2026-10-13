import 'server-only'
import { executeDaxQuery, getLatestRefreshStatus, PowerBiQueryError } from '../powerbi'
import { conversar } from '../llm'
import type { ConfigIa } from '../llm-config'
import type { BiManifest } from './manifest'
import type { PublishedSchema } from './fabric-schema'
import { normalizeTerm } from './context'
import { biProgress, type BiProgressReporter } from './progress'
import { formatVerifiedAnswer } from './presentation'
import { mapConcurrent } from './concurrency'
import { validateReportReferences, matchReportMetrics, reportScope, factsFromReportHtml, prepareReportHtml, factsFromPreparedReport,
  ReportEvidenceError, type ReportScope, type ReportReferenceContract, type ReportFact } from './report-evidence'

function field(manifest: BiManifest, ref: string): string {
  const match = /^([^\[\]]+)\[([^\[\]]+)\]$/.exec(ref)
  const table = match && manifest.tables.find(item => item.name === match[1])
  const column = table && table.columns.find(item => item.name === match![2])
  if (!table?.queryable || !column?.queryable) throw new ReportEvidenceError('Filtro da referência não existe no modelo.')
  return `'${table.name.replaceAll("'", "''")}'[${column.name.replaceAll(']', ']]')}]`
}

function reportReferenceExpression(manifest: BiManifest, contract: ReportReferenceContract, scope: ReportScope): string {
  if (!scope.months.length || !scope.months.every(month => /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month))
    || scope.products || scope.region && (contract.source.kind === 'static-html' && !contract.source.groupField
      || !Object.hasOwn(contract.source.regionLabels ?? {}, scope.region))) throw new ReportEvidenceError('Recorte não verificado.')
  const source = `[${contract.measure.replaceAll(']', ']]')}]`
  const filters: string[] = []
  if (contract.source.timeField) {
    const ref = field(manifest, contract.source.timeField)
    filters.push(`FILTER(ALL(${ref}), ${scope.months.map(month => {
      const [year, m] = month.split('-').map(Number)
      return `(${ref} >= DATE(${year}, ${m}, 1) && ${ref} < DATE(${m === 12 ? year + 1 : year}, ${m === 12 ? 1 : m + 1}, 1))`
    }).join(' || ')})`)
  }
  if (scope.region && contract.source.groupField) {
    const value = contract.source.regionLabels?.[scope.region]
    if (!value) throw new ReportEvidenceError('Operação desconhecida.')
    filters.push(`${field(manifest, contract.source.groupField)} = "${value.replaceAll('"', '""')}"`)
  }
  return filters.length ? `CALCULATE(${source}, ${filters.join(', ')})` : source
}

export function reportReferenceDax(manifest: BiManifest, contract: ReportReferenceContract, scope: ReportScope): string {
  return `EVALUATE ROW("ReportReference", ${reportReferenceExpression(manifest, contract, scope)})`
}

export interface ReportQueryJob { contract: ReportReferenceContract; scope: ReportScope; metricIds: string[] }

/** One evaluation snapshot, with shared expressions evaluated only once. */
export function batchReportReferenceDax(manifest: BiManifest, jobs: ReportQueryJob[]) {
  const expressions: string[] = [], indexes: number[] = []
  for (const job of jobs) {
    const expression = reportReferenceExpression(manifest, job.contract, job.scope)
    let index = expressions.indexOf(expression)
    if (index < 0) { index = expressions.length; expressions.push(expression) }
    indexes.push(index)
  }
  if (!expressions.length) throw new ReportEvidenceError('Consulta sem indicadores.')
  const aliases = expressions.map((_, index) => `ReportReference${index || ''}`)
  const daxFor = (indexes: number[]) => `EVALUATE ROW(${indexes.map(index => `"${aliases[index]}", ${expressions[index]}`).join(', ')})`
  return { dax: daxFor(expressions.map((_, index) => index)), indexes, aliases, expressions, daxFor }
}

export async function loadReportFacts(manifest: BiManifest, contract: ReportReferenceContract, scope: ReportScope,
  metricIds: string[], signal?: AbortSignal): Promise<{ facts: ReportFact[]; dax: string }> {
  const metrics = contract.metrics.filter(metric => metricIds.includes(metric.id))
  if (!metrics.length || metricIds.some(id => !metrics.some(metric => metric.id === id))) throw new ReportEvidenceError('Indicador desconhecido.')
  const dax = reportReferenceDax(manifest, contract, scope)
  const rows = await executeDaxQuery({ workspaceId: manifest.workspaceId, semanticModelId: manifest.semanticModelId, dax, signal })
  const html = rows[0]?.['[ReportReference]']
  if (rows.length !== 1 || typeof html !== 'string' || !html) throw new ReportEvidenceError('Visual não retornou evidência.')
  return { facts: factsFromReportHtml(html, contract, scope, metrics), dax }
}

export async function answerFromReportReference(input: {
  manifest: BiManifest; schema: PublishedSchema; question: string; config: ConfigIa; signal?: AbortSignal
  onQuery?: (entry: { dax: string; rowCount: number; durationMs: number; status: string; errorCode?: string }) => Promise<void>
  onProgress?: BiProgressReporter
}) {
  const contracts = validateReportReferences(input.manifest, input.schema)
  const normalized = normalizeTerm(input.question)
  const complete = /\b(?:analise|desempenho) (?:completa|completo)\b/.test(normalized)
  const matched = contracts.map(contract => ({ contract,
    metrics: complete ? contract.metrics : matchReportMetrics(input.question, contract) })).filter(item => item.metrics.length)
  if (!matched.length) return null
  const terms = contracts.flatMap(contract => [...contract.metrics.flatMap(metric => [metric.label, ...metric.aliases]),
    ...Object.values(contract.source.regionLabels ?? {})])
  const jobs: ReportQueryJob[] = []
  const monthly = /mensal|mensais|evolucao|por mes|mes a mes/.test(normalized)
  const compare = /compar|diferenca|variacao/.test(normalized)
  const ranking = /ranking|por regional/.test(normalized)
  const scope = reportScope(input.question, matched[0].contract, terms)
  for (const { contract, metrics } of matched) {
    const current = reportScope(input.question, contract, terms)
    if (!current || /\b(?:quantos|quantas|quantidade|numero de)\b/i.test(input.question)
      && metrics.every(metric => metric.format !== 'number')) {
      return { clarification: { question: 'Confirme o período, o indicador e os filtros usados no relatório.',
        options: metrics.slice(0, 4).map(metric => metric.label) }, facts: [], queries: [] }
    }
    const scopes = monthly || compare && current.months.length > 1
      ? current.months.map(month => ({ ...current, months: [month] }))
      : ranking && contract.source.kind === 'delimited-html' && contract.source.regionLabels
        ? Object.keys(contract.source.regionLabels).map(region => ({ ...current, region })) : [current]
    for (const selected of scopes) jobs.push({ contract, scope: selected, metricIds: metrics.map(metric => metric.id) })
  }
  const refreshBefore = await getLatestRefreshStatus(input.manifest.workspaceId, input.manifest.semanticModelId, input.signal)
  if (refreshBefore && ['Unknown', 'InProgress'].includes(refreshBefore.status)) throw new ReportEvidenceError('O modelo está sendo atualizado; repita a pergunta após a conclusão.')
  const batch = batchReportReferenceDax(input.manifest, jobs)
  input.onProgress?.(biProgress(2, 'Buscando os indicadores e recortes juntos no Power BI.'))
  async function readBatch(indexes: number[]): Promise<{ row: Record<string, unknown>; dax: string }[]> {
    const dax = batch.daxFor(indexes), started = Date.now()
    try {
      const rows = await executeDaxQuery({ workspaceId: input.manifest.workspaceId, semanticModelId: input.manifest.semanticModelId, dax, signal: input.signal })
      if (rows.length !== 1) throw new ReportEvidenceError('Consulta não retornou a evidência completa.')
      await input.onQuery?.({ dax, rowCount: 1, durationMs: Date.now() - started, status: 'success' })
      return [{ row: rows[0], dax }]
    } catch (error) {
      await input.onQuery?.({ dax, rowCount: 0, durationMs: Date.now() - started, status: 'error',
        errorCode: error instanceof PowerBiQueryError ? error.code : 'REPORT_REFERENCE_INVALID' })
      if (indexes.length > 1 && error instanceof PowerBiQueryError && /Resource Governance|memory limit|maior que o limite/i.test(error.message)) {
        input.onProgress?.(biProgress(2, 'Dividindo a busca em blocos menores para respeitar a capacidade do BI.'))
        // Sequential retries avoid multiplying pressure on the capacity that rejected the larger query.
        const middle = Math.ceil(indexes.length / 2)
        return [...await readBatch(indexes.slice(0, middle)), ...await readBatch(indexes.slice(middle))]
      }
      throw error
    }
  }
  const groups = Array.from({ length: Math.ceil(batch.aliases.length / 2) }, (_, index) =>
    Array.from({ length: Math.min(2, batch.aliases.length - index * 2) }, (_, offset) => index * 2 + offset))
  const batches = (await mapConcurrent(groups, 3, readBatch, input.signal)).flat()
  const row = Object.assign({}, ...batches.map(batch => batch.row)) as Record<string, unknown>
  const prepared = new Map<string, ReturnType<typeof prepareReportHtml>>()
  const loaded = jobs.map((job, index) => {
    const key = `${batch.indexes[index]}:${contracts.indexOf(job.contract)}`, html = row[`[${batch.aliases[batch.indexes[index]]}]`]
    if (typeof html !== 'string' || !html) throw new ReportEvidenceError('Indicador ausente na consulta agrupada.')
    if (!prepared.has(key)) prepared.set(key, prepareReportHtml(html, job.contract))
    return { facts: factsFromPreparedReport(prepared.get(key)!, job.scope,
      job.contract.metrics.filter(metric => job.metricIds.includes(metric.id))) }
  })
  let facts = loaded.flatMap((result, index) => result.facts.map(fact => ({ ...fact,
    sourceMeasure: jobs[index].contract.measure,
    label: monthly || compare || ranking ? `${fact.label} (${jobs[index].scope.region
      ? jobs[index].contract.source.regionLabels?.[jobs[index].scope.region] : jobs[index].scope.months.join(', ')})` : fact.label })))
  if (ranking) facts = facts.sort((a, b) => a.metricId.localeCompare(b.metricId) || (b.value ?? -Infinity) - (a.value ?? -Infinity))
  if (compare && !ranking) {
    for (const { contract, metrics } of matched) {
      const indexes = jobs.flatMap((job, index) => job.contract === contract ? [index] : [])
      if (indexes.length < 2) continue
      for (const metric of metrics) {
        const before = loaded[indexes[0]].facts.find(fact => fact.metricId === metric.id)!, after = loaded[indexes.at(-1)!].facts.find(fact => fact.metricId === metric.id)!
        if (before.value !== null && after.value !== null) {
          facts.push({ ...after, id: '', metricId: `${metric.id}:difference`, sourceMeasure: contract.measure,
            label: `Diferença ${metric.label} (último período menos primeiro${metric.format === 'percent' ? ', pontos percentuais' : ''})`,
            format: metric.format === 'percent' ? 'number' : after.format,
            value: after.value - before.value, scope: `${before.scope} → ${after.scope}` })
          facts.push({ ...after, id: '', metricId: `${metric.id}:relative`, sourceMeasure: contract.measure,
            label: `Variação relativa ${metric.label}`, format: 'percent', precision: 0.005,
            value: before.value === 0 ? null : (after.value - before.value) / Math.abs(before.value) * 100,
            scope: `${before.scope} → ${after.scope}` })
        }
      }
    }
  }
  facts = facts.map((fact, index) => ({ ...fact, id: `f${index}` }))
  input.onProgress?.(biProgress(3, 'A IA está analisando os dados consultados; os valores serão conferidos antes da resposta.'))
  // The model selects facts/relationships; numbers and comparison statements are rendered and checked by the server.
  const eligible = facts.flatMap(left => facts.filter(right => left.id < right.id && canCompareReportFacts(left, right))
    .map(right => ({ left: left.id, right: right.id })))
  const response = eligible.length ? await conversar(input.config, [
      { role: 'system', content: 'Analise a pergunta e as evidências consultadas no BI. Retorne SOMENTE JSON {"comparisons":[{"left":"f0","right":"f1"}]}. Selecione comparações úteis dentre eligibleComparisons. Os indicadores solicitados já serão mostrados: não copie a lista de fatos ou seus identificadores. Se não houver pares elegíveis, retorne imediatamente {"comparisons":[]}. Não invente números, causas ou texto livre; a relação maior/menor será conferida com os valores consultados.' },
      { role: 'user', content: JSON.stringify({ question: input.question,
        evidence: facts.map(({ id, label, value, format }) => ({ id, label, value, format })), eligibleComparisons: eligible,
        scope, rules: [...new Set(matched.flatMap(({ contract }) => contract.notes))] }) },
    ], { temperatura: 0, maxTokens: 'maximum', reasoningEffort: input.config.reasoningEffort, jsonObrigatorio: true, signal: input.signal })
    : { texto: '{"comparisons":[]}', tokens: 0 }
  let chosen: string[] = [], comparisons: { left: string; right: string }[] = []
  try {
      const raw = JSON.parse((response.texto ?? '').replace(/^```(?:json)?\s*|\s*```$/g, ''))
      if (Array.isArray(raw.factIds) && raw.factIds.every((id: unknown) => typeof id === 'string' && facts.some(fact => fact.id === id))) chosen = raw.factIds
      if (Array.isArray(raw.comparisons)) comparisons = raw.comparisons.filter((item: { left?: unknown; right?: unknown } | null) =>
        item && typeof item.left === 'string' && typeof item.right === 'string').slice(0, 100)
  } catch { /* The fallback retains every requested, verified indicator. */ }
  if (facts.some(fact => !chosen.includes(fact.id))) chosen = facts.map(fact => fact.id)
  const refresh = await getLatestRefreshStatus(input.manifest.workspaceId, input.manifest.semanticModelId, input.signal)
  const refreshKey = (entry: typeof refresh) => entry && [entry.requestId, entry.status, entry.startTime, entry.endTime].join('|')
  if (refreshKey(refreshBefore) !== refreshKey(refresh)) throw new ReportEvidenceError('A atualização do modelo mudou durante a análise; repita a pergunta para conferir a nova versão dos dados.')
  const selected = facts.filter(fact => chosen.includes(fact.id))
  const insights = renderReportComparisons(selected, comparisons)
  const answer = formatVerifiedAnswer({ facts: selected, insights,
    pages: [...new Set(matched.map(({ contract }) => contract.page))],
    notes: matched.flatMap(({ contract }) => contract.notes), refreshFailed: refresh?.status === 'Failed' })
  return { answer, facts: selected, tokens: response.tokens,
    queries: batches.map(batch => ({ purpose: `Conferência conjunta dos indicadores e recortes solicitados`, dax: batch.dax, rowCount: 1 })),
    evidence: { modelHash: input.schema.modelHash, reportHash: input.schema.reportHash,
      measure: matched[0].contract.measure, page: matched[0].contract.page, scope: scope!,
      retrievedAt: new Date().toISOString(), refresh: refresh && { status: refresh.status, requestId: refresh.requestId, endTime: refresh.endTime },
      sources: matched.map(({ contract }) => ({ measure: contract.measure, page: contract.page })),
      values: selected.map(({ metricId, label, value, precision, scope }) => ({ metricId, label, value, precision, scope })) } }
}

export function canCompareReportFacts(left: ReportFact, right: ReportFact): boolean {
  if (left === right || left.format !== right.format || left.value === null || right.value === null
    || left.sourceMeasure !== right.sourceMeasure) return false
  if (left.metricId === right.metricId && left.scope !== right.scope) return true
  if (left.scope !== right.scope) return false
  return (left.metricId === 'realized' && /^target-[1-3]$/.test(right.metricId))
    || (right.metricId === 'realized' && /^target-[1-3]$/.test(left.metricId))
    || left.metricId === `${right.metricId}-budget` || right.metricId === `${left.metricId}-budget`
}

export function renderReportComparisons(facts: ReportFact[], comparisons: { left: string; right: string }[]): string[] {
  const statements = comparisons.flatMap(pair => {
    const left = facts.find(fact => fact.id === pair.left), right = facts.find(fact => fact.id === pair.right)
    if (!left || !right || !canCompareReportFacts(left, right) || left.value === null || right.value === null) return []
    const displayed = (fact: ReportFact) => Number(new Intl.NumberFormat('en-US', { useGrouping: false,
      maximumFractionDigits: Math.min(4, Math.max(0, Math.round(-Math.log10(fact.precision * 2)))) }).format(fact.value!))
    const difference = displayed(left) - displayed(right)
    const relation = difference === 0 ? 'equivalente, na precisão exibida, a' : difference > 0 ? 'maior que' : 'menor que'
    return [`${left.label} é ${relation} ${right.label}.`]
  })
  return [...new Set(statements)]
}
