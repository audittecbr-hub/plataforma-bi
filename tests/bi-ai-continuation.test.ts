import assert from 'node:assert/strict'
import test from 'node:test'
import { requestBiAnalysis } from '../src/lib/bi-ai/chat-request'
import { biProgress } from '../src/lib/bi-ai/progress'

test('chat continues one question transparently, preserves its context and returns only the final answer', async () => {
  const requests: Record<string, unknown>[] = [], steps: number[] = [], controller = new AbortController()
  const mock: typeof fetch = async (_, init) => {
    assert.equal(init?.signal, controller.signal)
    requests.push(JSON.parse(String(init?.body)))
    const events = requests.length === 1 ? [{ type: 'progress', progress: biProgress(2) },
      { type: 'result', result: { ok: true, conversationId: 'conversation', continuationToken: 'opaque-checkpoint' } }]
      : [{ type: 'progress', progress: biProgress(1) }, { type: 'progress', progress: biProgress(3) },
        { type: 'result', result: { ok: true, conversationId: 'conversation', answer: 'Resposta conferida' } }]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
  }
  const result = await requestBiAnalysis({ dashboardId: 'project', conversationId: null, message: 'Pergunta completa',
    clarificationToken: 'old-clarification', signal: controller.signal, onProgress: progress => steps.push(progress.step) }, mock)
  assert.equal(result.answer, 'Resposta conferida')
  assert.deepEqual(requests, [{ dashboardId: 'project', conversationId: null, message: 'Pergunta completa', clarificationToken: 'old-clarification' },
    { dashboardId: 'project', conversationId: 'conversation', message: 'Pergunta completa', continuationToken: 'opaque-checkpoint' }])
  assert.deepEqual(steps, [2, 2, 3])
  controller.abort()
  await assert.rejects(requestBiAnalysis({ dashboardId: 'project', conversationId: null, message: 'Outra pergunta', signal: controller.signal, onProgress: () => {} }, mock), { name: 'AbortError' })
  assert.equal(requests.length, 2)
})
