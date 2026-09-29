/**
 * Camada de IA do portal — provedores plugáveis.
 *
 * O chat de BI nao fala mais com um provedor unico. Ele pede "conversar" a esta
 * camada, que resolve provedor + modelo escolhidos pelo administrador
 * (lib/llm-config.ts) e despacha para o adaptador do formato certo.
 *
 * OpenCode Go publica modelos em /chat/completions, /messages e /responses.
 * O adaptador escolhe o protocolo documentado para cada família de modelo.
 *
 * O OpenCode Go EXIGE o header x-opencode-session. Sem ele a API devolve
 * HTTP 400 MissingSessionID ("cannot be routed efficiently"). Com qualquer
 * valor nao vazio, HTTP 200. Ver headerSessao em PROVEDORES.
 *
 * O QUE NAO MUDOU (de proposito)
 * O contrato com o resto do app: mensagens, ferramentas e o campo
 * reasoning_content continuam iguais ao que o chat ja usava, entao
 * apps/actions/bi-chat.ts troca apenas o import.
 */

import 'server-only'
import { modelEnabled, readProviderKey, readProviderSettings } from '@/lib/ai-keyring'
import { modelProtocol, modelSupportedByAdapter, reasoningOptions, type ReasoningEffort } from '@/lib/ai-reasoning'

export type FormatoApi = 'openai-completions' | 'anthropic-messages'

export interface ProvedorLlm {
    id: string
    nome: string
    formato: FormatoApi
    baseUrl: string
    /** Variaveis de ambiente aceitas para a chave, em ordem de preferencia. */
    envChaves: string[]
    /** Headers fixos do provedor (ex.: anthropic-version). */
    headers?: Record<string, string>
    /** Headers que dependem de uma sessao de roteamento (OpenCode Go). */
    headerSessao?: Record<string, string>
    /** Modelos conhecidos que a API lista mas o portal não atende. */
    modelosIndisponiveis?: string[]
    modeloPadrao: string
    /** Ha chave configurada para este provedor? */
    temChave?: boolean
}

export const PROVEDORES: ProvedorLlm[] = [
    {
        id: 'opencode-go',
        nome: 'OpenCode Go',
        formato: 'openai-completions',
        baseUrl: 'https://opencode.ai/zen/go/v1',
        envChaves: ['OPENCODE_API_KEY', 'OPENCODE_GO_API_KEY'],
        // Medido: sem este header a API recusa com MissingSessionID.
        headerSessao: { 'x-opencode-session': '' },
        modeloPadrao: 'longcat-2.5-preview-free',
    },
    {
        id: 'anthropic',
        nome: 'Anthropic',
        formato: 'anthropic-messages',
        baseUrl: 'https://api.anthropic.com/v1',
        envChaves: ['ANTHROPIC_API_KEY'],
        headers: { 'anthropic-version': '2023-06-01' },
        modeloPadrao: 'claude-sonnet-4-5',
    },
    {
        id: 'openai',
        nome: 'OpenAI',
        formato: 'openai-completions',
        baseUrl: 'https://api.openai.com/v1',
        envChaves: ['OPENAI_API_KEY'],
        modeloPadrao: 'gpt-4o-mini',
    },
    {
        // Mantido porque ha historico de uso no portal. A chave e a mesma
        // DEEPSEEK_API_KEY que ja existia. O nome do modelo foi corrigido:
        // 'deepseek-v4-flash' nao existe na API (a lista devolve
        // 'deepseek-flash' e 'deepseek-v4-pro').
        id: 'deepseek',
        nome: 'DeepSeek (direto)',
        formato: 'openai-completions',
        baseUrl: 'https://api.deepseek.com',
        envChaves: ['DEEPSEEK_API_KEY'],
        modeloPadrao: 'deepseek-flash',
    },
]

