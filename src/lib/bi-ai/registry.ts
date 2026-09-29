import 'server-only'

import { createAdminClient } from '@/utils/supabase/admin'
import { BiAiError, type DashboardRow } from './access'
import { manifestHash, ManifestLinkError, parseLinkedManifest, parseManifest, type BiManifest } from './manifest'
import { publishedSchema } from './fabric-context'
import { assertPublishedCatalog } from './fabric-schema'
import { liveCatalog, liveManifestInput, synthesizeManifest } from './live-model'

/**
 * O manifesto curado tem prioridade quando existe.
 * Sem manifesto, o modelo publicado é catalogado AO VIVO (INFO.VIEW.* + definição Fabric),
 * o que permite liberar qualquer projeto no portal sem preparar nada no Power BI.
 */
export async function previewLiveManifest(dashboard: DashboardRow): Promise<BiManifest> {
  const { workspaceId, semanticModelId } = liveManifestInput(dashboard)
  const [published, catalog] = await Promise.all([
    publishedSchema(workspaceId, semanticModelId, dashboard.report_id ?? null),
    liveCatalog(workspaceId, semanticModelId),
  ])
  const manifest = parseManifest(synthesizeManifest({ dashboard, catalog, published }))
  assertPublishedCatalog(manifest, published, false)
  return manifest
}

export async function manifestForDashboard(dashboard: DashboardRow): Promise<BiManifest> {
  if (dashboard.ai_enabled !== true) {
    throw new BiAiError(409, 'AI_DISABLED', 'A IA ainda não está habilitada para este relatório.')
  }
  try {
    return parseLinkedManifest(dashboard)
  } catch (error) {
    if (!(error instanceof ManifestLinkError)) throw error
    if (error.code !== 'MANIFEST_MISSING') {
      console.error('[bi-ai] manifest link:', dashboard.id, error.code)
      throw new BiAiError(409, error.code, error.message)
    }
  }
  try {
    return await previewLiveManifest(dashboard)
  } catch (error) {
    console.error('[bi-ai] live catalog:', dashboard.id, error)
    throw new BiAiError(409, 'LIVE_CATALOG_FAILED',
      'Não consegui catalogar este modelo no Power BI. Confira o vínculo do dashboard e as permissões do serviço.')
  }
}

export async function registerManifest(manifest: BiManifest, explicitDashboardId: string | null) {
  const admin = createAdminClient()
  const id = explicitDashboardId ?? manifest.dashboardId
  if (id && manifest.dashboardId && id !== manifest.dashboardId) {
    throw new BiAiError(400, 'IDENTITY_MISMATCH', 'dashboardId do pedido diverge do manifesto.')
  }
  const query = admin.from('dashboards').select('*')
  const { data, error } = id
    ? await query.eq('id', id)
    : await query.eq('dataset_id', manifest.semanticModelId)
  if (error) {
    console.error('[bi-ai] register lookup:', error)
    throw new BiAiError(503, 'DATABASE_ERROR', 'Não consegui localizar o vínculo do dashboard.')
  }
  const candidates = (data ?? [] as DashboardRow[]).filter((row) => {
    if (row.dataset_id && row.dataset_id.toLowerCase() !== manifest.semanticModelId) return false
    if (row.workspace_id && row.workspace_id.toLowerCase() !== manifest.workspaceId) return false
    if (manifest.reportId && row.report_id && row.report_id.toLowerCase() !== manifest.reportId) return false
    return true
  })
  if (!candidates.length) {
    throw new BiAiError(404, 'LINK_NOT_FOUND', 'Nenhum dashboard possui esse vínculo por ID. Cadastre dataset_id ou informe dashboardId explícito.')
  }
  if (candidates.length > 1) {
    throw new BiAiError(409, 'AMBIGUOUS_LINK', 'Mais de um dashboard corresponde aos IDs. Informe dashboardId explícito no registro.')
  }
  const dashboard = candidates[0] as DashboardRow
  const hash = manifestHash(manifest.raw)
  const unchanged = dashboard.ai_manifest_hash === hash
    && dashboard.workspace_id?.toLowerCase() === manifest.workspaceId
    && dashboard.dataset_id?.toLowerCase() === manifest.semanticModelId
    && (!manifest.reportId || dashboard.report_id?.toLowerCase() === manifest.reportId)
  if (unchanged) return { dashboardId: dashboard.id, hash, unchanged: true }
  const { error: updateError } = await admin.from('dashboards').update({
    dataset_id: manifest.semanticModelId,
    workspace_id: manifest.workspaceId,
    report_id: manifest.reportId ?? dashboard.report_id ?? null,
    ai_enabled: dashboard.ai_manifest ? dashboard.ai_enabled : true,
    ai_manifest: manifest.raw,
    ai_manifest_version: manifest.schemaVersion,
    ai_manifest_hash: hash,
    ai_manifest_synced_at: new Date().toISOString(),
  }).eq('id', dashboard.id)
  if (updateError) {
    console.error('[bi-ai] register update:', updateError)
    throw new BiAiError(503, 'MIGRATION_REQUIRED', 'Não consegui salvar o manifesto. Aplique a migration do Chat IA.')
  }
  return { dashboardId: dashboard.id, hash, unchanged: false }
}
