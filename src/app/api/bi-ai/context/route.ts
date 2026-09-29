import { apiError, authorizedDashboard, BiAiError } from '@/lib/bi-ai/access'
import { providerReady } from '@/lib/bi-ai/pipeline'
import { manifestForDashboard } from '@/lib/bi-ai/registry'
import { lerConfigIa } from '@/lib/llm-config'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const dashboardId = new URL(request.url).searchParams.get('dashboardId') ?? ''
    const { dashboard } = await authorizedDashboard(dashboardId)
    try {
      const manifest = await manifestForDashboard(dashboard)
      const config = await lerConfigIa()
      const ready = config.enabled && await providerReady()
      return Response.json({
        enabled: ready,
        dashboardName: dashboard.name,
        reason: ready ? null : config.enabled ? 'O provedor ou modelo está desativado, ou a chave/endpoint não está configurado.'
          : 'O Chat IA está desativado pelo administrador.',
        recommendedQuestions: ready ? manifest.recommendedQuestions.slice(0, 8) : [],
      })
    } catch (error) {
      if (!(error instanceof BiAiError) || error.status !== 409) throw error
      return Response.json({ enabled: false, dashboardName: dashboard.name, reason: error.message,
        code: error.code, recommendedQuestions: [] })
    }
  } catch (error) { return apiError(error) }
}
