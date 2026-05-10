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
        { headers: { Authorization: `Bearer ${token}` } }
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
let _tokenCache: { value: string; expiresAt: number } | null = null

/** Obtém o Bearer Token do Azure AD via client_credentials flow (com cache de 1h) */
async function getAccessToken(): Promise<string> {
    // Retorna o token cacheado se ainda estiver válido
    if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
        return _tokenCache.value
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
        scope: 'https://analysis.windows.net/powerbi/api/.default',
    })

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    })

    if (!response.ok) {
        const err = await response.text()
        throw new Error(`Autenticação Azure AD falhou: ${response.status} - ${err}`)
    }

    const data = await response.json()

    // Armazena o token em cache com a expiração real (com margem de 60s de segurança)
    _tokenCache = {
        value: data.access_token as string,
        expiresAt: Date.now() + ((data.expires_in as number ?? 3600) - 60) * 1000,
    }
    return _tokenCache.value
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
