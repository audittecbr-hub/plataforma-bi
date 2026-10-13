import 'server-only'
import { apiError } from './access'
import { biProgress, type BiChatEvent, type BiProgressReporter } from './progress'

/** Real backend events, with cancellation and a heartbeat while a provider is working. */
export function streamBiAnswer<T extends object>(request: Request,
  work: (onProgress: BiProgressReporter, signal: AbortSignal) => Promise<T>): Response {
  const encoder = new TextEncoder(), abort = new AbortController()
  let closed = false, heartbeat: ReturnType<typeof setInterval> | undefined
  const onAbort = () => abort.abort(request.signal.reason)
  request.signal.addEventListener('abort', onAbort, { once: true })
  if (request.signal.aborted) onAbort()
  const cleanup = () => { if (heartbeat) clearInterval(heartbeat); request.signal.removeEventListener('abort', onAbort) }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: BiChatEvent | { type: 'result'; result: { ok: true } & T }) => {
        if (!closed && !abort.signal.aborted) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      emit({ type: 'progress', progress: biProgress(1, 'Lendo o modelo publicado e os filtros da pergunta.') })
      heartbeat = setInterval(() => {
        if (!closed && !abort.signal.aborted) controller.enqueue(encoder.encode(': trabalhando\n\n'))
      }, 15_000)
      void work(progress => emit({ type: 'progress', progress }), abort.signal).then(result => {
        emit({ type: 'result', result: { ok: true, ...result } })
      }).catch(async error => {
        if (abort.signal.aborted) return
        const body = await apiError(error).json() as { error?: string; code?: string }
        emit({ type: 'error', error: body.error ?? 'Não consegui concluir a análise.', code: body.code })
      }).finally(() => {
        cleanup()
        if (!closed) { closed = true; controller.close() }
      })
    },
    cancel(reason) { closed = true; cleanup(); abort.abort(reason) },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } })
}
