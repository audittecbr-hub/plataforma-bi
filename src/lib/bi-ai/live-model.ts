import 'server-only'

import { executeDaxQuery } from '@/lib/powerbi'
import { UUID, safeMetadataText, safeText } from './manifest'
import type { PublishedSchema } from './fabric-schema'
import type { DashboardRow } from './access'

/**
 * Catálogo do modelo lido AO VIVO pelo endpoint executeQueries (INFO.VIEW.*).
 *
 * Isto é o que permite liberar um projeto no portal sem preparar nada no modelo:
 * não existe manifesto, curadoria nem script por projeto. As descrições escritas
 * no Power BI viram o contexto da IA, completas e sem truncamento.
 *
 * Limitação conhecida e verificada em 29/09/2026: o endpoint executeQueries REMOVE
 * a coluna [Expression] de INFO.VIEW.MEASURES(). As expressões DAX chegam por outro
 * caminho (definição Fabric, ver fabric-context.ts). As descrições, que carregam a
 * regra de negócio, chegam normalmente.
 */

const CACHE_MS = 10 * 60_000

export interface LiveColumn {
  table: string
  name: string
  dataType: string
  formatString: string
  hidden: boolean
  description: string
}

export interface LiveMeasure {
  name: string
  table: string
  description: string
  formatString: string
  displayFolder: string
  hidden: boolean
}

export interface LiveCatalog {
  tables: { name: string; description: string; hidden: boolean }[]
  columns: LiveColumn[]
  measures: LiveMeasure[]
  relationships: string[]
}

const cache = new Map<string, { expiresAt: number; promise: Promise<LiveCatalog> }>()

/** As chaves do executeQueries vêm como "[Nome]" ou "Nome" conforme o caminho. */
function pick(row: Record<string, unknown>, key: string): string {
  const value = row[`[${key}]`] ?? row[key]
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value)
}

function flag(row: Record<string, unknown>, key: string): boolean {
  const value = row[`[${key}]`] ?? row[key]
  return value === true || value === 'true' || value === 'True'
}

const Q_TABLES = `EVALUATE SELECTCOLUMNS(INFO.VIEW.TABLES(), "Name", [Name], "Description", [Description], "IsHidden", [IsHidden])`
const Q_COLUMNS = `EVALUATE SELECTCOLUMNS(INFO.VIEW.COLUMNS(), "Table", [Table], "Name", [Name], "DataType", [DataType], "FormatString", [FormatString], "IsHidden", [IsHidden], "Description", [Description])`
const Q_MEASURES = `EVALUATE SELECTCOLUMNS(INFO.VIEW.MEASURES(), "Name", [Name], "Table", [Table], "Description", [Description], "FormatString", [FormatString], "DisplayFolder", [DisplayFolder], "IsHidden", [IsHidden])`
const Q_RELATIONSHIPS = `EVALUATE SELECTCOLUMNS(INFO.VIEW.RELATIONSHIPS(), "FromTable", [FromTable], "FromColumn", [FromColumn], "ToTable", [ToTable], "ToColumn", [ToColumn], "FromCardinality", [FromCardinality], "ToCardinality", [ToCardinality], "IsActive", [IsActive], "CrossFilteringBehavior", [CrossFilteringBehavior])`

