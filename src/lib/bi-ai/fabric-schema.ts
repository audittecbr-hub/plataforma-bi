import { createHash } from 'node:crypto'
import { asRecord, safeMetadataText, safeText, type BiManifest } from './manifest'
import type { SelectedContext } from './context'

export interface FabricPart { path: string; payload: string; payloadType: string }
export interface PublishedMeasure { name: string; table: string; expression: string }
export interface PublishedColumn { name: string; table: string }
export interface PublishedPageMap {
  name: string
  visuals: string[]
  slicers: string[]
}

export interface PublishedSchema {
  modelHash: string
  /** Descrição do modelo escrita no TMDL. Em modelos bem documentados carrega as regras de arquitetura. */
  modelDescription: string
  measures: PublishedMeasure[]
  columns: PublishedColumn[]
  relationships: string[]
  pages: string[]
  /** O que cada página mostra e com quais filtros — é o que responde "o que tem nessa tela". */
  reportMap: PublishedPageMap[]
  visualCount: number
  visuals: { page: string; type: string; fields: string[] }[]
}

export class PublishedSchemaError extends Error {}

function decode(part: FabricPart): string {
  if (part.payloadType !== 'InlineBase64' || part.payload.length > 600_000) {
    throw new PublishedSchemaError('Parte da definição Fabric inválida ou excessiva.')
  }
  return Buffer.from(part.payload, 'base64').toString('utf8')
}

function unquote(value: string): string {
  const trimmed = value.trim()
  return trimmed.startsWith("'") && trimmed.endsWith("'")
    ? trimmed.slice(1, -1).replace(/''/g, "'") : trimmed
}

function tmdlName(line: string, kind: 'table' | 'column' | 'measure'): string | null {
  const prefix = kind === 'table' ? /^table\s+/ : new RegExp(`^\\t${kind}\\s+`)
  if (!prefix.test(line)) return null
  const raw = line.replace(prefix, '').split(' =')[0].trim()
  return raw ? unquote(raw) : null
}

function measureBlocks(text: string, table: string): PublishedMeasure[] {
  const lines = text.split(/\r?\n/)
  const found: PublishedMeasure[] = []
  for (let index = 0; index < lines.length; index++) {
    const name = tmdlName(lines[index], 'measure')
    if (!name) continue
    const first = lines[index].slice(lines[index].indexOf('=') + 1).trim()
    const formula = [first]
    for (let next = index + 1; next < lines.length && lines[next].startsWith('\t\t\t'); next++) {
      formula.push(lines[next].trim())
    }
    const joined = formula.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const safe = joined.length <= 650 && !/<\s*(?:div|html|style|script|svg)|data:image|base64|https?:\/\/|\b(?:Sql|PostgreSQL|Odbc|OData)\.Database|(?:server|password|client_secret)\s*=/i.test(joined)
      ? joined : ''
    found.push({ name, table, expression: safe })
  }
  return found
}

function columns(text: string, table: string): PublishedColumn[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const name = tmdlName(line, 'column')
    return name ? [{ name, table }] : []
  })
}

function projectedFields(visual: Record<string, unknown>): string[] {
  const query = (visual.visual as Record<string, unknown> | undefined)?.query as Record<string, unknown> | undefined
  const states = query?.queryState as Record<string, { projections?: { field?: Record<string, unknown> }[] }> | undefined
  const fields: string[] = []
  for (const state of Object.values(states ?? {})) for (const projection of state?.projections ?? []) {
    for (const kind of ['Measure', 'Column']) {
      const item = projection.field?.[kind] as { Expression?: { SourceRef?: { Entity?: string } }; Property?: string } | undefined
      if (item?.Expression?.SourceRef?.Entity && item.Property) {
        fields.push(`${item.Expression.SourceRef.Entity}[${item.Property}]`)
      }
    }
  }
  return fields.slice(0, 8)
}

/** Valor padrão de um slicer: vive no filtro embutido de `objects.general` do próprio visual. */
function slicerDefaults(visualNode: Record<string, unknown> | undefined): string[] {
  const objects = visualNode?.objects as Record<string, unknown> | undefined
  const general = objects?.general as { properties?: { filter?: { filter?: { Where?: unknown[] } } } }[] | undefined
  const where = general?.[0]?.properties?.filter?.filter?.Where
  if (!Array.isArray(where)) return []
  const values: string[] = []
  for (const node of where) {
    const inNode = (node as { Condition?: { In?: { Values?: unknown[][] } } })?.Condition?.In
    if (!Array.isArray(inNode?.Values)) continue
    for (const group of inNode.Values) {
      if (!Array.isArray(group)) continue
      for (const entry of group) {
        const raw = (entry as { Literal?: { Value?: string } })?.Literal?.Value
        if (typeof raw === 'string') {
          const clean = raw.replace(/^'|'$/g, '').trim()
          if (clean && clean !== 'null') values.push(clean)
        }
      }
    }
  }
  return [...new Set(values)].slice(0, 6)
}

