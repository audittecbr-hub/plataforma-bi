import { apiError, BiAiError } from '@/lib/bi-ai/access'
import { asRecord, ManifestError, parseManifest, UUID } from '@/lib/bi-ai/manifest'
import { registerManifest } from '@/lib/bi-ai/registry'
import { CertifiedQueryError, validateCertifiedQueries } from '@/lib/bi-ai/certified'
import { publishedSchema } from '@/lib/bi-ai/fabric-context'
import { assertPublishedCatalog, PublishedSchemaError } from '@/lib/bi-ai/fabric-schema'
import { validRegistrationSecret } from '@/lib/bi-ai/registration-secret'

export const runtime = 'nodejs'
const MAX_BYTES = 1_000_000

async function boundedBody(request: Request): Promise<string> {
  const announced = Number(request.headers.get('content-length'))
  if (announced > MAX_BYTES) throw new BiAiError(413, 'PAYLOAD_TOO_LARGE', 'Manifesto maior que 1 MB.')
  const reader = request.body?.getReader()
  if (!reader) throw new BiAiError(400, 'EMPTY_BODY', 'Corpo vazio.')
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BYTES) {
      await reader.cancel()
      throw new BiAiError(413, 'PAYLOAD_TOO_LARGE', 'Manifesto maior que 1 MB.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export async function POST(request: Request): Promise<Response> {
  try {
    const expected = process.env.PORTAL_AI_REGISTRATION_SECRET
    if (!expected) throw new BiAiError(503, 'REGISTRATION_DISABLED', 'Registro de manifestos não configurado.')
    const received = request.headers.get('x-portal-ai-registration-secret')
      ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    if (!validRegistrationSecret(received, expected)) {
      throw new BiAiError(401, 'BAD_REGISTRATION_SECRET', 'Credencial de registro inválida.')
    }
    let payload: unknown
    try { payload = JSON.parse(await boundedBody(request)) }
    catch (error) {
      if (error instanceof BiAiError) throw error
      throw new BiAiError(400, 'INVALID_JSON', 'JSON do manifesto inválido.')
    }
    const body = asRecord(payload)
    const explicitDashboardId = body.dashboardId === undefined ? null : String(body.dashboardId).toLowerCase()
    if (explicitDashboardId && !UUID.test(explicitDashboardId)) {
      throw new BiAiError(400, 'INVALID_DASHBOARD', 'dashboardId inválido.')
    }
    let manifest
    try {
      manifest = parseManifest(body.manifest ?? body)
      validateCertifiedQueries(manifest)
    }
    catch (error) {
      if (error instanceof ManifestError || error instanceof CertifiedQueryError) {
        throw new BiAiError(400, 'INVALID_MANIFEST', error.message)
      }
      throw error
    }
    if (asRecord(manifest.raw.source).registrationReady === false) {
      throw new BiAiError(409, 'PUBLICATION_MISMATCH', 'O modelo publicado ainda não corresponde ao manifesto local.')
    }
    if (asRecord(manifest.raw.capabilities).liveDefinitionRequired === true) {
      try {
        const schema = await publishedSchema(manifest.workspaceId, manifest.semanticModelId, manifest.reportId)
        assertPublishedCatalog(manifest, schema, false)
        manifest.raw.source = { ...asRecord(manifest.raw.source), publishedModelHash: schema.modelHash }
      } catch (error) {
        if (error instanceof PublishedSchemaError) {
          throw new BiAiError(409, 'PUBLICATION_MISMATCH', error.message)
        }
        console.error('[bi-ai] registration Fabric schema:', error instanceof Error ? error.message : error)
        throw new BiAiError(503, 'FABRIC_DEFINITION_UNAVAILABLE', 'Não foi possível confirmar a definição publicada no Fabric.')
      }
    }
    const result = await registerManifest(manifest, explicitDashboardId)
    return Response.json({ ok: true, ...result, schemaVersion: manifest.schemaVersion })
  } catch (error) { return apiError(error) }
}