async function load(workspaceId: string, semanticModelId: string, signal?: AbortSignal): Promise<LiveCatalog> {
  const run = (dax: string) => executeDaxQuery({ workspaceId, semanticModelId, dax, signal })
  const [tableRows, columnRows, measureRows, relationshipRows] = await Promise.all([
    run(Q_TABLES), run(Q_COLUMNS), run(Q_MEASURES),
    run(Q_RELATIONSHIPS).catch(() => [] as Record<string, unknown>[]),
  ])
  return {
    tables: tableRows.map((row) => ({
      name: safeText(pick(row, 'Name'), 200),
      description: safeMetadataText(pick(row, 'Description'), 1200),
      hidden: flag(row, 'IsHidden'),
    })).filter((table) => table.name),
    columns: columnRows.map((row) => ({
      table: safeText(pick(row, 'Table'), 200),
      name: safeText(pick(row, 'Name'), 200),
      dataType: safeText(pick(row, 'DataType'), 40),
      formatString: safeText(pick(row, 'FormatString'), 80),
      hidden: flag(row, 'IsHidden'),
      description: safeMetadataText(pick(row, 'Description'), 1200),
    })).filter((column) => column.table && column.name),
    measures: measureRows.map((row) => ({
      name: safeText(pick(row, 'Name'), 200),
      table: safeText(pick(row, 'Table'), 200),
      description: safeMetadataText(pick(row, 'Description'), 4000),
      formatString: safeText(pick(row, 'FormatString'), 80),
      displayFolder: safeText(pick(row, 'DisplayFolder'), 120),
      hidden: flag(row, 'IsHidden'),
    })).filter((measure) => measure.name),
    relationships: relationshipRows.map((row) => {
      const from = `${pick(row, 'FromTable')}[${pick(row, 'FromColumn')}]`
      const to = `${pick(row, 'ToTable')}[${pick(row, 'ToColumn')}]`
      const cardinality = `${pick(row, 'FromCardinality')}:${pick(row, 'ToCardinality')}`
      const active = pick(row, 'IsActive') === '' ? 'True' : pick(row, 'IsActive')
      const direction = pick(row, 'CrossFilteringBehavior') || 'OneDirection'
      return `${from} → ${to} (${cardinality}, ${direction}${active === 'False' ? ', INATIVO' : ''})`
    }).filter((value) => value.includes('→')),
  }
}

