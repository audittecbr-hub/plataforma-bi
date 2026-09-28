/**
 * Qual provedor e qual modelo o portal usa — escolha do administrador.
 *
 * A ORDEM DE PRECEDENCIA E DE PROPOSITO
 *   1. tabela gs_config_ia  → escolha feita na aba IA da Administração
 *   2. variaveis de ambiente → LLM_PROVEDOR / LLM_MODELO (deploy sem banco)
 *   3. padrao do codigo      → OpenCode Go + modelo padrao do provedor
 *
 * O banco vem primeiro para que a troca de modelo nao exija deploy; o ambiente
 * existe para o caso da tabela ainda nao existir (migracao nao aplicada) ou do
 * Supabase estar fora — nesses casos a leitura degrada em silencio para o
 * ambiente, com a fonte reportada em `fonte` para a tela poder avisar.
 *
 * Chaves podem vir do ambiente ou de ciphertext AES-256-GCM gravado pela aba
 * administrativa; o valor em claro nunca é retornado ao navegador.
 */

import { createAdminClient } from '@/utils/supabase/admin'
import { PROVEDORES, PROVEDOR_PADRAO, obterProvedor, type AlvoIa } from '@/lib/llm'
import { modelEnabled } from '@/lib/ai-keyring'
import { isReasoningEffort, modelSupportedByAdapter, reasoningOptions, type ReasoningEffort } from '@/lib/ai-reasoning'

const TABELA = 'gs_config_ia'
const LINHA = 'global'

export type FonteConfig = 'banco' | 'ambiente' | 'padrao'

export interface ConfigIa extends AlvoIa {
    fonte: FonteConfig
    enabled: boolean
    reasoningEffort: ReasoningEffort
    plannerMaxTokens: number
    answerMaxTokens: number
}

function doAmbiente(): ConfigIa {
    const provedorId = process.env.BI_AI_PROVIDER?.trim() || process.env.LLM_PROVEDOR?.trim() || PROVEDOR_PADRAO
    const p = obterProvedor(provedorId)
    const modelo = process.env.BI_AI_MODEL?.trim() || process.env.LLM_MODELO?.trim() || p.modeloPadrao
    return { provedorId: p.id, modelo, fonte: process.env.BI_AI_PROVIDER || process.env.LLM_PROVEDOR ? 'ambiente' : 'padrao',
        enabled: process.env.BI_AI_ENABLED === 'true', reasoningEffort: 'auto', plannerMaxTokens: 3000, answerMaxTokens: 1600 }
}

/** O que o chat vai usar agora. Nunca lanca: configuração quebrada nao derruba o chat. */
export async function lerConfigIa(): Promise<ConfigIa> {
    const ambiente = doAmbiente()
    try {
        const { data, error } = await createAdminClient()
            .from(TABELA)
            .select('provedor_id, modelo, enabled, reasoning_effort, planner_max_tokens, answer_max_tokens')
            .eq('id', LINHA)
            .maybeSingle()

        if (error || !data) return ambiente
        const provedorId = String(data.provedor_id || '').trim()
        const modelo = String(data.modelo || '').trim()
        if (!provedorId || !modelo || !PROVEDORES.some((entry) => entry.id === provedorId)) return ambiente
        // provedor desconhecido no banco (ex.: removido do codigo) cai no padrao
        return { provedorId, modelo, fonte: 'banco',
            enabled: data.enabled === true,
            reasoningEffort: isReasoningEffort(data.reasoning_effort) ? data.reasoning_effort : 'auto',
            plannerMaxTokens: Number(data.planner_max_tokens) || 3000,
            answerMaxTokens: Number(data.answer_max_tokens) || 1600 }
    } catch {
        return ambiente
    }
}

/**
 * Grava a escolha. Quem chama DEVE ter conferido que e administrador — a
 * conferencia e feita na server action, e a escrita usa o cliente de servico
 * porque a tabela nao tem politica de escrita para usuario comum.
 */
export async function salvarConfigIa(
    alvo: AlvoIa & { enabled: boolean; reasoningEffort: ReasoningEffort; plannerMaxTokens: number; answerMaxTokens: number },
    userId: string,
): Promise<{ ok: boolean; erro?: string }> {
    const provedor = obterProvedor(alvo.provedorId)
    const modelo = alvo.modelo?.trim()
    if (!modelo) return { ok: false, erro: 'Escolha um modelo.' }
    if (provedor.id !== alvo.provedorId) return { ok: false, erro: `Provedor "${alvo.provedorId}" não existe.` }
    if (!modelSupportedByAdapter(provedor.id, modelo)) return { ok: false, erro: 'Este modelo exige outro protocolo de API.' }
    if (modelo.length > 160 || !/^[A-Za-z0-9._:/-]+$/.test(modelo)) return { ok: false, erro: 'Identificador do modelo inválido.' }
    if (!reasoningOptions(provedor.id, modelo).includes(alvo.reasoningEffort)) {
        return { ok: false, erro: 'O nível de raciocínio não é suportado por este provedor/modelo.' }
    }
    if (!Number.isInteger(alvo.plannerMaxTokens) || alvo.plannerMaxTokens < 1000 || alvo.plannerMaxTokens > 12000
        || !Number.isInteger(alvo.answerMaxTokens) || alvo.answerMaxTokens < 500 || alvo.answerMaxTokens > 8000) {
        return { ok: false, erro: 'Limites de tokens fora da faixa permitida.' }
    }
    if (!(await modelEnabled(provedor.id, modelo))) return { ok: false, erro: 'O provedor ou modelo está desativado.' }

    try {
        const { error } = await createAdminClient()
            .from(TABELA)
            .upsert(
                {
                    id: LINHA,
                    provedor_id: provedor.id,
                    modelo,
                    enabled: alvo.enabled,
                    reasoning_effort: alvo.reasoningEffort,
                    planner_max_tokens: alvo.plannerMaxTokens,
                    answer_max_tokens: alvo.answerMaxTokens,
                    atualizado_em: new Date().toISOString(),
                    atualizado_por: userId,
                },
                { onConflict: 'id' }
            )
        if (error) {
            // Tabela ausente e o erro esperado na primeira instalacao. Vale uma
            // mensagem que diz o que fazer, em vez do texto cru do Postgres.
            const faltando = /does not exist|relation .* not exist|schema cache/i.test(error.message)
            return {
                ok: false,
                erro: faltando
                    ? 'A configuração de IA ainda não existe. Aplique supabase/migrations/20260928_ia_admin_settings.sql no Supabase.'
                    : error.message,
            }
        }
        return { ok: true }
    } catch (e) {
        return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao gravar a configuração' }
    }
}
