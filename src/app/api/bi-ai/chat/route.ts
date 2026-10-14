import { apiError, authorizedDashboard, BiAiError } from '@/lib/bi-ai/access'
import { readJsonBody } from '@/lib/bi-ai/http'
import { answerBiQuestion } from '@/lib/bi-ai/pipeline'
import { manifestForDashboard } from '@/lib/bi-ai/registry'
import { withAiRequestCache } from '@/lib/ai-request-cache'
import { lerConfigIa } from '@/lib/llm-config'
import { streamBiAnswer } from '@/lib/bi-ai/stream'
import type { BiProgressReporter } from '@/lib/bi-ai/progress'

export const runtime = 'nodejs'
export const maxDuration = 300
// Power BI (Brazil South) and Supabase (sa-east-1) are in São Paulo; every model read crosses less network.
export const preferredRegion = 'gru1'

/** Keep investigating inside one request for up to this long before handing a continuation to the browser. */
const IN_REQUEST_ANALYSIS_MS = 120_000

export async function POST(request: Request): Promise<Response> {
  return withAiRequestCache(() => answerRequest(request))
}

async function answerRequest(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request, 1_100_000)
    if (['workspaceId', 'datasetId', 'semanticModelId', 'reportId'].some((key) => key in body)) {
      throw new BiAiError(400, 'UNTRUSTED_ID', 'IDs do Power BI não são aceitos nesta rota.')
    }
    if (typeof body.dashboardId !== 'string' || typeof body.message !== 'string'
      || (body.conversationId !== undefined && body.conversationId !== null && typeof body.conversationId !== 'string')
      || (body.clarificationToken !== undefined && (typeof body.clarificationToken !== 'string' || body.clarificationToken.length > 32000))
      || (body.continuationToken !== undefined && (typeof body.continuationToken !== 'string' || body.continuationToken.length > 1_000_000))
      || (body.continuationToken && !body.conversationId)
      || (body.clarificationToken && !body.conversationId)) {
      throw new BiAiError(400, 'INVALID_INPUT', 'Informe dashboardId, conversationId opcional e message.')
    }
    const { user, profile, dashboard } = await authorizedDashboard(body.dashboardId)
    const answer = async (onProgress?: BiProgressReporter, signal = request.signal) => {
      const [manifest] = await Promise.all([manifestForDashboard(dashboard, false), lerConfigIa()])
      return answerBiQuestion({
      dashboard, manifest, userId: user.id, isAdmin: profile?.is_admin === true,
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : null, message: body.message as string,
      clarificationToken: typeof body.clarificationToken === 'string' ? body.clarificationToken : null,
      continuationToken: typeof body.continuationToken === 'string' ? body.continuationToken : null,
      yieldAnalysis: request.headers.get('x-bi-ai-continuation') === '1',
      yieldAfterMs: IN_REQUEST_ANALYSIS_MS,
      signal, onProgress,
      })
    }
    if (request.headers.get('accept')?.includes('text/event-stream')) return streamBiAnswer(request,
      (onProgress, signal) => withAiRequestCache(() => answer(onProgress, signal)))
    return Response.json({ ok: true, ...await answer() })
  } catch (error) { return apiError(error) }
}
