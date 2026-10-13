import { normalizeTerm, selectContext, type SelectedContext } from './context'
import { resolveSourceVariables, usesPublishedDataRule, sourceTableFields, type DaxSemanticSource } from './dax-source'
import type { BiManifest } from './manifest'
import type { ReportReferenceContract } from './report-evidence'
import { publishedAggregations } from './source-analysis'

const COMMON = new Set('qual quais foi foram que quem como para por dos das esse essa este esta mais menos maior menor melhor pior tudo todos todas mostre liste quero saber sobre com uma nao sim muito fazer faça fez gerou gerar setembro outubro janeiro fevereiro março abril maio junho julho agosto novembro dezembro'.split(' '))

function terms(question: string) {
  return [...new Set(normalizeTerm(question).split(' ').filter(word => word.length >= 3 && !COMMON.has(word)))]
}

function relevance(text: string, words: string[]) {
  const tokens = normalizeTerm(text.replace(/([a-z])([A-Z])/g, '$1 $2')).split(' ')
  return words.reduce((score, word) => score + (tokens.some(token => token === word
    || word.length >= 5 && token.startsWith(word.slice(0, 5))) ? 1 : 0), 0)
}

/** Rank live rules, without treating retrieval relevance as permission to query them. */
export function rankSemanticSources(sources: DaxSemanticSource[], question: string, references: ReportReferenceContract[] = []) {
  const words = terms(question), visuals = new Set(references.map(reference => reference.measure))
  return sources.map((source, index) => ({ source, index, score: relevance(source.measure, words) * 8
    + relevance(source.description.slice(0, 2500), words) * 3 + (visuals.has(source.measure) ? 5 : 0)
    + (source.variables.length > 8 ? 2 : 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.source)
}

/**
 * Send each schema name once and the useful live formulas first. Complete objects
 * stay on the server and remain available through inspect/search-catalog.
 * Requested definitions are never clipped; no data or query permission is cached.
 */
export function focusedPlannerContext(context: SelectedContext, manifest: BiManifest, question: string,
  sources: DaxSemanticSource[], inspected: string[] = [], references: ReportReferenceContract[] = [], sourceBudget = 2500) {
  const requested = new Set(inspected.map(normalizeTerm)), words = terms(question)
  const expanded = (table: string | undefined, name: string) => requested.has(normalizeTerm(name))
    || requested.has(normalizeTerm(`${table ?? ''}[${name}]`)) || requested.has(normalizeTerm(table ?? ''))
  const visibleTables = manifest.tables.filter(table => table.queryable)
  const narrow = selectContext(manifest, question, context.allowRestricted)
  const selectedColumns = new Set(narrow.columns.map(column => `${column.table}[${column.name}]`))
  const visibleMeasures = context.measures.filter(measure => !measure.restricted || context.allowRestricted)
  const detailed = visibleMeasures.filter(measure => expanded(measure.table, measure.name)
    || relevance([measure.name, ...measure.synonyms, measure.description.slice(0, 500)].join(' '), words) > 0)
  const chosen = detailed.length ? detailed : visibleMeasures.slice(0, 2)
  const focused = sources.filter(source => requested.has(normalizeTerm(`${source.measure}::catalog`)) || requested.has(normalizeTerm(`${source.measure}::auto`)))
  const dataSources = sources.filter(source => usesPublishedDataRule(source.variables) || expanded(source.table, source.measure) || focused.includes(source))
  const ordered = [...focused, ...rankSemanticSources(dataSources, question, references).filter(source => !focused.includes(source))]
  const semanticSources = ordered.map((source, sourceIndex) => {
    const fields = sourceTableFields(source)
    const full = requested.has(normalizeTerm(source.measure))
    const description = source.description.slice(0, full ? undefined : 1600)
    const requestedVariables = source.variables.filter(variable => requested.has(normalizeTerm(`${source.measure}::${variable.name}`)))
    const included = new Set((full ? source.variables : resolveSourceVariables(source, requestedVariables.map(variable => variable.name).join(' ')))
      .map(variable => variable.name))
    let bytes = source.variables.filter(variable => included.has(variable.name)).reduce((total, variable) => total + variable.expression.length, 0)
    if (!full && sourceIndex === 0 && focused.length) {
      const ranked = source.variables.map((variable, index) => ({ variable, index, score: relevance(variable.expression, words) }))
        .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.index - b.index)
      for (const { variable } of ranked) {
        // Include a matching rule and its immediate grouping/filter consumers.
        // Rendering/serialization variables remain inspectable but are not useful to plan data reads.
        const consumers = source.variables.filter(item => item.dependencies.includes(variable.name) && !/\b(?:CONCATENATEX|SUBSTITUTE)\s*\(/i.test(item.expression))
        const following = source.variables.filter(item => consumers.some(consumer => item.dependencies.includes(consumer.name))
          && !/\b(?:CONCATENATEX|SUBSTITUTE)\s*\(/i.test(item.expression))
        const roots = [variable, ...consumers, ...following]
        const closure = resolveSourceVariables(source, roots.map(item => item.name).join(' '))
        const additional = closure.filter(item => !included.has(item.name))
        const size = additional.reduce((total, item) => total + item.expression.length, 0)
        if (bytes + size <= sourceBudget) { additional.forEach(item => included.add(item.name)); bytes += size }
      }
    }
    const variables = source.variables.filter(variable => included.has(variable.name)).map(({ name, expression }) => ({ name, expression, fields: fields.get(name) }))
    if (variables.length || focused.includes(source) || full) return { measure: source.measure, table: source.table, description,
      variables, availableVariables: source.variables.map(variable => variable.name),
      sourceAggregations: publishedAggregations(source).filter(aggregate => full
        || requested.has(normalizeTerm(`${source.measure}::catalog`)) || included.has(aggregate.variable)),
      variableCatalog: source.variables.filter(variable => variable.aliases.length && (full
        || requested.has(normalizeTerm(`${source.measure}::catalog`)) || included.has(variable.name))).map(({ name, aliases }) => ({ name,
        fields: aliases.filter(alias => /^[\p{L}_][\p{L}\p{N}_ ]*$/u.test(alias)) })) }
    return { measure: source.measure, table: source.table,
      inspectForDefinitions: true }
  })
  return {
    business: context.business,
    businessRules: context.businessRules,
    tables: visibleTables.map(table => ({ name: table.name, description: table.description.slice(0, expanded(undefined, table.name) ? undefined : 100),
      inspectForAllColumns: !expanded(undefined, table.name),
      columns: table.columns.filter(column => column.queryable && !column.presentationOnly && (!column.restricted || context.allowRestricted))
        .filter(column => expanded(undefined, table.name) || expanded(table.name, column.name) || selectedColumns.has(`${table.name}[${column.name}]`))
        .map(column => [column.name, column.dataType]) })),
    availableMeasures: dataSources.length ? chosen.filter(measure => expanded(measure.table, measure.name)).map(measure => measure.name) : context.availableMeasures,
    inspectRemainingCatalog: 'search-catalog e inspect cobrem todas as tabelas, colunas e medidas do projeto.',
    measures: chosen.filter(measure => !dataSources.length || expanded(measure.table, measure.name)).map(measure => ({ name: measure.name, table: measure.table,
      description: measure.description.slice(0, expanded(measure.table, measure.name) ? undefined : sources.length ? 160 : 700),
      expression: expanded(measure.table, measure.name) || !sources.length && (measure.publishedExpression?.length ?? Infinity) <= 2000
        ? measure.publishedExpression : undefined, format: measure.format,
      whenToUse: !sources.length || expanded(measure.table, measure.name) ? measure.whenToUse || undefined : undefined,
      whenNotToUse: !sources.length || expanded(measure.table, measure.name) ? measure.whenNotToUse || undefined : undefined })),
    relationships: context.relationships, reportMap: context.reportMap,
    semanticSources,
    policy: { ...context.policy, maxRows: 100_000, maxQueries: 100 },
  }
}

/** The tool needs names, filters and metric IDs, not HTML parser internals. */
export function plannerReportReferences(references: ReportReferenceContract[]) {
  return references.map(({ measure, page, metrics, notes, source }) => ({ measure, page, notes,
    scope: { timeField: source.timeField, groupField: source.groupField, regionLabels: source.regionLabels },
    fields: source.fields,
    metrics: metrics.map(({ id, label, aliases, format, expression }) => ({ id, label, aliases, format, expression })) }))
}