// Optional operator-owned OpenAI-compatible endpoint. Existing provider choices remain intact.
PROVEDORES.push({
    id: 'compatible',
    nome: 'Endpoint compatível',
    formato: 'openai-completions',
    baseUrl: /^https:\/\//i.test(process.env.BI_AI_BASE_URL ?? '')
        ? process.env.BI_AI_BASE_URL!.replace(/\/+$/, '') : '',
    envChaves: ['BI_AI_API_KEY'],
    modeloPadrao: process.env.BI_AI_MODEL || 'default',
})

export const PROVEDOR_PADRAO = 'opencode-go'

export function obterProvedor(id: string): ProvedorLlm {
    return PROVEDORES.find((p) => p.id === id) ?? PROVEDORES.find((p) => p.id === PROVEDOR_PADRAO)!
}

/**
 * A chave do provedor, lida do ambiente. Nao existe chave no banco de
 * proposito: segredo de API nao deve trafegar pela interface de configuracao.
 */
export async function chaveDoProvedor(p: ProvedorLlm): Promise<string | null> {
    return readProviderKey(p.id, p.envChaves)
}

/** Status without sending any API key to the browser. */
export async function provedoresDisponiveis(): Promise<ProvedorLlm[]> {
    return Promise.all(PROVEDORES.map(async (p) => {
        const status = await readProviderSettings(p.id, p.envChaves)
        return { ...p, temChave: status.hasStoredKey || status.hasEnvironmentKey }
    }))
}

// ---------------------------------------------------------------------------
// Tipos do contrato (iguais aos que o chat ja usava)
// ---------------------------------------------------------------------------

export interface FerramentaLlm {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: { type: 'object'; properties: Record<string, unknown>; required: string[] }
    }
}

/** Apelido antigo, para nao quebrar quem ja importava. */
export type FerramentaDeepSeek = FerramentaLlm

export interface ChamadaDeFerramenta {
    id: string
    type: 'function'
    function: { name: string; arguments: string }
}

export interface MensagemLlm {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    tool_call_id?: string
    tool_calls?: ChamadaDeFerramenta[]
    /**
     * Raciocinio do modelo. A API do DeepSeek EXIGE que ele volte junto na
     * proxima chamada quando existe, senao devolve HTTP 400 — por isso o campo
     * viaja na mensagem crua.
     */
    reasoning_content?: string | null
}

export type MensagemDeepSeek = MensagemLlm

export interface RespostaLLm {
    texto: string | null
    raciocinio?: string | null
    chamadas: ChamadaDeFerramenta[]
    mensagem: MensagemLlm
    tokens: number
    ms: number
    /**
     * finish_reason/stop_reason cru do provedor. 'length' significa que a
     * resposta foi CORTADA pelo teto de tokens — texto pela metade conta como
     * falha para quem vai mostrá-lo, e é assim que a redação tenta de novo.
     */
    motivoTermino?: string | null
    /** Para diagnostico: qual provedor/modelo respondeu. */
    provedor: string
    modelo: string
}

export type RespostaDeepSeek = RespostaLLm

export interface OpcoesConversa {
    ferramentas?: FerramentaLlm[]
    /** 0 para decisao estavel; deixe indefinido ao redigir texto. */
    temperatura?: number
    jsonObrigatorio?: boolean
    /** Corta resposta longa demais; protege custo. */
    maxTokens?: number
    /** Sessao de roteamento do provedor (OpenCode Go). */
    sessao?: string
    signal?: AbortSignal
    reasoningEffort?: ReasoningEffort
}

/** Provedor + modelo escolhidos pelo administrador. */
export interface AlvoIa {
    provedorId: string
    modelo: string
}

// ---------------------------------------------------------------------------
// Erros: mensagem de usuario x detalhe tecnico
// ---------------------------------------------------------------------------

/**
 * Traduz a falha do provedor para algo que o colaborador entenda. O corpo cru
 * do provedor vai no console do servidor, nao na tela de quem perguntou.
 */
export class ErroProvedor extends Error {
    constructor(
        readonly status: number,
        readonly provedor: string,
        readonly detalhe: string
    ) {
        super(mensagemAmigavel(status, provedor, detalhe))
        this.name = 'ErroProvedor'
    }
}

