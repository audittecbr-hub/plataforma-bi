/**
 * Cliente Power BI para autenticação Azure AD e refresh de datasets.
 * Executado exclusivamente no servidor (Server Actions do Next.js).
 */

// Mapeamento de nome amigável → ID do dataset no Power BI
export const PBI_DATASETS: Record<string, string> = {
    'Composição de Receitas': '26873b5b-7e88-48b9-8a23-e504178fcf8a',
    'Geral (Metas)': '5f1e9f0f-8388-438d-a0be-6a5e13bb3ce4',
    'Painel de Unidades': 'f476a231-a82f-405d-b0e5-1a4147e172ca',
    'Painel a Receber': '97104bd3-fa7f-4a40-94f8-4989254e7f48',
    'Painel de Inadimplência': '92174395-c9b1-4b2c-b491-137fff6bb634',
    'Painel de Recuperados': '36e4beb2-2684-4282-ace0-50d8ca7f6658',
}

export const PBI_WORKSPACE_ID = process.env.POWERBI_WORKSPACE_ID!

export interface DatasetInfo {
    id: string
    name: string
    isRefreshable: boolean
    configuredBy?: string
}

/**
 * Lista todos os datasets disponíveis no workspace.
 * Usado para verificar e corrigir os IDs no mapa PBI_DATASETS.
 */
