import { apiError, authorizedDashboard, BiAiError } from '@/lib/bi-ai/access'
import { readJsonBody } from '@/lib/bi-ai/http'
import { answerBiQuestion } from '@/lib/bi-ai/pipeline'
import { manifestForDashboard } from '@/lib/bi-ai/registry'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request)
    if (['workspaceId', 'datasetId', 'semanticModelId', 'reportId'].some((key) => key in body)) {
      throw new BiAiError(400, 'UNTRUSTED_ID', 'IDs do Power BI não são aceitos nesta rota.')
    }
    if (typeof body.dashboardId !== 'string' || typeof body.message !== 'string'
      || (body.conversationId !== undefined && body.conversationId !== null && typeof body.conversationId !== 'string')) {
      throw new BiAiError(400, 'INVALID_INPUT', 'Informe dashboardId, conversationId opcional e message.')
    }
    const { user, profile, dashboard } = await authorizedDashboard(body.dashboardId)
    const manifest = manifestForDashboard(dashboard)
    const answer = await answerBiQuestion({
      dashboard, manifest, userId: user.id, isAdmin: profile?.is_admin === true,
      conversationId: body.conversationId || null, message: body.message,
      signal: request.signal,
    })
    return Response.json({ ok: true, ...answer })
  } catch (error) { return apiError(error) }
}
