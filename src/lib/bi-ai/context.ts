import { asRecord, safeText, type BiManifest, type BiObject, type BiTable } from './manifest'
import { validateDax } from './dax-guard'

export function normalizeTerm(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function words(value: string): string[] {
  return normalizeTerm(value).split(' ').filter((word) => word.length > 2)
}

function questionTerms(manifest: BiManifest, question: string): Set<string> {
  const terms = new Set(words(question))
  // Cadences such as "mensal" should select the corresponding time field.
  const normalizedQuestion = normalizeTerm(question)
  if (/\b(?:mensal|mensais)\b/.test(normalizedQuestion)) terms.add('mes')
  if (/\b(?:anual|anuais)\b/.test(normalizedQuestion)) terms.add('ano')
  if (/\b(?:trimestral|trimestrais)\b/.test(normalizedQuestion)) terms.add('trimestre')
  const synonyms = asRecord(manifest.business.synonyms)
  for (const [canonical, aliases] of Object.entries(synonyms)) {
    const group = [canonical, ...(Array.isArray(aliases) ? aliases.filter((x): x is string => typeof x === 'string') : [])]
    if (group.some((item) => words(item).some((word) => terms.has(word)))) {
      for (const item of group) for (const word of words(item)) terms.add(word)
    }
  }
  return terms
}

function scoreObject(object: { name: string; description?: string; synonyms?: string[]; preferredMeasure?: boolean }, terms: Set<string>): number {
  const name = words(object.name)
  const aliases = (object.synonyms ?? []).flatMap(words)
  const description = words(object.description ?? '')
  let score = 0
  for (const term of terms) {
    if (name.includes(term)) score += 8
    if (aliases.includes(term)) score += 7
    if (description.includes(term)) score += 1
  }
  if (score > 0 && object.preferredMeasure) score += 3
  return score
}

function selected<T extends { name: string; description?: string; synonyms?: string[]; preferredMeasure?: boolean }>(
  candidates: T[], terms: Set<string>, limit: number,
): T[] {
  return candidates.map((item) => ({ item, score: scoreObject(item, terms) }))
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .filter((entry, index) => entry.score > 0 || index < Math.min(2, candidates.length))
    .slice(0, limit).map((entry) => entry.item)
}

export interface SelectedContext {
  source?: string
  publishedVisuals?: string[]
  business: string
  businessRules: string[]
  availableMeasures: string[]
  availableDimensions: string[]
  tables: Pick<BiTable, 'name' | 'description' | 'fact'>[]
  measures: BiObject[]
  columns: BiObject[]
  relationships: string[]
  pages: string[]
  /** O que cada página do relatório mostra e com quais filtros. Sempre presente: é o que responde "o que tem nessa tela". */
  reportMap: string[]
  examples: { question: string; dax: string }[]
  ambiguities: string[]
  policy: BiManifest['policy']
  allowRestricted: boolean
}

/**
 * Contexto enxuto para o primeiro passe do planejador.
 *
 * O manifesto completo continua no servidor e é usado pelo guard. O modelo
 * recebe todos os nomes em availableMeasures/availableDimensions, mas não
 * precisa receber todas as fórmulas e descrições longas em toda pergunta;
 * `inspectCatalog` reabre qualquer objeto sob demanda.
 */
export function compactContextForPlanner(context: SelectedContext, inspected: string[] = []) {
  const requested = new Set(inspected.map(normalizeTerm))
  const expanded = (table: string | undefined, name: string) => requested.has(normalizeTerm(name))
    || requested.has(normalizeTerm(`${table ?? ''}[${name}]`))
    || requested.has(normalizeTerm(table ?? ''))
  return {
    business: context.business.slice(0, 700),
    businessRules: context.businessRules.map((rule) => rule.slice(0, 220)).slice(0, 8),
    availableMeasures: context.availableMeasures,
    availableDimensions: context.availableDimensions,
    tables: context.tables.map((table) => ({ name: table.name, fact: table.fact,
      description: table.description.slice(0, requested.has(normalizeTerm(table.name)) ? 1500 : 180) })),
    measures: context.measures.map((measure) => ({
      name: measure.name, table: measure.table,
      description: measure.description.slice(0, expanded(measure.table, measure.name) ? 2500 : 360),
      intent: measure.intent?.slice(0, 140), whenToUse: measure.whenToUse?.slice(0, 160),
      whenNotToUse: measure.whenNotToUse?.slice(0, 160),
      publishedExpression: expanded(measure.table, measure.name)
        ? measure.publishedExpression?.slice(0, 1200) : undefined,
      format: measure.format,
    })),
    columns: context.columns.map((column) => ({ name: column.name, table: column.table,
      description: column.description.slice(0, expanded(column.table, column.name) ? 1200 : 100),
      dataType: column.dataType, aggregatable: column.aggregatable })),
    relationships: context.relationships.slice(0, 8),
    reportMap: context.reportMap.slice(0, 8).map((page) => page.slice(0, 200)),
    examples: context.examples.slice(0, 1),
    ambiguities: context.ambiguities.slice(0, 3),
    policy: context.policy,
  }
}

/** Mapa do relatório: página → o que mostra → com quais filtros. Vale para manifesto curado e para catálogo ao vivo. */
function buildReportMap(manifest: BiManifest): string[] {
  const report = asRecord(manifest.report)
  const pages = Array.isArray(report.pages) ? report.pages : []
  // O manifesto curado guarda o valor padrão do slicer em `defaultWhenUnselected`,
  // separado do campo. Sem isso o Chat não sabe que Fundo e Repasse abrem em ON.
  const defaultByField = new Map<string, string>()
  for (const value of Array.isArray(report.slicers) ? report.slicers : []) {
    const slicer = asRecord(value)
    const field = safeText(slicer.field, 140)
    const fallback = safeText(slicer.defaultWhenUnselected, 20)
    if (field && fallback) defaultByField.set(field, fallback)
  }
  const lines: string[] = []
  for (const value of pages) {
    const page = asRecord(value)
    const name = safeText(page.displayName ?? page.name ?? page.title, 100)
    if (!name) continue
    const visuals = Array.isArray(page.mainVisuals) ? page.mainVisuals
      : Array.isArray(page.visuals) ? page.visuals : []
    const shown = visuals.map((visual) => {
      const item = asRecord(visual)
      const title = safeText(item.title ?? item.name, 120)
      const measures = Array.isArray(item.measures)
        ? item.measures.map((measure) => safeText(measure, 60)).filter(Boolean) : []
      return measures.length ? `${title} (${measures.join(', ')})` : title
    }).filter(Boolean)
    const slicers = (Array.isArray(page.slicers) ? page.slicers : []).map((slicer) => {
      const text = safeText(slicer, 140)
      if (!text || text.includes(' = ')) return text
      const fallback = defaultByField.get(text)
      return fallback ? `${text} = ${fallback}` : text
    }).filter(Boolean)
    const parts: string[] = []
    if (shown.length) parts.push(`mostra: ${shown.slice(0, 8).join(' | ')}`)
    if (slicers.length) parts.push(`filtros: ${slicers.slice(0, 8).join(' | ')}`)
    if (parts.length) lines.push(`${name} — ${parts.join(' · ')}`)
  }
  if (lines.length) return lines.slice(0, 20)
  // Catálogo ao vivo pode trazer o mapa pronto sem a lista de páginas detalhada.
  const live = Array.isArray(report.reportMap) ? report.reportMap : []
  return live.map((value) => {
    const page = asRecord(value)
    const parts: string[] = []
    if (Array.isArray(page.visuals) && page.visuals.length) {
      parts.push(`mostra: ${page.visuals.map((v) => safeText(v, 120)).filter(Boolean).slice(0, 8).join(' | ')}`)
    }
    if (Array.isArray(page.slicers) && page.slicers.length) {
      parts.push(`filtros: ${page.slicers.map((s) => safeText(s, 140)).filter(Boolean).slice(0, 8).join(' | ')}`)
    }
    const name = safeText(page.name, 100)
    return name && parts.length ? `${name} — ${parts.join(' · ')}` : ''
  }).filter(Boolean).slice(0, 20)
}

export function selectContext(manifest: BiManifest, question: string, isAdmin: boolean): SelectedContext {
  const allowRestricted = isAdmin && manifest.policy.allowRestrictedForAdmins
  const terms = questionTerms(manifest, question)
  const queryable = manifest.tables.filter((table) => table.queryable)
  const measures = selected(manifest.measures.filter((measure) =>
    measure.queryable && !measure.presentationOnly && (allowRestricted || !measure.restricted)
    && (!measure.table || queryable.some((table) => table.name === measure.table))), terms, 8)
  const dependencies = new Set(measures.flatMap((measure) => measure.dependencies.map(normalizeTerm)))
  for (const measure of manifest.measures) {
    if (measures.length >= 12) break
    if (dependencies.has(normalizeTerm(measure.name)) && measure.queryable && !measure.presentationOnly
      && (allowRestricted || !measure.restricted) && !measures.includes(measure)) measures.push(measure)
  }
  const allColumns = queryable.flatMap((table) => table.columns)
    .filter((column) => column.queryable && (allowRestricted || !column.restricted))
  const columns = selected(allColumns, terms, 12)
  for (const column of allColumns) {
    if (columns.length >= 18) break
    const qualified = normalizeTerm(`${column.table} ${column.name}`)
    if ((dependencies.has(normalizeTerm(column.name)) || dependencies.has(qualified)) && !columns.includes(column)) {
      columns.push(column)
    }
  }
  const model = asRecord(manifest.raw.model)
  const timeFields = Array.isArray(model.timeFields) ? model.timeFields : []
  if (/ano|mes|mês|mensal|mensais|trimestral|trimestrais|anual|anuais|data|per[ií]odo|anterior|atual|ytd|acumulad|\b20\d{2}\b/i.test(question)) {
    for (const field of timeFields) {
      if (columns.length >= 18) break
      const exact = String(field).toLowerCase()
      const column = allColumns.find((item) => `${item.table}[${item.name}]`.toLowerCase() === exact)
      if (column && !columns.includes(column)) columns.push(column)
    }
  }
  const tableNames = new Set([
    ...measures.map((measure) => measure.table).filter(Boolean),
    ...columns.map((column) => column.table).filter(Boolean),
  ])
  const tables = selected(queryable, terms, 6)
  for (const table of queryable) {
    if (tables.length >= 10) break
    if (tableNames.has(table.name) && !tables.includes(table)) tables.push(table)
  }
  const relationships: string[] = []
  for (const value of Array.isArray(model.relationships) ? model.relationships : []) {
    const item = asRecord(value)
    const from = asRecord(item.from)
    const to = asRecord(item.to)
    const fromTable = String(item.fromTable ?? from.table ?? '')
    const toTable = String(item.toTable ?? to.table ?? '')
    if (!tableNames.has(fromTable) && !tableNames.has(toTable)) continue
    const linked = queryable.find((table) => table.name === (tableNames.has(fromTable) ? toTable : fromTable))
    if (linked && tables.length < 10 && !tables.includes(linked)) tables.push(linked)
    if (queryable.some((table) => table.name === fromTable) && queryable.some((table) => table.name === toTable)) {
      relationships.push(safeText(`${fromTable}[${String(item.fromColumn ?? from.column ?? '')}] → ${toTable}[${String(item.toColumn ?? to.column ?? '')}]`, 200))
    }
    if (relationships.length >= 8) break
  }
  const pages = (Array.isArray(manifest.report.pages) ? manifest.report.pages : [])
    .map((value) => asRecord(value))
    .flatMap((page) => {
      const pageName = safeText(page.displayName ?? page.name ?? page.title, 100)
      const visuals = Array.isArray(page.mainVisuals) ? page.mainVisuals : Array.isArray(page.visuals) ? page.visuals : []
      return [pageName, ...visuals.map((value) => {
        const visual = asRecord(value)
        return safeText(`${pageName}: ${String(visual.title ?? visual.name ?? '')}`, 150)
      })]
    })
    .filter(Boolean).filter((page) => scoreObject({ name: page }, terms) > 0).slice(0, 8)
  const examples = manifest.queryExamples.map((example) => ({
    example, score: scoreObject({ name: example.question }, terms),
  })).sort((a, b) => b.score - a.score).filter((item) => item.score > 0).slice(0, 3)
    .map((item) => item.example)
  // Regras de negócio são invariantes: entram SEMPRE, sem filtro de relevância lexical.
  // Antes eram descartadas quando a pergunta não compartilhava palavras com a regra.
  const businessRules = (Array.isArray(manifest.business.rules) ? manifest.business.rules : [])
    .map((value) => safeText(asRecord(value).description, 400))
    .filter(Boolean).slice(0, 12)
  const context: SelectedContext = {
    business: safeText(manifest.business.description ?? manifest.business.summary ?? manifest.business.domain, 900),
    businessRules,
    availableMeasures: manifest.measures.filter((measure) => measure.queryable && !measure.restricted && !measure.presentationOnly)
      .map((measure) => measure.name).slice(0, 200),
    availableDimensions: allColumns.map((column) => `${column.table}[${column.name}]`).slice(0, 200),
    tables: tables.map(({ name, description, fact }) => ({ name, description: description.slice(0, 420), fact })),
    measures,
    columns: columns.map((column) => ({ ...column, description: column.description.slice(0, 300) })),
    relationships,
    pages,
    reportMap: buildReportMap(manifest),
    examples,
    ambiguities: manifest.ambiguities.slice(0, 5),
    policy: manifest.policy,
    allowRestricted,
  }
  context.examples = context.examples.filter((example) => {
    try { validateDax(example.dax, context, manifest, manifest.policy.maxRows); return true }
    catch { return false }
  })
  while (JSON.stringify(context).length > 30_000) {
    if (context.availableDimensions.length) context.availableDimensions.pop()
    else if (context.availableMeasures.length) context.availableMeasures.pop()
    else if (context.examples.length) context.examples.pop()
    else if (context.ambiguities.length) context.ambiguities.pop()
    else if (context.columns.length > 2) context.columns.pop()
    else if (context.measures.length > 2) context.measures.pop()
    else if (context.reportMap.length > 3) context.reportMap.pop()
    else break
  }
  return context
}

/** Resolve exact names discovered from the compact catalog without another model call. */
export function expandContextFromPlan(context: SelectedContext, manifest: BiManifest, draft: string): SelectedContext {
  const text = draft.toLocaleLowerCase('pt-BR')
  const measures = [...context.measures]
  const columns = [...context.columns]
  const tables = [...context.tables]
  for (const measure of manifest.measures) {
    if (measures.length >= context.measures.length + 8) break
    if (!measure.queryable || measure.presentationOnly || (measure.restricted && !context.allowRestricted)
      || measures.includes(measure) || !text.includes(`[${measure.name.toLocaleLowerCase('pt-BR')}]`)) continue
    measures.push(measure)
    const table = manifest.tables.find((item) => item.name === measure.table)
    if (table?.queryable && !tables.some((item) => item.name === table.name)) tables.push(table)
  }
  for (const table of manifest.tables.filter((item) => item.queryable)) {
    for (const column of table.columns) {
      if (columns.length >= context.columns.length + 8) break
      if (!column.queryable || column.presentationOnly || (column.restricted && !context.allowRestricted)
        || columns.includes(column)) continue
      const ref = `${table.name}[${column.name}]`.toLocaleLowerCase('pt-BR')
      const quoted = `'${table.name}'[${column.name}]`.toLocaleLowerCase('pt-BR')
      if (!text.includes(ref) && !text.includes(quoted)) continue
      columns.push(column)
      if (!tables.some((item) => item.name === table.name)) tables.push(table)
    }
  }
  return measures.length === context.measures.length && columns.length === context.columns.length
    ? context : { ...context, measures, columns, tables }
}

/** Inspect named objects in the full authorized catalog on demand. */
export function inspectCatalog(context: SelectedContext, manifest: BiManifest, names: string[]): SelectedContext {
  const measures = [...context.measures]
  const columns = [...context.columns]
  const tables = [...context.tables]
  let changed = false
  const addColumn = (column: BiObject) => {
    const index = columns.findIndex((item) => item.table === column.table && item.name === column.name)
    if (index < 0) { columns.push(column); changed = true }
    else if (columns[index].description.length < column.description.length) { columns[index] = column; changed = true }
  }
  const addTable = (name: string, includeMembers = true) => {
    const table = manifest.tables.find((item) => item.queryable && item.name.toLowerCase() === name.toLowerCase())
    if (!table) return
    const index = tables.findIndex((item) => item.name === table.name)
    if (index < 0) { tables.push(table); changed = true }
    else if (tables[index].description.length < table.description.length) { tables[index] = table; changed = true }
    if (!includeMembers) return
    for (const column of table.columns) {
      if (columns.length >= context.columns.length + 16) break
      if (column.queryable && !column.presentationOnly && (context.allowRestricted || !column.restricted)
        ) addColumn(column)
    }
    for (const measure of manifest.measures) {
      if (measures.length >= context.measures.length + 16) break
      if (measure.table === table.name && measure.queryable && !measure.presentationOnly
        && (context.allowRestricted || !measure.restricted) && !measures.includes(measure)) {
        measures.push(measure)
        changed = true
      }
    }
  }
  for (const name of names.slice(0, 12)) {
    const normalized = name.toLowerCase().trim()
    const measure = manifest.measures.find((item) => item.name.toLowerCase() === normalized
      && item.queryable && !item.presentationOnly && (context.allowRestricted || !item.restricted))
    if (measure && !measures.includes(measure)) {
      measures.push(measure)
      changed = true
      if (measure.table) addTable(measure.table, false)
    }
    for (const table of manifest.tables.filter((item) => item.queryable)) {
      if (table.name.toLowerCase() === normalized) addTable(table.name)
      const column = table.columns.find((item) => `${table.name}[${item.name}]`.toLowerCase() === normalized
        && item.queryable && !item.presentationOnly && (context.allowRestricted || !item.restricted))
      if (column) { addColumn(column); addTable(table.name, false) }
    }
  }
  return changed ? { ...context, measures, columns, tables } : context
}