function mensagemAmigavel(status: number, provedor: string, detalhe: string): string {
    if (status === 401 || status === 403) return `A chave da IA (${provedor}) foi recusada. Avise o administrador do portal.`
    if (status === 402) return 'A conta da IA está sem saldo. Avise o administrador do portal.'
    if (status === 429 && /GoUsageLimitError|usage limit exceeded/i.test(detalhe)) {
        return 'A cota do OpenCode Go foi atingida. Escolha outro provedor ou aguarde a renovação do limite.'
    }
    if (status === 429) return 'Muitas perguntas em pouco tempo. Tente de novo em alguns segundos.'
    if (status === 400 && provedor === 'opencode-go') return 'O provedor recusou a chamada (sessão de roteamento ou modelo indisponível). Avise o administrador.'
    if (status >= 500) return 'O provedor de IA está instável agora. Tente de novo em instantes.'
    return `Não consegui falar com a IA (${provedor}, HTTP ${status}).`
}

// ---------------------------------------------------------------------------
// Adaptador OpenAI Chat Completions (OpenCode Go, OpenAI, DeepSeek)
// ---------------------------------------------------------------------------

async function conversarOpenAI(
    p: ProvedorLlm,
    chave: string,
    modelo: string,
    mensagens: MensagemLlm[],
    opcoes: OpcoesConversa
): Promise<RespostaLLm> {
    const t0 = Date.now()
    const sessao = opcoes.sessao || crypto.randomUUID()

    const cabecalhos: Record<string, string> = {
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
        ...(p.id === 'opencode-go' ? { 'User-Agent': 'portal-bi/1.0' } : {}),
        ...(p.headers ?? {}),
    }
    if (p.headerSessao) {
        for (const nome of Object.keys(p.headerSessao)) cabecalhos[nome] = p.headerSessao[nome] || sessao
    }

    const corpo: Record<string, unknown> = { model: modelo, messages: mensagens }
    if (opcoes.ferramentas?.length) {
        corpo.tools = opcoes.ferramentas
        corpo.tool_choice = 'auto'
    }
    if (opcoes.temperatura !== undefined) corpo.temperature = opcoes.temperatura
    if (opcoes.jsonObrigatorio) corpo.response_format = { type: 'json_object' }
    if (opcoes.maxTokens) {
        if (p.id === 'openai' && /^(?:o\d|gpt-[5-9])(?:\b|[.-])/i.test(modelo)) {
            corpo.max_completion_tokens = opcoes.maxTokens
            delete corpo.temperature
        } else corpo.max_tokens = opcoes.maxTokens
    }
    const effort = opcoes.reasoningEffort ?? 'auto'
    if (effort !== 'auto') {
        if (!reasoningOptions(p.id, modelo).includes(effort)) {
            throw new Error(`Nível de raciocínio não suportado por ${p.id}/${modelo}.`)
        }
        if (p.id === 'deepseek') {
            corpo.thinking = { type: effort === 'none' ? 'disabled' : 'enabled' }
            if (effort !== 'none') corpo.reasoning_effort = effort
            delete corpo.temperature
        } else {
            corpo.reasoning_effort = effort
            if (p.id === 'openai') delete corpo.temperature
        }
    }

    const r = await fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify(corpo),
        signal: opcoes.signal ? AbortSignal.any([opcoes.signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    })

    if (!r.ok) {
        const detalhe = (await r.text()).slice(0, 400)
        console.error(`[llm] ${p.id}/${modelo} HTTP ${r.status}: ${detalhe}`)
        throw new ErroProvedor(r.status, p.id, detalhe)
    }

    const j = await r.json()
    const escolha = j?.choices?.[0] ?? {}
    const msg = escolha.message ?? {}

    return {
        texto: msg.content ?? null,
        motivoTermino: escolha.finish_reason ?? null,
        raciocinio: msg.reasoning_content ?? null,
        chamadas: msg.tool_calls ?? [],
        mensagem: msg as MensagemLlm,
        tokens: j?.usage?.total_tokens ?? 0,
        ms: Date.now() - t0,
        provedor: p.id,
        modelo,
    }
}

