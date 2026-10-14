import 'server-only'

import { conversar, type MensagemLlm, type OpcoesConversa } from '@/lib/llm'
import { deepSeekThinkingModel } from '@/lib/ai-reasoning'
import type { ConfigIa } from '@/lib/llm-config'
import { recordStage } from './telemetry'

/**
 * Output ceiling per AI step. The previous unbounded ceiling (≈393k tokens) let a single
 * planning step reason for minutes. A step that hits its ceiling is retried once without it,
 * so the cap bounds the typical case without truncating a hard question.
 */
const STAGE_TOKENS = {
  planejamento: Number(process.env.BI_AI_PLANNER_MAX_TOKENS) || 32_000,
  revisao: Number(process.env.BI_AI_REVIEW_MAX_TOKENS) || 24_000,
  correcao: Number(process.env.BI_AI_REPAIR_MAX_TOKENS) || 24_000,
  explicacao: Number(process.env.BI_AI_EXPLAINER_MAX_TOKENS) || 12_000,
  comparacao: Number(process.env.BI_AI_COMPARISON_MAX_TOKENS) || 6_000,
} as const
export type Stage = keyof typeof STAGE_TOKENS

export async function conversarEtapa(config: ConfigIa, etapa: Stage, mensagens: MensagemLlm[], opcoes: OpcoesConversa) {
  const started = Date.now()
  const first = await conversar(config, mensagens, { ...opcoes, maxTokens: STAGE_TOKENS[etapa] })
  recordStage({ etapa, ms: Date.now() - started, tokens: first.tokens, motivo: first.motivoTermino, esforco: opcoes.reasoningEffort })
  if (first.motivoTermino !== 'length') return first
  const retried = Date.now()
  const second = await conversar(config, mensagens, { ...opcoes, maxTokens: 'maximum' })
  recordStage({ etapa: `${etapa}-sem-teto`, ms: Date.now() - retried, tokens: second.tokens, motivo: second.motivoTermino, esforco: opcoes.reasoningEffort })
  return { ...second, tokens: first.tokens + second.tokens }
}

/**
 * Wording verified rows (explanation) and picking comparison pairs that the server checks
 * do not need extended reasoning: measured on the golden set (14/10/2026), explanations without it
 * kept every checked fact and took 12–25 s instead of 42–57 s. Other providers keep the
 * administrator's choice.
 */
export function explainerEffort(config: ConfigIa): ConfigIa['reasoningEffort'] {
  if (!deepSeekThinkingModel(config.provedorId, config.modelo)) return config.reasoningEffort
  const chosen = process.env.BI_AI_EXPLAINER_EFFORT
  return chosen === 'none' || chosen === 'low' || chosen === 'medium' || chosen === 'high' || chosen === 'max' ? chosen : 'none'
}
