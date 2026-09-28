import 'server-only'

import { createAdminClient } from '@/utils/supabase/admin'
import { decryptApiKey, encryptApiKey, parseEncryptionKey } from '@/lib/ai-key-crypto'

export interface ProviderSettings {
  enabled: boolean
  hasStoredKey: boolean
  hasEnvironmentKey: boolean
  disabledModels: string[]
  updatedAt: string | null
}

interface ProviderRow {
  provider_id: string
  enabled: boolean
  encrypted_api_key: string | null
  key_iv: string | null
  key_tag: string | null
  disabled_models: unknown
  updated_at: string | null
}

function masterKey(): Buffer | null {
  return parseEncryptionKey(process.env.BI_AI_ENCRYPTION_KEY)
}

export function encryptionConfigured(): boolean {
  try { return !!masterKey() } catch { return false }
}

function configuredEnvironmentKey(names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return null
}

async function providerRow(providerId: string): Promise<ProviderRow | null> {
  const { data, error } = await createAdminClient().from('gs_ia_provider_config')
    .select('provider_id, enabled, encrypted_api_key, key_iv, key_tag, disabled_models, updated_at')
    .eq('provider_id', providerId).maybeSingle()
  if (error) {
    if (/relation|schema cache|does not exist|could not find/i.test(error.message)) return null
    throw error
  }
  return data as ProviderRow | null
}

function disabledModels(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').slice(0, 500) : []
}

export async function readProviderSettings(providerId: string, envNames: string[]): Promise<ProviderSettings> {
  const row = await providerRow(providerId)
  return {
    enabled: row?.enabled !== false,
    hasStoredKey: !!row?.encrypted_api_key,
    hasEnvironmentKey: !!configuredEnvironmentKey(envNames),
    disabledModels: disabledModels(row?.disabled_models),
    updatedAt: row?.updated_at ?? null,
  }
}

export async function readProviderKey(providerId: string, envNames: string[]): Promise<string | null> {
  const row = await providerRow(providerId)
  if (row?.enabled === false) return null
  if (row?.encrypted_api_key) {
    const key = masterKey()
    if (!key || !row.key_iv || !row.key_tag) throw new Error('Chave de cifragem da IA ausente ou inválida.')
    return decryptApiKey(providerId, {
      encrypted_api_key: row.encrypted_api_key, key_iv: row.key_iv, key_tag: row.key_tag,
    }, key)
  }
  return configuredEnvironmentKey(envNames)
}

async function saveRow(providerId: string, patch: Partial<ProviderRow>, userId: string): Promise<void> {
  const current = await providerRow(providerId)
  const next = {
    provider_id: providerId,
    enabled: current?.enabled ?? true,
    encrypted_api_key: current?.encrypted_api_key ?? null,
    key_iv: current?.key_iv ?? null,
    key_tag: current?.key_tag ?? null,
    disabled_models: current?.disabled_models ?? [],
    ...patch,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }
  const { error } = await createAdminClient().from('gs_ia_provider_config').upsert(next, { onConflict: 'provider_id' })
  if (error) throw error
}

export async function storeProviderKey(providerId: string, value: string, userId: string): Promise<void> {
  const key = masterKey()
  if (!key) throw new Error('Configure BI_AI_ENCRYPTION_KEY no servidor antes de salvar chaves pela aba IA.')
  const secret = value.trim()
  if (secret.length < 12 || secret.length > 4096 || /[\r\n]/.test(secret)) throw new Error('Chave de API inválida.')
  await saveRow(providerId, encryptApiKey(providerId, secret, key), userId)
}

export async function removeStoredProviderKey(providerId: string, userId: string): Promise<void> {
  await saveRow(providerId, { encrypted_api_key: null, key_iv: null, key_tag: null }, userId)
}

export async function setProviderEnabled(providerId: string, enabled: boolean, userId: string): Promise<void> {
  await saveRow(providerId, { enabled }, userId)
}

export async function setModelEnabled(providerId: string, model: string, enabled: boolean, userId: string): Promise<void> {
  const current = await providerRow(providerId)
  const disabled = new Set(disabledModels(current?.disabled_models))
  if (enabled) disabled.delete(model)
  else disabled.add(model)
  await saveRow(providerId, { disabled_models: [...disabled].sort() }, userId)
}

export async function modelEnabled(providerId: string, model: string): Promise<boolean> {
  const row = await providerRow(providerId)
  return row?.enabled !== false && !disabledModels(row?.disabled_models).includes(model)
}
