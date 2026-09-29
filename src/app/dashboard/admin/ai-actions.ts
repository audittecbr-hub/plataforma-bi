'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { PROVEDORES, ErroProvedor, conversar, chaveDoProvedor, listarModelosDoProvedor } from '@/lib/llm'
import { lerConfigIa, salvarConfigIa } from '@/lib/llm-config'
import { encryptionConfigured, readProviderSettings, removeStoredProviderKey,
  setModelEnabled, setProviderEnabled, storeProviderKey } from '@/lib/ai-keyring'
import { isReasoningEffort, modelSupportedByAdapter, reasoningOptions, type ReasoningEffort } from '@/lib/ai-reasoning'
import { parseLinkedManifest } from '@/lib/bi-ai/manifest'
import { previewLiveManifest } from '@/lib/bi-ai/registry'

async function requireAdminId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sessão expirada. Entre novamente.')
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) throw new Error('Permissão de administrador necessária.')
  return user.id
}

function provider(id: string) {
  const selected = PROVEDORES.find((item) => item.id === id)
  if (!selected) throw new Error('Provedor não reconhecido.')
  return selected
}

function modelId(value: string): string {
  const id = value.trim()
  if (!id || id.length > 160 || !/^[A-Za-z0-9._:/-]+$/.test(id)) throw new Error('Identificador de modelo inválido.')
  return id
}

export async function getAiAdminState() {
  await requireAdminId()
  const admin = createAdminClient()
  const [config, providerRows, dashboardRows, configProbe] = await Promise.all([
    lerConfigIa(),
    Promise.all(PROVEDORES.map(async (entry) => {
      const state = await readProviderSettings(entry.id, entry.envChaves)
      return { id: entry.id, name: entry.nome, format: entry.formato,
        modelDefault: entry.modeloPadrao, endpointConfigured: !!entry.baseUrl,
        envNames: entry.envChaves, ...state }
    })),
    admin.from('dashboards').select('id, name, dataset_id, workspace_id, ai_enabled, ai_manifest_version, ai_manifest_synced_at')
      .order('name', { ascending: true }).limit(200),
    admin.from('gs_config_ia').select('enabled').eq('id', 'global').maybeSingle(),
  ])
  const { error: keyTableError } = await admin.from('gs_ia_provider_config').select('provider_id').limit(1)
  const migrationReady = !keyTableError && !configProbe.error && !dashboardRows.error
  const dashboards = (dashboardRows.data ?? []).map((row) => ({
    id: row.id as string, name: row.name as string,
    linked: !!row.dataset_id,
    workspaceLinked: !!row.workspace_id,
    enabled: row.ai_enabled === true,
    manifestVersion: row.ai_manifest_version as string | null,
    syncedAt: row.ai_manifest_synced_at as string | null,
  }))
  return { config, providers: providerRows, dashboards, migrationReady,
    encryptionConfigured: encryptionConfigured() }
}

export async function listAiModels(providerId: string) {
  await requireAdminId()
  provider(providerId)
  return listarModelosDoProvedor(providerId)
}

export async function saveAiGlobal(input: {
  enabled: boolean
  providerId: string
  model: string
  reasoningEffort: ReasoningEffort
  plannerMaxTokens: number
  answerMaxTokens: number
}) {
  const userId = await requireAdminId()
  const selected = provider(input.providerId)
  const model = modelId(input.model)
  if (!isReasoningEffort(input.reasoningEffort)
    || !reasoningOptions(selected.id, model).includes(input.reasoningEffort)) {
    return { ok: false, error: 'Nível de raciocínio indisponível para este modelo.' }
  }
  if (input.enabled && (!selected.baseUrl || !(await chaveDoProvedor(selected)))) {
    return { ok: false, error: 'Configure e ative a chave do provedor antes de ligar o Chat.' }
  }
  const result = await salvarConfigIa({ provedorId: selected.id, modelo: model,
    enabled: input.enabled, reasoningEffort: input.reasoningEffort,
    plannerMaxTokens: input.plannerMaxTokens, answerMaxTokens: input.answerMaxTokens }, userId)
  if (result.ok) revalidatePath('/dashboard/admin')
  return { ok: result.ok, error: result.erro }
}

