import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { parseEncryptionKey } from '../ai-key-crypto'
import { normalizeTerm } from './context'
import type { BiManifest } from './manifest'

export interface ClarificationPrompt {
  question: string
  options: string[]
  required?: ('period' | 'resultKind')[]
}

export interface PendingClarification {
  userId: string
  dashboardId: string
  conversationId: string
  original: string
  required: ('period' | 'resultKind')[]
  count: number
  issuedAt: number
}

export class ClarificationError extends Error {}

export function clarificationKey(): Buffer {
  const key = parseEncryptionKey(process.env.BI_AI_ENCRYPTION_KEY)
  if (!key) throw new ClarificationError('Chave de proteção do esclarecimento indisponível.')
  return key
}

/** An encrypted, short-lived continuation bound to the current user and BI. */
export function issueClarificationToken(pending: PendingClarification, key: Buffer): string {
  if (key.length !== 32 || pending.original.length > 1800 || pending.count < 1 || pending.count > 2
    || !Array.isArray(pending.required) || pending.required.some((item) => item !== 'period' && item !== 'resultKind')) {
    throw new ClarificationError('Esclarecimento inválido.')
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(pending), 'utf8'), cipher.final()])
  return `v1.${iv.toString('base64url')}.${body.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`
}

export function readClarificationToken(token: string, binding: {
  userId: string; dashboardId: string; conversationId: string
}, key: Buffer, now = Date.now()): PendingClarification {
  const parts = token.split('.')
  if (key.length !== 32 || token.length > 5000 || parts.length !== 4 || parts[0] !== 'v1') {
    throw new ClarificationError('Esclarecimento inválido. Refaça a pergunta.')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'))
    decipher.setAuthTag(Buffer.from(parts[3], 'base64url'))
    const value = JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')),
      decipher.final()]).toString('utf8')) as PendingClarification
    if (value.userId !== binding.userId || value.dashboardId !== binding.dashboardId
      || value.conversationId !== binding.conversationId || typeof value.original !== 'string'
      || value.original.length < 1 || value.original.length > 1800 || !Number.isInteger(value.count)
      || value.count < 1 || value.count > 2 || !Number.isFinite(value.issuedAt)
      || !Array.isArray(value.required) || value.required.some((item) => item !== 'period' && item !== 'resultKind')
      || value.issuedAt > now + 60_000 || now - value.issuedAt > 30 * 60_000) {
      throw new Error('binding or expiration')
    }
    return value
  } catch { throw new ClarificationError('Esclarecimento inválido ou expirado. Refaça a pergunta.') }
}

function hasPeriod(question: string): boolean {
  return /\b20\d{2}\b|\b(?:este ano|ano atual|ano corrente|ano passado|ultimo ano|último ano|hoje|agora|este mes|este mês|mes atual|mês atual)\b/i.test(question)
}

export function continueClarification(pending: PendingClarification, answer: string,
  year = new Date().getFullYear()): { question: string; followUp: ClarificationPrompt | null } {
  const question = `${pending.original}\nEsclarecimento do usuário: ${answer.trim()}`
  const normalized = normalizeTerm(question)
  const missingPeriod = pending.required.includes('period') && !hasPeriod(question)
  const missingKind = pending.required.includes('resultKind')
    && !/\b(?:realizado|projetado|orcado|comparar|compare|comparacao|ambos)\b/.test(normalized)
  if (!missingPeriod && !missingKind) return { question, followUp: null }
  const options = missingPeriod && missingKind
    ? [`Realizado em ${year}`, `Projetado em ${year}`, `Comparar ambos em ${year}`]
    : missingPeriod ? [String(year), String(year - 1)]
      : ['Realizado', 'Projetado', 'Comparar ambos']
  return { question, followUp: {
    question: missingPeriod && missingKind ? 'Ainda preciso do tipo de resultado e do ano. Qual você deseja?'
      : missingPeriod ? 'De qual ano você quer os dados?'
        : 'Você quer o resultado realizado, projetado ou a comparação?',
    options, required: [
      ...(missingPeriod ? ['period' as const] : []),
      ...(missingKind ? ['resultKind' as const] : []),
    ],
  } }
}

/** Ask before making a silent time or metric assumption on a broad question. */
export function basicClarification(question: string, manifest: BiManifest, year = new Date().getFullYear()): ClarificationPrompt | null {
  const normalized = normalizeTerm(question)
  const words = normalized.split(' ').filter(Boolean)
  const metricWord = /\b(?:resultado|receita|despesa|faturamento|lucro|prejuizo|desvio|atingimento|provisao|fundo)\b/.test(normalized)
  const generic = words.length <= 6 && /\b(?:qual|quanto|como|mostre|mostrar|analise|analisa)\b/.test(normalized)
  const missingPeriod = !hasPeriod(question)
  const missingResultKind = /\bresultado\b/.test(normalized)
    && manifest.measures.some((item) => /resultado realizado/i.test(item.name))
    && manifest.measures.some((item) => /resultado projetado/i.test(item.name))
    && !/\bfundo de marketing\b/.test(normalized)
    && !/\b(?:realizado|projetado|orcado|comparar|comparacao|ambos)\b/.test(normalized)
  if (missingResultKind && metricWord) {
    return missingPeriod
      ? { question: 'Qual tipo de resultado e qual período você quer analisar?',
        options: [`Realizado em ${year}`, `Projetado em ${year}`, `Comparar ambos em ${year}`],
        required: ['period', 'resultKind'] }
      : { question: 'Você quer o resultado realizado, projetado ou a comparação?',
        options: ['Realizado', 'Projetado', 'Comparar ambos'], required: ['resultKind'] }
  }
  if (metricWord && missingPeriod) {
    return { question: 'Qual período você quer analisar?',
      options: [String(year), String(year - 1)], required: ['period'] }
  }
  if (generic && words.length <= 4 && /\b(?:indicadores|desempenho|dados|numeros|números)\b/.test(normalized)) {
    return { question: 'Quais indicadores e qual período você quer analisar?', options: [] }
  }
  return null
}
