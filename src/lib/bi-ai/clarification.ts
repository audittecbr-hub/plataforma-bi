import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { parseEncryptionKey } from '../ai-key-crypto'
import { normalizeTerm } from './context'
import type { BiManifest } from './manifest'

export interface ClarificationPrompt {
  question: string
  options: string[]
  required?: ClarificationRequirement[]
}

type ClarificationRequirement = 'period' | 'resultKind' | 'metaKind'

export interface PendingClarification {
  userId: string
  dashboardId: string
  conversationId: string
  original: string
  required: ClarificationRequirement[]
  count: number
  issuedAt: number
}

export class ClarificationError extends Error {}

export function clarificationKey(): Buffer {
  const key = parseEncryptionKey(process.env.BI_AI_ENCRYPTION_KEY)
  if (key) return key
  // The provider-key vault still requires its dedicated master key. A chat
  // clarification only needs a stable server-side secret across instances;
  // derive a separate key from the existing service credential when no vault
  // master key has been provisioned locally.
  const serviceSecret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!serviceSecret || serviceSecret.length < 32) {
    throw new ClarificationError('Chave de proteção do esclarecimento indisponível.')
  }
  return createHash('sha256').update('portal-bi/clarification/v1\0').update(serviceSecret).digest()
}

/** An encrypted, short-lived continuation bound to the current user and BI. */
export function issueClarificationToken(pending: PendingClarification, key: Buffer): string {
  if (key.length !== 32 || pending.original.length > 1800 || pending.count < 1 || pending.count > 2
    || !Array.isArray(pending.required) || pending.required.some((item) => !['period', 'resultKind', 'metaKind'].includes(item))) {
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
      || !Array.isArray(value.required) || value.required.some((item) => !['period', 'resultKind', 'metaKind'].includes(item))
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
  const missingMetaKind = pending.required.includes('metaKind')
    && !/\b(?:receita|despesa|resultado|todas|todos)\b/.test(normalizeTerm(answer))
    && !/\b(?:receita|despesa|resultado|todas|todos)\b/.test(normalizeTerm(pending.original.replace(/^(?:qual|quais|quanto|como).*?\bmeta\b/i, '')))
  if (!missingPeriod && !missingKind && !missingMetaKind) return { question, followUp: null }
  const options = missingPeriod && missingKind
    ? [`Realizado em ${year}`, `Projetado em ${year}`, `Comparar ambos em ${year}`]
    : missingPeriod && missingMetaKind ? [`Receita em ${year}`, `Despesa em ${year}`, `Resultado em ${year}`, `Todas em ${year}`]
    : missingPeriod ? [String(year), String(year - 1)]
      : missingMetaKind ? ['Receita', 'Despesa', 'Resultado', 'Todas']
        : ['Realizado', 'Projetado', 'Comparar ambos']
  return { question, followUp: {
    question: missingPeriod && missingKind ? 'Ainda preciso do tipo de resultado e do ano. Qual você deseja?'
      : missingPeriod && missingMetaKind ? 'Ainda preciso do tipo de meta e do ano. Qual você deseja?'
      : missingPeriod ? 'De qual ano você quer os dados?'
        : missingMetaKind ? 'Você quer a meta de receita, despesa, resultado ou todas?'
        : 'Você quer o resultado realizado, projetado ou a comparação?',
    options, required: [
      ...(missingPeriod ? ['period' as const] : []),
      ...(missingKind ? ['resultKind' as const] : []),
      ...(missingMetaKind ? ['metaKind' as const] : []),
    ],
  } }
}

/** Ask before making a silent time or metric assumption on a broad question. */
export function basicClarification(question: string, manifest: BiManifest, year = new Date().getFullYear()): ClarificationPrompt | null {
  const normalized = normalizeTerm(question)
  const words = normalized.split(' ').filter(Boolean)
  const metricWord = /\b(?:resultado|receita|despesa|faturamento|lucro|prejuizo|desvio|atingimento|provisao|fundo|meta|metas)\b/.test(normalized)
  const generic = words.length <= 6 && /\b(?:qual|quanto|como|mostre|mostrar|analise|analisa)\b/.test(normalized)
  const missingPeriod = !hasPeriod(question)
  const isMetaQuestion = /\bmetas?\b/.test(normalized)
  const metaFamilies = ['receita', 'despesa', 'resultado'].filter((family) =>
    manifest.measures.some((item) => item.queryable && normalizeTerm(item.name).includes(family)
      && /projetad|orcad/i.test(normalizeTerm(item.name))))
  const missingMetaKind = isMetaQuestion && metaFamilies.length >= 2
    && !/\b(?:receita|despesa|resultado|todas|todos)\b/.test(normalized)
  if (missingMetaKind) {
    const choices = [...metaFamilies.map((item) => item[0].toUpperCase() + item.slice(1)), 'Todas']
    const options = missingPeriod
      ? choices.map((item) => `${item} em ${year}`)
      : choices
    return { question: missingPeriod ? 'Qual tipo de meta e de qual ano você quer ver?'
      : 'Qual tipo de meta você quer ver?', options,
    required: missingPeriod ? ['period', 'metaKind'] : ['metaKind'] }
  }
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
