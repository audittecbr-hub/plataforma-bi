import { apiError, authorizedDashboard } from '@/lib/bi-ai/access'
import { conversationMessages, listConversations, resolveConversation } from '@/lib/bi-ai/conversations'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams
    const { user, dashboard } = await authorizedDashboard(params.get('dashboardId') ?? '')
    const conversationId = params.get('conversationId')
    if (conversationId) {
      await resolveConversation(user.id, dashboard.id, conversationId)
      return Response.json({ messages: await conversationMessages(conversationId) })
    }
    return Response.json({ conversations: await listConversations(user.id, dashboard.id) })
  } catch (error) { return apiError(error) }
}
