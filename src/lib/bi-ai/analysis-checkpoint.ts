import 'server-only'
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { clarificationKey } from './clarification'
import type { PlannedQuery, QueryPlan } from './plan'
import type { RefreshHistoryItem } from '../powerbi'

export interface AnalysisCheckpoint {
  userId: string; dashboardId: string; conversationId: string; question: string
  modelHash: string; reportHash?: string; issuedAt: number; started: number; round: number
  inspected: string[]; exploration: { purpose: string; rows: Record<string, unknown>[]; truncated: boolean }[]
  queryMeta: { purpose: string; dax: string; rowCount: number; body?: string; sourceMeasure?: string; formats?: PlannedQuery['formats'] }[]
  tokens: number; feedback: string; invalidPlans: number; refreshBefore: RefreshHistoryItem | null
  catalogResults?: unknown[]
  plan?: QueryPlan
}

/** The browser carries an opaque checkpoint; all instructions/data are authenticated by the server. */
export function issueAnalysisCheckpoint(state: AnalysisCheckpoint): string {
  const raw = Buffer.from(JSON.stringify(state))
  if (raw.length > 4_000_000) throw new Error('A investigação atingiu o volume máximo de dados por análise.')
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', clarificationKey(), iv)
  cipher.setAAD(Buffer.from('portal-bi/analysis/v1'))
  const data = Buffer.concat([cipher.update(deflateRawSync(raw)), cipher.final()])
  return ['a1', iv.toString('base64url'), data.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.')
}

export function readAnalysisCheckpoint(token: string, binding: { userId: string; dashboardId: string; conversationId: string }, now = Date.now()): AnalysisCheckpoint {
  try {
    const parts = token.split('.')
    if (parts.length !== 4 || parts[0] !== 'a1' || token.length > 1_000_000) throw new Error('format')
    const decipher = createDecipheriv('aes-256-gcm', clarificationKey(), Buffer.from(parts[1], 'base64url'))
    decipher.setAAD(Buffer.from('portal-bi/analysis/v1')); decipher.setAuthTag(Buffer.from(parts[3], 'base64url'))
    const bytes = Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()])
    const state = JSON.parse(inflateRawSync(bytes, { maxOutputLength: 4_000_000 }).toString('utf8')) as AnalysisCheckpoint
    if (state.userId !== binding.userId || state.dashboardId !== binding.dashboardId || state.conversationId !== binding.conversationId
      || typeof state.question !== 'string' || state.question.length > 16000 || !Number.isInteger(state.round) || state.round < 1 || state.round > 32
      || !Number.isFinite(state.issuedAt) || state.issuedAt > now + 60000 || now - state.issuedAt > 2 * 60 * 60_000
      || !Array.isArray(state.inspected) || !Array.isArray(state.exploration) || !Array.isArray(state.queryMeta)) throw new Error('binding')
    return state
  } catch { throw new Error('A continuação da análise é inválida ou expirou. Refaça a pergunta.') }
}