// ---------------------------------------------------------------------------
// Adaptador Anthropic Messages
// ---------------------------------------------------------------------------

interface BlocoAnthropic {
    type: string
    text?: string
    id?: string
    name?: string
    input?: unknown
}

/** Converte o contrato interno para o formato de mensagens da Anthropic. */
function paraAnthropic(mensagens: MensagemLlm[]) {
    const sistema = mensagens.filter((m) => m.role === 'system').map((m) => m.content ?? '').join('\n\n')
    const resto: Record<string, unknown>[] = []

    for (const m of mensagens) {
        if (m.role === 'system') continue

        if (m.role === 'tool') {
            resto.push({
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content ?? '' }],
            })
            continue
        }

        if (m.role === 'assistant') {
            const blocos: Record<string, unknown>[] = []
            if (m.content) blocos.push({ type: 'text', text: m.content })
            for (const c of m.tool_calls ?? []) {
                let entrada: unknown = {}
                try { entrada = JSON.parse(c.function.arguments || '{}') } catch { entrada = {} }
                blocos.push({ type: 'tool_use', id: c.id, name: c.function.name, input: entrada })
            }
            resto.push({ role: 'assistant', content: blocos.length ? blocos : [{ type: 'text', text: '' }] })
            continue
        }

        resto.push({ role: 'user', content: [{ type: 'text', text: m.content ?? '' }] })
    }

    return { sistema, resto }
}

async function conversarAnthropic(
    p: ProvedorLlm,
    chave: string,
    modelo: string,
    mensagens: MensagemLlm[],
    opcoes: OpcoesConversa
): Promise<RespostaLLm> {
    const t0 = Date.now()
    const { sistema, resto } = paraAnthropic(mensagens)

    const corpo: Record<string, unknown> = {
        model: modelo,
        // max_tokens e obrigatorio na Anthropic.
        max_tokens: opcoes.maxTokens ?? 900,
        messages: resto,
    }
    if (sistema) corpo.system = sistema
    if (opcoes.temperatura !== undefined) corpo.temperature = opcoes.temperatura
    if (opcoes.ferramentas?.length) {
        corpo.tools = opcoes.ferramentas.map((f) => ({
            name: f.function.name,
            description: f.function.description,
            input_schema: f.function.parameters,
        }))
    }
    const effort = opcoes.reasoningEffort ?? 'auto'
    if (effort !== 'auto') {
        if (!reasoningOptions(p.id, modelo).includes(effort)) {
            throw new Error(`Nível de raciocínio não suportado por ${p.id}/${modelo}.`)
        }
        corpo.thinking = { type: 'adaptive' }
        corpo.output_config = { effort }
        delete corpo.temperature
    }

    const session = opcoes.sessao || crypto.randomUUID()
    const r = await fetch(`${p.baseUrl}/messages`, {
        method: 'POST',
        headers: {
            ...(p.id === 'opencode-go'
                ? { 'x-api-key': chave, 'x-opencode-session': session, 'User-Agent': 'portal-bi/1.0' }
                : { 'x-api-key': chave }),
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
            ...(p.headers ?? {}),
        },
        body: JSON.stringify(corpo),
        signal: opcoes.signal ? AbortSignal.any([opcoes.signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    })

    if (!r.ok) {
        const detalhe = (await r.text()).slice(0, 400)
        console.error(`[llm] ${p.id}/${modelo} HTTP ${r.status}: ${detalhe}`)
        throw new ErroProvedor(r.status, p.id, detalhe)
    }

    const j = await r.json()
    const blocos = (j?.content ?? []) as BlocoAnthropic[]

    const texto = blocos.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim() || null
    const chamadas: ChamadaDeFerramenta[] = blocos
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
            id: String(b.id),
            type: 'function' as const,
            function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) },
        }))

    const tokens = (j?.usage?.input_tokens ?? 0) + (j?.usage?.output_tokens ?? 0)

    return {
        texto,
        motivoTermino: j?.stop_reason ?? null,
        raciocinio: null,
        chamadas,
        mensagem: { role: 'assistant', content: texto, tool_calls: chamadas },
        tokens,
        ms: Date.now() - t0,
        provedor: p.id,
        modelo,
    }
}

