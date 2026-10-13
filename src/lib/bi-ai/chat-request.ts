import { readBiChatStream, type BiChatResult, type BiProgressReporter, type BiProgress } from './progress'

/** One visible question can investigate the model across several authenticated server requests. */
export async function requestBiAnalysis(input: { dashboardId: string; conversationId: string | null; message: string;
  clarificationToken?: string; signal: AbortSignal; onProgress: BiProgressReporter }, fetcher: typeof fetch = fetch): Promise<BiChatResult> {
  let conversationId = input.conversationId, continuationToken: string | undefined, progress: BiProgress | null = null
  while (true) {
    input.signal.throwIfAborted()
    const response = await fetcher('/api/bi-ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-BI-AI-Continuation': '1' },
      body: JSON.stringify({ dashboardId: input.dashboardId, conversationId, message: input.message,
        ...(continuationToken ? { continuationToken } : input.clarificationToken ? { clarificationToken: input.clarificationToken } : {}) }), signal: input.signal })
    if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? 'Não consegui responder agora.') }
    const body = response.headers.get('content-type')?.includes('text/event-stream')
      ? await readBiChatStream(response, event => {
        const completedQueries = Math.max(progress?.completedQueries ?? 0, event.completedQueries ?? 0)
        progress = progress && progress.step > event.step ? { ...progress, detail: event.detail, completedQueries } : { ...event, completedQueries }
        input.onProgress(progress)
      }) : await response.json() as BiChatResult
    input.signal.throwIfAborted()
    conversationId = body.conversationId
    if (!body.continuationToken) return body
    continuationToken = body.continuationToken
  }
}
