import { createHash } from 'node:crypto'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VERSION = /^(?:1|2)(?:\.\d+)?$/

export interface BiObject {
  name: string
  table?: string
  description: string
  synonyms: string[]
  restricted: boolean
  presentationOnly: boolean
  preferredMeasure: boolean
  queryable: boolean
  semanticRole?: string
  aggregatable: boolean
  dependencies: string[]
  intent?: string
  whenToUse?: string
  whenNotToUse?: string
  expectedDimensions: string[]
  publishedExpression?: string
  format?: string
  dataType?: string
}

export interface BiTable {
  name: string
  description: string
  synonyms: string[]
  queryable: boolean
  fact: boolean
  columns: BiObject[]
}

export interface BiManifest {
  raw: Record<string, unknown>
  schemaVersion: string
  workspaceId: string
  semanticModelId: string
  reportId: string | null
  dashboardId: string | null
  dashboardKey: string | null
  business: Record<string, unknown>
  report: Record<string, unknown>
  capabilities: Record<string, unknown>
  tables: BiTable[]
  measures: BiObject[]
  recommendedQuestions: string[]
  queryExamples: { question: string; dax: string }[]
  ambiguities: string[]
  policy: {
    maxRows: number
    maxQueries: number
    allowRestrictedForAdmins: boolean
    allowDirectColumnAggregation: boolean
  }
}

export class ManifestError extends Error {}

export class ManifestLinkError extends Error {
  constructor(readonly code: 'MANIFEST_MISSING' | 'AI_DISABLED' | 'MANIFEST_INVALID' | 'MANIFEST_IDENTITY_MISMATCH' | 'PUBLICATION_MISMATCH', message: string) {
    super(message)
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function valueOf(object: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (object[key] !== undefined) return object[key]
  return undefined
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Keep schema text concise and prevent HTML, CSS and embedded data from entering prompts. */
export function safeText(value: unknown, max = 280): string {
  const text = stringOf(value)
    .replace(/data:[^\s"']{20,}/gi, '[conteúdo embutido omitido]')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[A-Za-z0-9+/]{300,}={0,2}/g, '[Base64 omitido]')
    .replace(/\s+/g, ' ')
  return text.slice(0, max)
}

/** Text from Fabric metadata may include connection details in comments. */
export function safeMetadataText(value: unknown, max = 280): string {
  const text = typeof value === 'string' ? value : ''
  return safeText(text
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[servidor omitido]')
    .replace(/\b(?:PostgreSQL|Sql|Odbc|OData|Web|Excel|Folder)\.[A-Za-z_]+\s*\([^)]*\)/gi, '[conexão omitida]')
    .replace(/\b(?:Data Source|Server|Host|User ID|UID|Password|PWD|client_secret|service_role_key|api[_-]?key|access[_-]?token)\s*[:=]\s*[^;\s,]+/gi, '[credencial omitida]')
    .replace(/\b(?:postgres(?:ql)?|mssql|mysql):\/\/[^\s]+/gi, '[conexão omitida]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[endereço omitido]'), max)
}

function strings(value: unknown, maxCount = 12): string[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, maxCount).map((v) => safeText(typeof v === 'string' ? v : asRecord(v).description, 180)).filter(Boolean)
}

function entries(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(asRecord)
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([name, item]) => ({ name, ...asRecord(item) }))
  }
  return []
}

function identityId(kind: string, fields: unknown[]): string | null {
  const ids = fields.map(stringOf).filter(Boolean)
  if (!ids.length) return null
  if (ids.some((id) => !UUID.test(id))) throw new ManifestError(`${kind} deve ser um UUID válido.`)
  if (new Set(ids.map((id) => id.toLowerCase())).size !== 1) {
    throw new ManifestError(`${kind} diverge entre identity e source.`)
  }
  return ids[0].toLowerCase()
}

function normalObject(source: Record<string, unknown>, table?: string, fullModelAccess = false): BiObject {
  const name = safeText(valueOf(source, 'name', 'nome'), 200)
  const formula = stringOf(valueOf(source, 'expression', 'formula', 'dax'))
  const html = /<\s*(?:div|table|style|svg|html)|data:image|base64/i.test(formula)
  return {
    name,
    table,
    // 4000 chars: a descrição escrita no Power BI carrega a regra de negócio inteira
    // (o corte antigo de 400 jogava fora justamente o que a IA precisa).
    description: safeText(valueOf(source, 'description', 'descricao'), 4000),
    synonyms: strings(valueOf(source, 'synonyms', 'aliases', 'sinonimos')),
    restricted: !fullModelAccess && (source.restricted === true || source.classification === 'restricted'),
    presentationOnly: source.presentationOnly === true || html,
    preferredMeasure: source.preferredMeasure === true || source.preferred === true,
    queryable: fullModelAccess || (source.queryable !== false && source.technical !== true),
    semanticRole: safeText(source.semanticRole, 40) || undefined,
    aggregatable: source.aggregatable === true || source.aggregationAllowed === true
      || (fullModelAccess && /^(?:int|integer|decimal|double|float|currency|number|numeric|whole)/i
        .test(stringOf(valueOf(source, 'dataType', 'type')))),
    dependencies: strings(valueOf(source, 'dependencies', 'dependsOn'), 30),
    intent: safeText(source.intent, 250) || undefined,
    whenToUse: safeText(source.whenToUse, 300) || undefined,
    whenNotToUse: safeText(source.whenNotToUse, 300) || undefined,
    expectedDimensions: strings(source.expectedDimensions, 30),
    format: safeText(valueOf(source, 'format', 'formatString'), 80) || undefined,
    dataType: safeText(valueOf(source, 'dataType', 'type'), 40) || undefined,
  }
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value as number)) : fallback
}