/** Catálogo do modelo publicado, cacheado por instância de servidor. */
export function liveCatalog(workspaceId: string, semanticModelId: string, signal?: AbortSignal): Promise<LiveCatalog> {
  const key = `${workspaceId}:${semanticModelId}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = load(workspaceId, semanticModelId, signal)
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, promise })
  promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key) })
  return promise
}

/**
 * Medidas usadas APENAS por visuais de HTML são de apresentação.
 * É o sinal mais confiável e não exige curadoria: vem do próprio relatório.
 */
function presentationFromReport(published: PublishedSchema | null): Set<string> {
  const only = new Set<string>()
  if (!published?.visuals?.length) return only
  const normal = new Set<string>()
  for (const visual of published.visuals) {
    const isHtml = /^htmlContent/i.test(visual.type)
    for (const field of visual.fields ?? []) {
      const name = field.includes('[') ? field.slice(field.indexOf('[') + 1, field.lastIndexOf(']')) : field
      if (isHtml) only.add(name)
      else normal.add(name)
    }
  }
  for (const name of normal) only.delete(name)
  return only
}

const NOME_APRESENTACAO = /^(?:html_|painel_|_css|_js|_logo|mockup_)/i

export interface SynthesizeInput {
  dashboard: DashboardRow
  catalog: LiveCatalog
  published: PublishedSchema | null
}

/**
 * Constrói um manifesto válido a partir do modelo ao vivo.
 * Passa por parseManifest, então todo o restante do pipeline funciona sem alteração.
 */
export function synthesizeManifest({ dashboard, catalog, published }: SynthesizeInput): Record<string, unknown> {
  if (!published) throw new Error('A definição publicada do Fabric é necessária para catalogar o BI.')
  const apresentacao = presentationFromReport(published)
  const publishedTables = new Set([
    ...published.columns.map((column) => column.table.toLowerCase()),
    ...published.measures.map((measure) => measure.table.toLowerCase()),
  ])
  const publishedColumns = new Set(published.columns.map((column) => `${column.table}[${column.name}]`.toLowerCase()))
  const publishedMeasures = new Set(published.measures.map((measure) => measure.name.toLowerCase()))

  const tables = catalog.tables.filter((table) => publishedTables.has(table.name.toLowerCase())).map((table) => ({
    name: table.name,
    description: table.description,
      // INFO.VIEW acrescenta RowNumber interno em cada tabela. Só os campos
      // presentes na definição TMDL são dados do modelo para consultas.
      columns: catalog.columns
      .filter((column) => column.table === table.name
        && publishedColumns.has(`${column.table}[${column.name}]`.toLowerCase()))
      .map((column) => ({
        name: column.name,
        dataType: column.dataType,
        formatString: column.formatString,
        description: column.description,
        restricted: false,
        queryable: true,
        aggregatable: /^(?:int|integer|decimal|double|float|currency|number|numeric|whole)/i.test(column.dataType),
      })),
  }))

  const measures = catalog.measures.filter((measure) => publishedMeasures.has(measure.name.toLowerCase())).map((measure) => {
    const deApresentacao = NOME_APRESENTACAO.test(measure.name)
      || apresentacao.has(measure.name)
    return {
      name: measure.name,
      table: measure.table,
      description: measure.description,
      formatString: measure.formatString,
      displayFolder: measure.displayFolder,
      presentationOnly: deApresentacao,
      queryable: !deApresentacao,
      preferredMeasure: !deApresentacao,
    }
  })

  const modelDescription = published.modelDescription ?? ''

  return {
    schemaVersion: '2.0',
    identity: {
      workspaceId: dashboard.workspace_id,
      semanticModelId: dashboard.dataset_id,
      reportId: dashboard.report_id ?? null,
      dashboardId: dashboard.id,
      dashboardKey: dashboard.name,
    },
    source: {
      workspaceId: dashboard.workspace_id,
      semanticModelId: dashboard.dataset_id,
      reportId: dashboard.report_id ?? null,
      mode: 'live',
      generatedAt: new Date().toISOString(),
      registrationReady: true,
    },
    capabilities: {
      slicerStateReadableByPortal: false,
      liveDefinitionRequired: true,
      fullModelAccess: true,
      source: 'INFO.VIEW.* + definição Fabric',
    },
    business: {
      domain: dashboard.name,
      description: safeMetadataText(modelDescription || `Modelo semântico ${dashboard.name}, catalogado automaticamente do Power BI.`, 4000),
      grain: [],
      terms: [],
      synonyms: {},
      rules: [],
    },
    model: {
      tables,
      measures,
      relationships: catalog.relationships,
      timeFields: catalog.columns
        .filter((column) => /^(?:Date|Data)$/i.test(column.name) || /^(?:Ano|MesNumero|MesAno|Trimestre|Período DRE)$/i.test(column.name))
        .map((column) => `${column.table}[${column.name}]`),
    },
    report: {
      pages: (published?.reportMap ?? []).map((page) => ({
        displayName: page.name,
        mainVisuals: page.visuals.map((title) => ({ title })),
        slicers: page.slicers,
      })),
      reportMap: published?.reportMap ?? [],
      visuals: published?.visuals ?? [],
      visualCountAnalyzed: published?.visualCount ?? 0,
      globalFilters: [],
      slicers: (published?.reportMap ?? []).flatMap((page) => page.slicers.map((slicer) => `${page.name}: ${slicer}`)),
    },
    queryPolicy: {
      preferredMeasures: measures.filter((measure) => measure.preferredMeasure).map((measure) => measure.name).slice(0, 40),
      presentationOnlyMeasures: measures.filter((measure) => measure.presentationOnly).map((measure) => measure.name),
      technicalObjects: [],
      restrictedFields: [],
      defaultMaxRows: 200,
      maxRows: 500,
      maxQueries: 6,
      allowRestrictedForAdmins: false,
      allowDirectColumnAggregation: true,
      requireTopNForDetail: true,
      useOfficialMeasures: false,
    },
    recommendedQuestions: [],
    queryExamples: [],
    ambiguities: [],
  }
}

export function liveManifestInput(dashboard: DashboardRow): { workspaceId: string; semanticModelId: string } {
  const workspaceId = dashboard.workspace_id?.trim()
  const semanticModelId = dashboard.dataset_id?.trim()
  if (!workspaceId || !semanticModelId || !UUID.test(workspaceId) || !UUID.test(semanticModelId)) {
    throw new Error('Dashboard sem workspace_id/dataset_id: não há como catalogar o modelo ao vivo.')
  }
  return { workspaceId, semanticModelId }
}