/** Um visual comum vira uma linha legível: "card: [Receita]". */
function describeVisual(type: string, fields: string[]): string {
  if (!fields.length) return ''
  const short = type.replace(/[0-9A-F]{16,}$/i, '') || 'visual'
  return `${short}: ${fields.join(', ')}`
}

/** Bloco de comentários `///` que precede a declaração — é a descrição no TMDL. */
function tmdlDescription(text: string, max = 4000): string {
  const doc: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('///')) { doc.push(trimmed.replace(/^\/\/\/\s?/, '')); continue }
    if (doc.length || trimmed) break
  }
  return doc.join('\n').trim().slice(0, max)
}

/** Parse only semantic metadata. Never pass partitions, M queries or connections to the LLM. */
export function parsePublishedSchema(modelParts: FabricPart[], reportParts: FabricPart[] = []): PublishedSchema {
  if (modelParts.length > 200 || reportParts.length > 1000) throw new PublishedSchemaError('Definição Fabric grande demais.')
  const measures: PublishedMeasure[] = []
  const modelColumns: PublishedColumn[] = []
  const relationships: string[] = []
  const pages: string[] = []
  const pageNames = new Map<string, string>()
  const visuals: PublishedSchema['visuals'] = []
  const hash = createHash('sha256')
  let visualCount = 0
  let modelDescription = ''
  for (const part of modelParts) {
    const arquivoDoModelo = part.path === 'definition/model.tmdl'
    if (!/^definition\/tables\/[^/]+\.tmdl$/.test(part.path)
      && part.path !== 'definition/relationships.tmdl' && !arquivoDoModelo) continue
    const text = decode(part)
    // ATENÇÃO: o model.tmdl NÃO entra no hash. Incluí-lo aqui muda o hash de todo
    // modelo e invalida qualquer manifesto já registrado — o hash precisa ser
    // estável entre versões deste parser. Só o que define estrutura é hasheado.
    if (arquivoDoModelo) {
      modelDescription = safeMetadataText(tmdlDescription(text), 4000)
      continue
    }
    hash.update(part.path).update('\0').update(text).update('\0')
    if (part.path === 'definition/relationships.tmdl') {
      for (const block of text.split(/(?=^relationship\s+)/m).filter((value) => value.startsWith('relationship '))) {
        const from = /^\tfromColumn:\s*(.+)$/m.exec(block)?.[1]
        const to = /^\ttoColumn:\s*(.+)$/m.exec(block)?.[1]
        if (from && to) relationships.push(`${safeText(from, 100)} → ${safeText(to, 100)}`)
      }
      continue
    }
    const table = tmdlName(text.split(/\r?\n/).find((line) => line.startsWith('table ')) ?? '', 'table')
    if (!table) continue
    measures.push(...measureBlocks(text, table))
    modelColumns.push(...columns(text, table))
  }
  for (const part of reportParts) {
    const pageMatch = /^definition\/pages\/([^/]+)\/page\.json$/.exec(part.path)
    if (pageMatch) {
      try {
        const page = JSON.parse(decode(part)) as { displayName?: string; name?: string }
        const name = safeText(page.displayName ?? page.name, 100)
        if (name) { pages.push(name); pageNames.set(pageMatch[1], name) }
      } catch { /* A malformed page cannot change model access. */ }
    }
  }
  const pageMap = new Map<string, { visuals: string[]; slicers: string[] }>()
  for (const part of reportParts) {
    const visualMatch = /^definition\/pages\/([^/]+)\/visuals\/[^/]+\/visual\.json$/.exec(part.path)
    if (!visualMatch) continue
    try {
      const visual = JSON.parse(decode(part)) as Record<string, unknown>
      const visualNode = visual.visual as Record<string, unknown> | undefined
      const fields = projectedFields(visual)
      const type = safeText(visualNode?.visualType, 50)
      visualCount++
      const page = pageNames.get(visualMatch[1]) ?? visualMatch[1]
      if (fields.length) visuals.push({ page, type, fields })
      const entry = pageMap.get(page) ?? { visuals: [], slicers: [] }
      if (/^slicer/i.test(type)) {
        const defaults = slicerDefaults(visualNode)
        const group = safeText((visualNode?.syncGroup as { groupName?: string } | undefined)?.groupName, 60)
        for (const field of fields) {
          const shown = defaults.length ? `${field} = ${defaults.join(' / ')}` : field
          entry.slicers.push(group ? `${shown} (sincronizado: ${group})` : shown)
        }
      } else {
        const line = describeVisual(type, fields)
        if (line) entry.visuals.push(line)
      }
      pageMap.set(page, entry)
    } catch { /* Only safe metadata is retained. */ }
  }
  const reportMap: PublishedPageMap[] = [...new Set([...pages, ...pageMap.keys()])]
    .map((name) => ({
      name,
      visuals: [...new Set(pageMap.get(name)?.visuals ?? [])].slice(0, 14),
      slicers: [...new Set(pageMap.get(name)?.slicers ?? [])].slice(0, 14),
    }))
    .filter((page) => page.visuals.length || page.slicers.length)
  if (!measures.length || !modelColumns.length) throw new PublishedSchemaError('O Fabric não devolveu medidas e colunas do modelo.')
  return { modelHash: hash.digest('hex'), modelDescription, measures, columns: modelColumns,
    relationships: relationships.slice(0, 50), pages: pages.slice(0, 100), reportMap, visualCount, visuals }
}