export async function listWorkspaceDatasets(workspaceId: string): Promise<DatasetInfo[]> {
    const token = await getAccessToken()

    const response = await fetch(
        `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }
    )

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`Falha ao listar datasets [HTTP ${response.status}]: ${err}`)
    }

    const data = await response.json()
    return (data.value ?? []).map((d: Record<string, unknown>) => ({
        id: d.id as string,
        name: d.name as string,
        isRefreshable: d.isRefreshable as boolean,
        configuredBy: d.configuredBy as string | undefined,
    }))
}

// Status retornados pela API do Power BI para um refresh
export type RefreshStatus = 'Unknown' | 'Completed' | 'Failed' | 'Disabled' | 'Cancelled' | 'InProgress'

export interface RefreshHistoryItem {
    requestId: string
    refreshType: string
    startTime: string
    endTime?: string
    status: RefreshStatus
    serviceExceptionJson?: string
}

// Cache de token em memória para evitar chamadas redundantes ao Azure AD
// O token tem validade de 3600s — reutilizado entre requisições do mesmo processo
const _tokenCache = new Map<string, { value: string; expiresAt: number }>()

/** Obtém o Bearer Token do Azure AD via client_credentials flow (com cache de 1h) */
async function getAccessToken(scope = 'https://analysis.windows.net/powerbi/api/.default'): Promise<string> {
    // Retorna o token cacheado se ainda estiver válido
    const cached = _tokenCache.get(scope)
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value
    }

    const tenant = process.env.POWERBI_TENANT
    const clientId = process.env.POWERBI_CLIENT_ID
    const clientSecret = process.env.POWERBI_CLIENT_SECRET

    if (!tenant || !clientId || !clientSecret) {
        throw new Error('Variáveis de ambiente do Power BI não configuradas (POWERBI_TENANT, POWERBI_CLIENT_ID, POWERBI_CLIENT_SECRET)')
    }

    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope,
    })

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`Autenticação Azure AD falhou: ${response.status} - ${err}`)
    }

    const data = await response.json()

    // Armazena o token em cache com a expiração real (com margem de 60s de segurança)
    const entry = {
        value: data.access_token as string,
        expiresAt: Date.now() + ((data.expires_in as number ?? 3600) - 60) * 1000,
    }
    _tokenCache.set(scope, entry)
    return entry.value
}

/** The same service identity can request Fabric metadata with its own audience. */
export function getFabricAccessToken(): Promise<string> {
    return getAccessToken('https://api.fabric.microsoft.com/.default')
}

export type PowerBiErrorCode = 'ENTRA_MISSING' | 'ENTRA_TOKEN' | 'WORKSPACE_ACCESS'
    | 'MODEL_NOT_FOUND' | 'BUILD_READ' | 'EXECUTE_QUERIES_DISABLED'
    | 'RLS_SSO' | 'MODEL_INCOMPATIBLE' | 'INVALID_DAX' | 'TIMEOUT' | 'POWERBI_ERROR'

export class PowerBiQueryError extends Error {
    constructor(readonly code: PowerBiErrorCode, readonly httpStatus: number | null, detail: string) {
        super(detail)
        this.name = 'PowerBiQueryError'
    }
}

function classifyQueryError(status: number, detail: string): PowerBiErrorCode {
    const text = detail.toLowerCase()
    if (/row.level.security|\brls\b|single.sign.on|\bsso\b/.test(text)) return 'RLS_SSO'
    if (/unsupported|not supported|compatibility level|live connection|push dataset/.test(text)) return 'MODEL_INCOMPATIBLE'
    if (/execute.?quer|tenant setting|disabled/.test(text) && /disabled|not enabled|not allowed/.test(text)) return 'EXECUTE_QUERIES_DISABLED'
    if (/build permission|read permission|datasetread/.test(text)) return 'BUILD_READ'
    if (/dax query failure|syntax error|could not be found|cannot find (table|column|measure)/.test(text)) return 'INVALID_DAX'
    if (status === 400 && /datasetexecutequerieserror|function .* expects|query \(\d+, \d+\)/.test(text)) return 'INVALID_DAX'
    if (status === 404) return 'MODEL_NOT_FOUND'
    if (status === 401 || status === 403) return 'WORKSPACE_ACCESS'
    return 'POWERBI_ERROR'
}

/** JSON Execute Queries adapter. The dashboard's workspace/model IDs are resolved server-side. */
export async function executeDaxQuery({
    workspaceId, semanticModelId, dax, signal,
}: {
    workspaceId: string
    semanticModelId: string
    dax: string
    signal?: AbortSignal
}): Promise<Record<string, unknown>[]> {
    let token: string
    try {
        token = await getAccessToken()
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        console.error('[powerbi] token:', detail)
        throw new PowerBiQueryError(
            detail.includes('não configuradas') ? 'ENTRA_MISSING' : 'ENTRA_TOKEN', null, detail,
        )
    }
    let response: Response
    try {
        response = await fetch(
            `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${semanticModelId}/executeQueries`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ queries: [{ query: dax }], serializerSettings: { includeNulls: true } }),
                signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
            },
        )
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        console.error('[powerbi] executeQueries network:', detail)
        throw new PowerBiQueryError('TIMEOUT', null, detail)
    }
    const body = await response.text()
    if (body.length > 2_000_000) {
        console.error('[powerbi] executeQueries result too large:', body.length)
        throw new PowerBiQueryError('POWERBI_ERROR', response.status, 'Resultado maior que o limite do Chat IA.')
    }
    if (!response.ok) {
        console.error(`[powerbi] executeQueries HTTP ${response.status}: ${body.slice(0, 4000)}`)
        throw new PowerBiQueryError(classifyQueryError(response.status, body), response.status, body.slice(0, 4000))
    }
    let data: Record<string, unknown>
    try { data = JSON.parse(body) as Record<string, unknown> }
    catch { throw new PowerBiQueryError('POWERBI_ERROR', response.status, 'JSON inválido na resposta Power BI.') }
    const result = (data.results as Array<Record<string, unknown>> | undefined)?.[0]
    const table = (result?.tables as Array<Record<string, unknown>> | undefined)?.[0]
    if (result?.error || table?.error) {
        const detail = JSON.stringify(result?.error ?? table?.error).slice(0, 4000)
        console.error('[powerbi] executeQueries result:', detail)
        throw new PowerBiQueryError(classifyQueryError(response.status, detail), response.status, detail)
    }
    if (!table || !Array.isArray(table.rows)) {
        throw new PowerBiQueryError('POWERBI_ERROR', response.status, 'Resposta sem tabela de resultados.')
    }
    return table.rows as Record<string, unknown>[]
}

export function powerBiUserMessage(error: unknown): string {
    if (!(error instanceof PowerBiQueryError)) return 'Não consegui consultar o Power BI agora.'
    switch (error.code) {
        case 'ENTRA_MISSING': return 'As credenciais do Power BI não estão configuradas.'
        case 'ENTRA_TOKEN': return 'Falha na autenticação com a Microsoft.'
        case 'WORKSPACE_ACCESS': return 'O serviço não tem acesso ao workspace do Power BI.'
        case 'MODEL_NOT_FOUND': return 'O modelo semântico não foi encontrado no workspace.'
        case 'BUILD_READ': return 'Faltam permissões de leitura ou Build no modelo semântico.'
        case 'EXECUTE_QUERIES_DISABLED': return 'Execute Queries está desabilitado no tenant Power BI.'
        case 'RLS_SSO': return 'Este modelo usa RLS/SSO incompatível com a conta de serviço atual.'
        case 'MODEL_INCOMPATIBLE': return 'Este modelo semântico não é compatível com Execute Queries.'
        case 'INVALID_DAX': return 'A consulta DAX foi recusada pelo modelo.'
        case 'TIMEOUT': return 'A consulta ao Power BI excedeu o tempo limite.'
        default: return 'A consulta ao Power BI falhou. Avise o administrador.'
    }
}

/**
 * Dispara o refresh de um dataset do Power BI.
 * Lança exceção com a mensagem original da Microsoft em caso de falha.
 */
export async function triggerDatasetRefresh(
    workspaceId: string,
    datasetId: string
): Promise<boolean> {
    const token = await getAccessToken()

    const response = await fetch(
        `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/refreshes`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            // Body vazio — a API aceita POST sem body para disparar refresh padrão
            body: JSON.stringify({}),
        }
    )

    // 202 Accepted = refresh enfileirado com sucesso
    if (response.status === 202) return true

    // Captura a mensagem de erro exata da Microsoft para diagnóstico
    const errorBody = await response.text()
    throw new Error(`Power BI API rejeitou o refresh [HTTP ${response.status}]: ${errorBody}`)
}

/**
 * Consulta o histórico de refreshes de um dataset e retorna o mais recente.
 * Usado para saber se o refresh foi concluído, falhou ou ainda está em progresso.
 */
export async function getLatestRefreshStatus(
    workspaceId: string,
    datasetId: string
): Promise<RefreshHistoryItem | null> {
    const token = await getAccessToken()

    const response = await fetch(
        `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=1`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    )

    if (!response.ok) return null

    const data = await response.json()
    const items: RefreshHistoryItem[] = data.value ?? []
    return items[0] ?? null
}

/**
 * Consulta o status da última atualização de todos os datasets mapeados.
 * Retorna um objeto { [nomeDashboard]: RefreshHistoryItem | null }
 */
export async function getAllDatasetsRefreshStatus(
    workspaceId: string
): Promise<Record<string, RefreshHistoryItem | null>> {
    const token = await getAccessToken()
    const results: Record<string, RefreshHistoryItem | null> = {}

    await Promise.all(
        Object.entries(PBI_DATASETS).map(async ([name, datasetId]) => {
            const response = await fetch(
                `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/refreshes?$top=1`,
                { headers: { Authorization: `Bearer ${token}` } }
            )
            if (!response.ok) {
                results[name] = null
                return
            }
            const data = await response.json()
            const items: RefreshHistoryItem[] = data.value ?? []
            results[name] = items[0] ?? null
        })
    )

    return results
}
