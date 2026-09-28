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
  let score = object.preferredMeasure ? 3 : 0
  for (const term of terms) {
    if (name.includes(term)) score += 8
    if (aliases.includes(term)) score += 7
    if (description.includes(term)) score += 1
  }
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
  business: string
  tables: Pick<BiTable, 'name' | 'description' | 'fact'>[]
  measures: BiObject[]
  columns: BiObject[]
  relationships: string[]
  pages: string[]
  examples: { question: string; dax: string }[]
  ambiguities: string[]
  policy: BiManifest['policy']
  allowRestricted: boolean
}

export function selectContext(manifest: BiManifest, question: string, isAdmin: boolean): SelectedContext {
  const allowRestricted = isAdmin && manifest.policy.allowRestrictedForAdmins
  const terms = questionTerms(manifest, question)
  const queryable = manifest.tables.filter((table) => table.queryable)
  const measures = selected(manifest.measures.filter((measure) =>
    measure.queryable && !measure.presentationOnly && (allowRestricted || !measure.restricted)
    && (!measure.table || queryable.some((table) => table.name === measure.table))), terms, 16)
  const dependencies = new Set(measures.flatMap((measure) => measure.dependencies.map(normalizeTerm)))
  for (const measure of manifest.measures) {
    if (measures.length >= 20) break
    if (dependencies.has(normalizeTerm(measure.name)) && measure.queryable && !measure.presentationOnly
      && (allowRestricted || !measure.restricted) && !measures.includes(measure)) measures.push(measure)
  }
  const allColumns = queryable.flatMap((table) => table.columns)
    .filter((column) => column.queryable && (allowRestricted || !column.restricted))
  const columns = selected(allColumns, terms, 24)
  for (const column of allColumns) {
    if (columns.length >= 30) break
    const qualified = normalizeTerm(`${column.table} ${column.name}`)
    if ((dependencies.has(normalizeTerm(column.name)) || dependencies.has(qualified)) && !columns.includes(column)) {
      columns.push(column)
    }
  }
  const model = asRecord(manifest.raw.model)
  const timeFields = Array.isArray(model.timeFields) ? model.timeFields : []
  if (/ano|mes|mês|data|per[ií]odo|anterior|atual|ytd|acumulad|\b20\d{2}\b/i.test(question)) {
    for (const field of timeFields) {
      if (columns.length >= 30) break
      const exact = String(field).toLowerCase()
      const column = allColumns.find((item) => `${item.table}[${item.name}]`.toLowerCase() === exact)
      if (column && !columns.includes(column)) columns.push(column)
    }
  }
  const tableNames = new Set([
    ...measures.map((measure) => measure.table).filter(Boolean),
    ...columns.map((column) => column.table).filter(Boolean),
  ])
  const tables = selected(queryable, terms, 8)
  for (const table of queryable) {
    if (tables.length >= 12) break
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
    if (linked && tables.length < 12 && !tables.includes(linked)) tables.push(linked)
    if (queryable.some((table) => table.name === fromTable) && queryable.some((table) => table.name === toTable)) {
      relationships.push(safeText(`${fromTable}[${String(item.fromColumn ?? from.column ?? '')}] → ${toTable}[${String(item.toColumn ?? to.column ?? '')}]`, 200))
    }
    if (relationships.length >= 12) break
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
  const context: SelectedContext = {
    business: safeText(manifest.business.description ?? manifest.business.summary ?? manifest.business.domain, 900),
    tables: tables.map(({ name, description, fact }) => ({ name, description, fact })),
    measures,
    columns,
    relationships,
    pages,
    examples,
    ambiguities: manifest.ambiguities.slice(0, 5),
    policy: manifest.policy,
    allowRestricted,
  }
  context.examples = context.examples.filter((example) => {
    try { validateDax(example.dax, context, manifest, manifest.policy.maxRows); return true }
    catch { return false }
  })
  while (JSON.stringify(context).length > 18_000) {
    if (context.columns.length > 2) context.columns.pop()
    else if (context.measures.length > 2) context.measures.pop()
    else if (context.examples.length) context.examples.pop()
    else break
  }
  return context
}
