import { apiError, authorizedDashboard, BiAiError } from '@/lib/bi-ai/access'
import { executeDaxQuery, listWorkspaceDatasets, PowerBiQueryError, powerBiUserMessage } from '@/lib/powerbi'
import { manifestForDashboard } from '@/lib/bi-ai/registry'
import { publishedSchema } from '@/lib/bi-ai/fabric-context'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const dashboardId = new URL(request.url).searchParams.get('dashboardId') ?? ''
    const { dashboard, profile } = await authorizedDashboard(dashboardId)
    if (profile?.is_admin !== true) throw new BiAiError(403, 'ADMIN_REQUIRED', 'Diagnóstico disponível somente para administradores.')
    const manifest = await manifestForDashboard(dashboard)
    if (!process.env.POWERBI_TENANT || !process.env.POWERBI_CLIENT_ID || !process.env.POWERBI_CLIENT_SECRET) {
      return Response.json({ ok: false, code: 'ENTRA_MISSING', detail: 'Credenciais Entra ausentes.' }, { status: 503 })
    }
    let workspaceVisible = false
    try {
      const datasets = await listWorkspaceDatasets(manifest.workspaceId)
      workspaceVisible = true
      if (!datasets.some((item) => item.id.toLowerCase() === manifest.semanticModelId)) {
        return Response.json({ ok: false, code: 'MODEL_NOT_FOUND',
          detail: 'O modelo não aparece na lista deste workspace para a conta de serviço.' }, { status: 502 })
      }
    } catch (error) {
      console.error('[bi-ai] diagnostic workspace:', error)
      const detail = error instanceof Error ? error.message : ''
      const code = /HTTP 401|HTTP 403/.test(detail) ? 'WORKSPACE_ACCESS' : 'ENTRA_TOKEN'
      return Response.json({ ok: false, code,
        detail: code === 'WORKSPACE_ACCESS' ? 'A conta de serviço não consegue listar o workspace.' : 'Falha ao obter token ou listar modelos.' }, { status: 502 })
    }
    try {
      const rows = await executeDaxQuery({
        workspaceId: manifest.workspaceId,
        semanticModelId: manifest.semanticModelId,
        dax: 'EVALUATE ROW("ok", 1)',
      })
      if (rows.length !== 1) throw new BiAiError(502, 'POWERBI_ERROR', 'A consulta mínima não retornou a linha esperada.')
      try {
        const schema = await publishedSchema(manifest.workspaceId, manifest.semanticModelId, manifest.reportId)
        return Response.json({ ok: true, code: 'FABRIC_READY',
          detail: `Consulta DAX e definição publicada confirmadas: ${new Set(schema.columns.map((item) => item.table)).size} tabelas, ${schema.measures.length} medidas, ${schema.columns.length} colunas, ${schema.pages.length} páginas e ${schema.visualCount} visuais.`,
          schema: { modelHash: schema.modelHash, measures: schema.measures.length,
            columns: schema.columns.length, pages: schema.pages.length, visuals: schema.visualCount } })
      } catch (error) {
        console.error('[bi-ai] diagnostic Fabric schema:', error instanceof Error ? error.message : error)
        return Response.json({ ok: manifest.capabilities.liveDefinitionRequired !== true,
          code: 'FABRIC_DEFINITION_UNAVAILABLE',
          detail: 'A consulta DAX funcionou, mas a definição publicada do Fabric não pôde ser lida.' },
        { status: manifest.capabilities.liveDefinitionRequired === true ? 503 : 200 })
      }
    } catch (error) {
      if (error instanceof PowerBiQueryError) {
        const code = workspaceVisible && error.code === 'WORKSPACE_ACCESS' ? 'BUILD_READ' : error.code
        const detail = code === 'BUILD_READ' ? 'O workspace está acessível, mas Execute Queries foi recusado; verifique Read/Build no modelo.' : powerBiUserMessage(error)
        return Response.json({ ok: false, code, detail }, { status: 502 })
      }
      throw error
    }
  } catch (error) { return apiError(error) }
}