export function assertPublishedCatalog(manifest: BiManifest, published: PublishedSchema, checkHash = true): void {
  const expectedHash = asRecord(manifest.raw.source).publishedModelHash
  if (checkHash && typeof expectedHash === 'string' && expectedHash !== published.modelHash) {
    throw new PublishedSchemaError('A definição do modelo no Fabric mudou desde o registro do manifesto.')
  }
  const liveMeasures = new Set(published.measures.map((item) => item.name.toLowerCase()))
  const liveColumns = new Set(published.columns.map((item) => `${item.table}[${item.name}]`.toLowerCase()))
  const missingMeasures = manifest.measures.filter((item) => item.queryable && !item.presentationOnly
    && !liveMeasures.has(item.name.toLowerCase()))
  const missingColumns = manifest.tables.filter((table) => table.queryable)
    .flatMap((table) => table.columns.filter((column) => column.queryable
      && !liveColumns.has(`${table.name}[${column.name}]`.toLowerCase())))
  if (missingMeasures.length || missingColumns.length) {
    throw new PublishedSchemaError(`O modelo publicado divergiu do manifesto: ${missingMeasures.length} medidas e ${missingColumns.length} colunas ausentes.`)
  }
}

/** Enrich the curated manifest context with the current published definitions. */
export function withPublishedSchema(context: SelectedContext, manifest: BiManifest, published: PublishedSchema): SelectedContext {
  assertPublishedCatalog(manifest, published)
  const liveMeasures = new Map(published.measures.map((item) => [item.name.toLowerCase(), item]))
  const liveColumns = new Set(published.columns.map((item) => `${item.table}[${item.name}]`.toLowerCase()))
  const missingMeasures = context.measures.filter((item) => !liveMeasures.has(item.name.toLowerCase()))
  const missingColumns = context.columns.filter((item) => !liveColumns.has(`${item.table}[${item.name}]`.toLowerCase()))
  if (missingMeasures.length || missingColumns.length) {
    throw new PublishedSchemaError(`O modelo publicado divergiu do manifesto: ${missingMeasures.length} medidas e ${missingColumns.length} colunas ausentes.`)
  }
  const measures = context.measures.map((item) => ({ ...item,
    publishedExpression: liveMeasures.get(item.name.toLowerCase())?.expression }))
  const allowedMeasures = new Set(manifest.measures.filter((item) => item.queryable && !item.restricted && !item.presentationOnly)
    .map((item) => item.name.toLowerCase()))
  const allowedColumns = new Set(manifest.tables.filter((item) => item.queryable)
    .flatMap((table) => table.columns.filter((column) => column.queryable && !column.restricted && !column.presentationOnly)
      .map((column) => `${table.name}[${column.name}]`.toLowerCase())))
  const result: SelectedContext = { ...context, measures,
    availableMeasures: published.measures.filter((item) => allowedMeasures.has(item.name.toLowerCase())).map((item) => item.name),
    availableDimensions: published.columns.filter((item) => allowedColumns.has(`${item.table}[${item.name}]`.toLowerCase()))
      .map((item) => `${item.table}[${item.name}]`),
    relationships: published.relationships.slice(0, 12),
    pages: published.pages.length ? published.pages.slice(0, 12) : context.pages,
    // `?.` é obrigatório: o cache de módulo do publishedSchema pode devolver um
    // objeto no formato antigo (sem reportMap), e um TypeError aqui viraria
    // "Fabric indisponível" — mensagem que esconde o problema real.
    reportMap: published.reportMap?.length ? published.reportMap.map((page) => {
      const parts: string[] = []
      if (page.visuals?.length) parts.push(`mostra: ${page.visuals.slice(0, 8).join(' | ')}`)
      if (page.slicers?.length) parts.push(`filtros: ${page.slicers.slice(0, 8).join(' | ')}`)
      return parts.length ? `${page.name} — ${parts.join(' · ')}` : ''
    }).filter(Boolean).slice(0, 20) : context.reportMap,
    publishedVisuals: (published.visuals ?? []).filter((visual) => visual.fields.some((field) =>
      context.measures.some((measure) => field.endsWith(`[${measure.name}]`)))).slice(0, 8)
      .map((visual) => `${visual.page}: ${visual.type} (${visual.fields.join(', ')})`),
    source: 'Definição atual do modelo e relatório publicados no Fabric',
  }
  while (JSON.stringify(result).length > 34_000) {
    const formula = result.measures.findLast((item) => item.publishedExpression)
    if (formula) { formula.publishedExpression = undefined; continue }
    if (result.availableDimensions.length) result.availableDimensions.pop()
    else if (result.availableMeasures.length) result.availableMeasures.pop()
    else if (result.publishedVisuals?.length) result.publishedVisuals.pop()
    else if (result.reportMap.length > 3) result.reportMap.pop()
    else if (result.pages.length) result.pages.pop()
    else break
  }
  return result
}