export function parseManifest(input: unknown): BiManifest {
  const raw = asRecord(input)
  const schemaVersion = stringOf(raw.schemaVersion)
  if (!VERSION.test(schemaVersion)) throw new ManifestError('schemaVersion não suportado. Use a versão 1.x ou 2.x.')
  const identity = asRecord(raw.identity)
  const source = asRecord(raw.source)
  const model = asRecord(raw.model)
  // A autorização é pelo dashboard: após validá-la, o Chat pode consultar
  // todo o modelo semântico ligado a ele, inclusive manifestos antigos.
  const capabilities = { ...asRecord(raw.capabilities), fullModelAccess: true }
  const fullModelAccess = true
  const workspaceId = identityId('workspaceId', [identity.workspaceId, source.workspaceId, source.groupId])
  const semanticModelId = identityId('semanticModelId', [
    identity.semanticModelId, identity.datasetId, source.semanticModelId, source.datasetId,
  ])
  const reportId = identityId('reportId', [identity.reportId, source.reportId])
  const dashboardId = identityId('dashboardId', [identity.dashboardId, source.dashboardId])
  if (!workspaceId || !semanticModelId) {
    throw new ManifestError('identity/source precisam informar workspaceId e semanticModelId (ou datasetId).')
  }

  const tableRows = entries(valueOf(model, 'tables', 'tabelas'))
  const measureRows = entries(valueOf(model, 'measures', 'medidas'))
  if (tableRows.length > 500 || measureRows.length > 5000) throw new ManifestError('Catálogo semântico grande demais.')
  const tables: BiTable[] = tableRows.map((row) => {
    const name = safeText(valueOf(row, 'name', 'nome'), 200)
    const columns = entries(valueOf(row, 'columns', 'colunas'))
      .map((column) => normalObject(column, name, fullModelAccess))
    if (!name || columns.length > 1000 || columns.some((column) => !column.name)) {
      throw new ManifestError('Tabela ou coluna sem nome, ou tabela grande demais.')
    }
    return {
      name,
      description: safeText(valueOf(row, 'description', 'descricao'), 4000),
      synonyms: strings(valueOf(row, 'synonyms', 'aliases', 'sinonimos')),
      queryable: fullModelAccess || (row.queryable !== false && row.technical !== true),
      fact: row.fact === true || /^(fact|fato)$/i.test(stringOf(row.kind)) || /^(fact|fato)(?:[_ ]|$)/i.test(name),
      columns,
    }
  })
  const measures = measureRows.map((row) => normalObject(row,
    safeText(valueOf(row, 'table', 'tableName'), 200) || undefined, fullModelAccess))
  for (const table of tableRows) {
    const tableName = safeText(valueOf(table, 'name', 'nome'), 200)
    measures.push(...entries(valueOf(table, 'measures', 'medidas'))
      .map((measure) => normalObject(measure, tableName, fullModelAccess)))
  }
  if (!tables.length && !measures.length) throw new ManifestError('model precisa listar tabelas ou medidas.')
  if (measures.some((measure) => !measure.name)) throw new ManifestError('Medida sem nome.')
  const tableNames = tables.map((table) => table.name.toLowerCase())
  const measureNames = measures.map((measure) => measure.name.toLowerCase())
  if (new Set(tableNames).size !== tableNames.length || new Set(measureNames).size !== measureNames.length) {
    throw new ManifestError('Nomes duplicados de tabela ou medida.')
  }
  const policy = asRecord(raw.queryPolicy)
  const business = asRecord(raw.business)
  const report = asRecord(raw.report)
  const queryExamples = entries(raw.queryExamples).slice(0, 100).map((example) => ({
    question: safeText(valueOf(example, 'question', 'pergunta'), 250),
    dax: stringOf(example.dax).slice(0, 3000),
  })).filter((example) => example.question && example.dax
    && !/data:|base64|<\s*(?:div|table|style|svg|html)/i.test(example.dax))
  return {
    raw,
    schemaVersion,
    workspaceId,
    semanticModelId,
    reportId,
    dashboardId,
    dashboardKey: safeText(identity.dashboardKey, 100) || null,
    business,
    report,
    capabilities,
    tables,
    measures,
    recommendedQuestions: strings(raw.recommendedQuestions, 30),
    queryExamples,
    ambiguities: strings(raw.ambiguities, 30),
    policy: {
      maxRows: numberInRange(valueOf(policy, 'maxRows', 'defaultMaxRows'), 100, 1, 500),
      maxQueries: numberInRange(policy.maxQueries, 5, 1, 12),
      allowRestrictedForAdmins: policy.allowRestrictedForAdmins === true,
      allowDirectColumnAggregation: fullModelAccess || policy.allowDirectColumnAggregation === true,
    },
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function manifestHash(raw: Record<string, unknown>): string {
  return createHash('sha256').update(stable(raw)).digest('hex')
}

export function parseLinkedManifest(dashboard: {
  ai_manifest?: unknown
  ai_enabled?: boolean | null
  workspace_id?: string | null
  dataset_id?: string | null
  report_id?: string | null
  ai_manifest_version?: string | null
  ai_manifest_hash?: string | null
}): BiManifest {
  if (!dashboard.ai_manifest) throw new ManifestLinkError('MANIFEST_MISSING', 'Este relatório ainda não recebeu um manifesto semântico.')
  if (!dashboard.ai_enabled) throw new ManifestLinkError('AI_DISABLED', 'A IA ainda não está habilitada para este relatório.')
  if (asRecord(asRecord(dashboard.ai_manifest).source).registrationReady === false) {
    throw new ManifestLinkError('PUBLICATION_MISMATCH', 'O manifesto local aguarda sincronização com o modelo Power BI publicado.')
  }
  let manifest: BiManifest
  try { manifest = parseManifest(dashboard.ai_manifest) }
  catch { throw new ManifestLinkError('MANIFEST_INVALID', 'O manifesto deste relatório é inválido.') }
  if (dashboard.workspace_id?.toLowerCase() !== manifest.workspaceId
    || dashboard.dataset_id?.toLowerCase() !== manifest.semanticModelId
    || (manifest.reportId && dashboard.report_id?.toLowerCase() !== manifest.reportId)
    || dashboard.ai_manifest_version !== manifest.schemaVersion
    || dashboard.ai_manifest_hash !== manifestHash(manifest.raw)) {
    throw new ManifestLinkError('MANIFEST_IDENTITY_MISMATCH', 'O manifesto não corresponde ao vínculo Power BI deste dashboard.')
  }
  return manifest
}