export async function saveAiProviderKey(providerId: string, secret: string) {
  const userId = await requireAdminId()
  provider(providerId)
  try {
    await storeProviderKey(providerId, secret, userId)
    revalidatePath('/dashboard/admin')
    return { ok: true }
  } catch (error) {
    console.error('[ai admin] key store failed:', error instanceof Error ? error.message : error)
    return { ok: false, error: 'Não foi possível salvar a chave. Confira a migration e BI_AI_ENCRYPTION_KEY.' }
  }
}

export async function deleteAiProviderKey(providerId: string) {
  const userId = await requireAdminId()
  provider(providerId)
  try {
    await removeStoredProviderKey(providerId, userId)
    revalidatePath('/dashboard/admin')
    return { ok: true }
  } catch (error) {
    console.error('[ai admin] key removal failed:', error)
    return { ok: false, error: 'Não foi possível remover a chave armazenada.' }
  }
}

export async function toggleAiProvider(providerId: string, enabled: boolean) {
  const userId = await requireAdminId()
  provider(providerId)
  try {
    await setProviderEnabled(providerId, enabled, userId)
    revalidatePath('/dashboard/admin')
    return { ok: true }
  } catch (error) {
    console.error('[ai admin] provider toggle failed:', error)
    return { ok: false, error: 'Não foi possível atualizar o provedor.' }
  }
}

export async function toggleAiModel(providerId: string, rawModel: string, enabled: boolean) {
  const userId = await requireAdminId()
  provider(providerId)
  const model = modelId(rawModel)
  if (enabled && !modelSupportedByAdapter(providerId, model)) {
    return { ok: false, error: 'Este modelo exige um protocolo que o Portal ainda não atende.' }
  }
  try {
    await setModelEnabled(providerId, model, enabled, userId)
    revalidatePath('/dashboard/admin')
    return { ok: true }
  } catch (error) {
    console.error('[ai admin] model toggle failed:', error)
    return { ok: false, error: 'Não foi possível atualizar o modelo.' }
  }
}

export async function testAiModel(providerId: string, rawModel: string, effort: ReasoningEffort) {
  await requireAdminId()
  provider(providerId)
  const model = modelId(rawModel)
  if (!isReasoningEffort(effort) || !reasoningOptions(providerId, model).includes(effort)) {
    return { ok: false, error: 'Nível de raciocínio indisponível.' }
  }
  try {
    const answer = await conversar({ provedorId: providerId, modelo: model }, [
      { role: 'system', content: 'Responda exatamente OK.' },
      { role: 'user', content: 'Teste de conectividade.' },
    ], { maxTokens: 1024, reasoningEffort: effort })
    return { ok: !!answer.texto, error: answer.texto ? undefined : 'O provedor não retornou texto.',
      durationMs: answer.ms, model: answer.modelo }
  } catch (error) {
    console.error('[ai admin] model test failed:', error instanceof Error ? error.message : error)
    return { ok: false, error: error instanceof ErroProvedor ? error.message
      : 'O provedor recusou o teste. Confira chave, modelo, formato e nível de raciocínio.' }
  }
}

export async function toggleDashboardAi(dashboardId: string, enabled: boolean) {
  await requireAdminId()
  const admin = createAdminClient()
  const { data: dashboard, error } = await admin.from('dashboards').select('*').eq('id', dashboardId).maybeSingle()
  if (error || !dashboard) return { ok: false, error: 'Dashboard não encontrado.' }
  if (enabled) {
    try {
      if (dashboard.ai_manifest) parseLinkedManifest({ ...dashboard, ai_enabled: true })
      else await previewLiveManifest({ ...dashboard, ai_enabled: true })
    } catch (error) {
      console.error('[ai admin] dashboard activation failed:', error instanceof Error ? error.message : error)
      return { ok: false, error: 'Não foi possível confirmar o modelo e o relatório publicados no Fabric. Confira os IDs e as permissões do serviço.' }
    }
  }
  const { error: updateError } = await admin.from('dashboards').update({ ai_enabled: enabled }).eq('id', dashboardId)
  if (updateError) return { ok: false, error: 'Não foi possível atualizar o dashboard.' }
  revalidatePath('/dashboard/admin')
  return { ok: true }
}
