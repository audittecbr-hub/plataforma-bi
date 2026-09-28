import 'server-only'

import { createAdminClient } from '@/utils/supabase/admin'
import { BiAiError } from './access'
import { UUID } from './manifest'
import { conversationBelongsToDashboard } from '@/lib/permissions'

export async function takeRateLimit(userId: string): Promise<void> {
  const { data, error } = await createAdminClient().rpc('gs_bi_take_rate_limit', {
    p_user_id: userId,
    p_max: 10,
  })
  if (error) {
    console.error('[bi-ai] rate limit:', error)
    throw new BiAiError(503, 'MIGRATION_REQUIRED', 'Proteção do Chat IA indisponível. Aplique a migration.')
  }
  if (data !== true) throw new BiAiError(429, 'RATE_LIMIT', 'Muitas perguntas em um minuto. Tente novamente em instantes.')
}

export async function resolveConversation(userId: string, dashboardId: string, conversationId: string | null) {
  const admin = createAdminClient()
  if (conversationId) {
    if (!UUID.test(conversationId)) throw new BiAiError(400, 'INVALID_CONVERSATION', 'conversationId inválido.')
    const { data, error } = await admin.from('gs_bi_conversations')
      .select('id, user_id, dashboard_id').eq('id', conversationId).maybeSingle()
    if (error) {
      console.error('[bi-ai] conversation lookup:', error)
      throw new BiAiError(503, 'MIGRATION_REQUIRED', 'Conversas indisponíveis. Aplique a migration.')
    }
    if (!data) throw new BiAiError(404, 'CONVERSATION_NOT_FOUND', 'Conversa não encontrada.')
    if (!conversationBelongsToDashboard(data, userId, dashboardId)) {
      throw new BiAiError(403, 'CONVERSATION_FORBIDDEN', 'Esta conversa pertence a outro dashboard ou usuário.')
    }
    return conversationId
  }
  const { data, error } = await admin.from('gs_bi_conversations')
    .insert({ user_id: userId, dashboard_id: dashboardId }).select('id').single()
  if (error || !data) {
    console.error('[bi-ai] conversation create:', error)
    throw new BiAiError(503, 'MIGRATION_REQUIRED', 'Conversas indisponíveis. Aplique a migration.')
  }
  return data.id as string
}

export async function previousTurns(conversationId: string): Promise<{ question: string; answer: string }[]> {
  const { data, error } = await createAdminClient().from('gs_chat_log')
    .select('pergunta, resposta').eq('conversation_id', conversationId)
    .order('criado_em', { ascending: false }).limit(4)
  if (error) {
    console.error('[bi-ai] history:', error)
    throw new BiAiError(503, 'MIGRATION_REQUIRED', 'Histórico indisponível. Aplique a migration.')
  }
  return (data ?? []).reverse().map((row) => ({
    question: String(row.pergunta ?? '').slice(0, 500),
    answer: String(row.resposta ?? '').slice(0, 1200),
  }))
}

export async function recordTurn(input: {
  userId: string
  dashboardId: string
  conversationId: string
  dashboardName: string
  question: string
  answer: string
  queries: { purpose: string; dax: string; rowCount: number }[]
  provider: string
  model: string
  tokens: number
  durationMs: number
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('gs_chat_log').insert({
    user_id: input.userId,
    dashboard_id: input.dashboardId,
    conversation_id: input.conversationId,
    painel: input.dashboardName,
    pergunta: input.question,
    resposta: input.answer,
    consultas: input.queries,
    provedor: input.provider,
    modelo: input.model,
    tokens: input.tokens,
    ms: input.durationMs,
  })
  if (error) {
    console.error('[bi-ai] save turn:', error)
    throw new BiAiError(503, 'HISTORY_WRITE_FAILED', 'A resposta foi gerada, mas não foi possível salvá-la.')
  }
  await admin.from('gs_bi_conversations').update({ updated_at: new Date().toISOString() })
    .eq('id', input.conversationId)
}

export async function recordQueryLog(input: {
  userId: string
  dashboardId: string
  semanticModelId: string
  dax: string
  durationMs: number
  rowCount: number
  status: string
  errorCode?: string
}): Promise<void> {
  const { error } = await createAdminClient().from('gs_bi_query_logs').insert({
    user_id: input.userId,
    dashboard_id: input.dashboardId,
    semantic_model_id: input.semanticModelId,
    dax_query: input.dax,
    duration_ms: input.durationMs,
    row_count: input.rowCount,
    status: input.status,
    error_code: input.errorCode ?? null,
  })
  if (error) console.error('[bi-ai] query log:', error)
}

export async function listConversations(userId: string, dashboardId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.from('gs_bi_conversations')
    .select('id, created_at, updated_at').eq('user_id', userId).eq('dashboard_id', dashboardId)
    .order('updated_at', { ascending: false }).limit(12)
  if (error) {
    console.error('[bi-ai] list conversations:', error)
    throw new BiAiError(503, 'MIGRATION_REQUIRED', 'Histórico indisponível. Aplique a migration.')
  }
  return data ?? []
}

export async function conversationMessages(conversationId: string) {
  const { data, error } = await createAdminClient().from('gs_chat_log')
    .select('id, pergunta, resposta, criado_em').eq('conversation_id', conversationId)
    .order('criado_em', { ascending: true }).limit(30)
  if (error) {
    console.error('[bi-ai] conversation messages:', error)
    throw new BiAiError(503, 'MIGRATION_REQUIRED', 'Mensagens indisponíveis. Aplique a migration.')
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    question: row.pergunta,
    answer: row.resposta,
    createdAt: row.criado_em,
  }))
}
