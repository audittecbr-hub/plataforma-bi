import { getFabricAccessToken } from '@/lib/powerbi'
import { UUID } from './manifest'
import { parsePublishedSchema, type FabricPart, type PublishedSchema } from './fabric-schema'

class FabricDefinitionError extends Error {
  constructor(readonly status: number | null, message: string) { super(message) }
}

const cache = new Map<string, { expiresAt: number; promise: Promise<PublishedSchema> }>()
const CACHE_MS = 10 * 60_000

function operationUrl(value: string | null): string {
  if (!value) throw new FabricDefinitionError(null, 'Fabric não informou a operação de exportação.')
  const url = new URL(value)
  const allowed = url.hostname === 'api.fabric.microsoft.com'
    || /^[a-z0-9-]+\.analysis\.windows\.net$/i.test(url.hostname)
  if (url.protocol !== 'https:' || !allowed || !/^\/v1\/operations\/[0-9a-f-]+(?:\/result)?$/i.test(url.pathname)) {
    throw new FabricDefinitionError(null, 'URL de operação Fabric inválida.')
  }
  return url.toString()
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text()
  if (body.length > 5_000_000) throw new FabricDefinitionError(response.status, 'Definição Fabric acima de 5 MB.')
  try { return JSON.parse(body) as Record<string, unknown> }
  catch { throw new FabricDefinitionError(response.status, 'Resposta Fabric inválida.') }
}

async function request(url: string, token: string, method: 'GET' | 'POST'): Promise<Response> {
  return fetch(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000), cache: 'no-store' })
}

async function definitionParts(workspaceId: string, itemId: string, kind: 'semanticModels' | 'reports', token: string): Promise<FabricPart[]> {
  const url = `https://api.fabric.microsoft.com/v1/workspaces/${workspaceId}/${kind}/${itemId}/getDefinition${kind === 'semanticModels' ? '?format=TMDL' : ''}`
  const initial = await request(url, token, 'POST')
  if (initial.status !== 200 && initial.status !== 202) {
    throw new FabricDefinitionError(initial.status, `Definição ${kind} indisponível (HTTP ${initial.status}).`)
  }
  let result = initial
  if (initial.status === 202) {
    const statusUrl = operationUrl(initial.headers.get('Location'))
    let succeeded = false
    for (let attempt = 0; attempt < 7; attempt++) {
      const status = await request(statusUrl, token, 'GET')
      if (!status.ok) throw new FabricDefinitionError(status.status, `Operação Fabric falhou (HTTP ${status.status}).`)
      const payload = await boundedJson(status)
      if (payload.status === 'Succeeded') {
        result = await request(operationUrl(status.headers.get('Location') ?? `${statusUrl}/result`), token, 'GET')
        succeeded = true
        break
      }
      if (payload.status === 'Failed' || payload.status === 'Cancelled') {
        throw new FabricDefinitionError(status.status, 'Exportação Fabric falhou.')
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(10_000, 1_000 * 2 ** attempt)))
    }
    if (!succeeded) throw new FabricDefinitionError(null, 'Exportação Fabric excedeu o tempo limite.')
  }
  if (!result.ok) throw new FabricDefinitionError(result.status, `Resultado Fabric falhou (HTTP ${result.status}).`)
  const response = await boundedJson(result)
  const definition = response.definition as Record<string, unknown> | undefined
  const parts = definition?.parts
  if (!Array.isArray(parts)) throw new FabricDefinitionError(result.status, 'Definição Fabric sem partes.')
  return parts as FabricPart[]
}

async function load(workspaceId: string, semanticModelId: string, reportId: string | null): Promise<PublishedSchema> {
  const token = await getFabricAccessToken()
  const [model, report] = await Promise.all([
    definitionParts(workspaceId, semanticModelId, 'semanticModels', token),
    reportId ? definitionParts(workspaceId, reportId, 'reports', token).catch((error) => {
      console.error('[bi-ai] report definition unavailable:', error instanceof Error ? error.message : error)
      return [] as FabricPart[]
    }) : Promise.resolve([] as FabricPart[]),
  ])
  return parsePublishedSchema(model, report)
}

/** Live, read-only Fabric metadata, cached per server instance for 10 minutes. */
export function publishedSchema(workspaceId: string, semanticModelId: string, reportId: string | null): Promise<PublishedSchema> {
  if (!UUID.test(workspaceId) || !UUID.test(semanticModelId) || (reportId && !UUID.test(reportId))) {
    throw new FabricDefinitionError(null, 'Identidade Fabric inválida.')
  }
  const key = `${workspaceId}:${semanticModelId}:${reportId ?? ''}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.promise
  const promise = load(workspaceId, semanticModelId, reportId)
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, promise })
  promise.catch(() => { if (cache.get(key)?.promise === promise) cache.delete(key) })
  return promise
}