async function conversarResponses(
    p: ProvedorLlm,
    chave: string,
    modelo: string,
    mensagens: MensagemLlm[],
    opcoes: OpcoesConversa,
): Promise<RespostaLLm> {
    if (opcoes.ferramentas?.length || mensagens.some((message) => message.role === 'tool')) {
        throw new Error('Ferramentas não implementadas para este endpoint Responses.')
    }
    const started = Date.now()
    const body: Record<string, unknown> = {
        model: modelo,
        input: mensagens.map((message) => ({ role: message.role, content: message.content ?? '' })),
    }
    if (opcoes.maxTokens) body.max_output_tokens = opcoes.maxTokens
    const response = await fetch(`${p.baseUrl}/responses`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${chave}`,
            'Content-Type': 'application/json',
            'x-opencode-session': opcoes.sessao || crypto.randomUUID(),
            'User-Agent': 'portal-bi/1.0',
        },
        body: JSON.stringify(body),
        signal: opcoes.signal ? AbortSignal.any([opcoes.signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    })
    if (!response.ok) {
        const detail = (await response.text()).slice(0, 400)
        console.error(`[llm] ${p.id}/${modelo} Responses HTTP ${response.status}: ${detail}`)
        throw new ErroProvedor(response.status, p.id, detail)
    }
    const data = await response.json()
    const output = Array.isArray(data.output) ? data.output as Array<Record<string, unknown>> : []
    const text = typeof data.output_text === 'string' ? data.output_text : output
        .flatMap((item) => Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [])
        .filter((content) => content.type === 'output_text' || content.type === 'text')
        .map((content) => String(content.text ?? '')).join('\n')
    return {
        texto: text.trim() || null,
        motivoTermino: String(data.status ?? ''),
        chamadas: [],
        mensagem: { role: 'assistant', content: text.trim() || null },
        tokens: Number(data.usage?.total_tokens ?? 0),
        ms: Date.now() - started,
        provedor: p.id,
        modelo,
    }
}

// ---------------------------------------------------------------------------
// Porta de entrada
// ---------------------------------------------------------------------------

export async function conversar(
    alvo: AlvoIa,
    mensagens: MensagemLlm[],
    opcoes: OpcoesConversa = {}
): Promise<RespostaLLm> {
    const p = obterProvedor(alvo.provedorId)
    if (!p.baseUrl) throw new Error(`Endpoint do provedor ${p.id} não configurado.`)
    if (!modelSupportedByAdapter(p.id, alvo.modelo || p.modeloPadrao)) {
        throw new Error(`O modelo ${alvo.modelo || p.modeloPadrao} exige outro protocolo de API.`)
    }
    if (!(await modelEnabled(p.id, alvo.modelo || p.modeloPadrao))) {
        throw new Error(`Modelo ${alvo.modelo || p.modeloPadrao} está desativado no painel administrativo.`)
    }
    const chave = await chaveDoProvedor(p)
    if (!chave) {
        throw new ErroProvedor(401, p.id, `nenhuma das variaveis ${p.envChaves.join(', ')} esta definida`)
    }
    const modelo = alvo.modelo || p.modeloPadrao

    const protocol = modelProtocol(p.id, modelo)
    if (protocol === 'messages') return conversarAnthropic(p, chave, modelo, mensagens, opcoes)
    if (protocol === 'responses') return conversarResponses(p, chave, modelo, mensagens, opcoes)
    return conversarOpenAI(p, chave, modelo, mensagens, opcoes)
}

/** Lista viva de modelos do provedor, filtrada pelo que ele realmente atende. */
export async function listarModelosDoProvedor(
    provedorId: string
): Promise<{ ok: boolean; erro?: string; modelos: { id: string; disponivel: boolean; supported: boolean; enabled: boolean; protocol: string; free: boolean }[] }> {
    const p = obterProvedor(provedorId)
    if (!p.baseUrl) return { ok: false, erro: 'Configure BI_AI_BASE_URL no servidor.', modelos: [] }
    const state = await readProviderSettings(p.id, p.envChaves)
    if (!state.enabled) return { ok: false, erro: 'Ative o provedor para consultar seus modelos.', modelos: [] }
    const chave = await chaveDoProvedor(p)
    if (!chave) return { ok: false, erro: `Sem chave: defina ${p.envChaves[0]} no ambiente.`, modelos: [] }

    const cabecalhos: Record<string, string> =
        p.formato === 'anthropic-messages'
            ? { 'x-api-key': chave, ...(p.headers ?? {}) }
            : { Authorization: `Bearer ${chave}`, ...(p.headers ?? {}) }

    try {
        const r = await fetch(`${p.baseUrl}/models`, { headers: cabecalhos, signal: AbortSignal.timeout(15_000) })
        if (!r.ok) return { ok: false, erro: `O provedor recusou a listagem (HTTP ${r.status}).`, modelos: [] }
        const j = await r.json()
        const lista: string[] = (j?.data ?? j?.models ?? [])
            .map((m: { id?: string; name?: string }) => m.id ?? m.name ?? '')
            .filter(Boolean)
        const indisponiveis = new Set(p.modelosIndisponiveis ?? [])
        const modelos = lista
            .sort((a, b) => a.localeCompare(b))
            .map((id) => {
                const supported = modelSupportedByAdapter(p.id, id) && !indisponiveis.has(id)
                const enabled = !state.disabledModels.includes(id)
                return { id, supported, enabled, disponivel: supported && enabled,
                    protocol: modelProtocol(p.id, id) ?? 'desconhecido',
                    free: p.id === 'opencode-go' && id.endsWith('-free') }
            })
        return { ok: true, modelos }
    } catch (e) {
        return { ok: false, erro: e instanceof Error ? e.message : 'Falha ao listar modelos', modelos: [] }
    }
}

/**
 * Confere o nome devolvido pelo modelo contra o conjunto fechado de ids.
 *
 * Nao adivinha. Se o nome nao existe, tenta uma unica reconciliacao por
 * normalizacao (sem acento, sem underscore) e depois por distancia 1 de edicao
 * — foi assim que "duas_regras" quase virou "duas_reguas". Casou de forma
 * unica, devolve com aviso; ambiguo ou sem casar, devolve nulo e quem chamou
 * pergunta ao usuario em vez de responder com o numero errado.
 */
export function reconciliarNomeDeConsulta(
    nomeRecebido: string,
    idsValidos: string[]
): { id: string | null; exato: boolean; aviso?: string } {
    if (idsValidos.includes(nomeRecebido)) return { id: nomeRecebido, exato: true }

    const normalizar = (s: string) =>
        s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase()

    const alvo = normalizar(nomeRecebido)
    const candidatos = idsValidos.filter((id) => normalizar(id) === alvo)
    if (candidatos.length === 1) {
        return {
            id: candidatos[0],
            exato: false,
            aviso: `modelo devolveu "${nomeRecebido}"; reconciliado para "${candidatos[0]}"`,
        }
    }

    // distancia 1 de edicao. Conservador de proposito — adivinhar consulta
    // errada e pior do que pedir para reformular.
    const perto = idsValidos.filter((id) => {
        const a = normalizar(id)
        if (Math.abs(a.length - alvo.length) > 1) return false
        let dif = 0
        for (let i = 0, j = 0; i < a.length && j < alvo.length;) {
            if (a[i] === alvo[j]) { i++; j++; continue }
            if (++dif > 1) return false
            if (a.length > alvo.length) i++
            else if (a.length < alvo.length) j++
            else { i++; j++ }
        }
        return dif <= 1
    })
    if (perto.length === 1) {
        return {
            id: perto[0],
            exato: false,
            aviso: `modelo devolveu "${nomeRecebido}"; reconciliado para "${perto[0]}"`,
        }
    }

    return { id: null, exato: false, aviso: `nome "${nomeRecebido}" não existe no catálogo` }
}
