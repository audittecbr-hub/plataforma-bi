import assert from 'node:assert/strict'
import test from 'node:test'
import { biProgress, readBiChatStream } from '../src/lib/bi-ai/progress'
import { streamBiAnswer } from '../src/lib/bi-ai/stream'
import { BiAiError } from '../src/lib/bi-ai/access'
import { formatVerifiedAnswer } from '../src/lib/bi-ai/presentation'

test('stream reader preserves UTF-8 split between bytes and waits for the final result', async () => {
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ type: 'progress', progress: biProgress(2, 'Buscando informações 📊') })}\r\n\r\n: heartbeat\n\ndata: ${JSON.stringify({ type: 'result', result: { ok: true, conversationId: 'test', answer: '📊 Valor: R$ 123,45' } })}\n\n`)
  const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } }))
  const steps: number[] = []
  const result = await readBiChatStream(response, progress => { steps.push(progress.step); assert.equal(progress.detail, 'Buscando informações 📊') })
  assert.equal(result.answer, '📊 Valor: R$ 123,45')
  assert.deepEqual(steps, [2])
})

test('backend stream reports real phases and errors without returning partial results', async () => {
  const steps: number[] = []
  const response = streamBiAnswer(new Request('https://test.local'), async report => {
    report(biProgress(2)); report(biProgress(3))
    return { conversationId: 'test', answer: 'Resposta conferida' }
  })
  assert.match(response.headers.get('content-type')!, /text\/event-stream/)
  const result = await readBiChatStream(response, progress => steps.push(progress.step))
  assert.equal(result.answer, 'Resposta conferida')
  assert.deepEqual(steps, [1, 2, 3])
  await assert.rejects(readBiChatStream(streamBiAnswer(new Request('https://test.local'), async () => {
    throw new BiAiError(403, 'DENIED', 'Sem acesso a este relatório.')
  }), () => {}), /Sem acesso/)
  await assert.rejects(readBiChatStream(new Response('data: {"type":"progress","progress":{"step":1,"total":3}}\n\n'), () => {}), /interrompida/)
})

test('cancelling the streamed response aborts its underlying work', async () => {
  let signal: AbortSignal | undefined
  const response = streamBiAnswer(new Request('https://test.local'), async (_, activeSignal) => {
    signal = activeSignal
    await new Promise((_, reject) => activeSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
    return { conversationId: 'test', answer: 'must not arrive' }
  })
  const reader = response.body!.getReader()
  await reader.read()
  await reader.cancel('user cancelled')
  assert.equal(signal?.aborted, true)
})

test('structured answers preserve verified values, separate sources and keep refresh warnings visible', () => {
  const output = formatVerifiedAnswer({ facts: [{ id: 'f0', metricId: 'income', label: 'Receita [TAX]', value: 123.45,
    format: 'currency', precision: 0.005, scope: '2026-10 · TAX' }], insights: [], pages: ['HOME'], notes: ['Mesma fonte publicada.'], refreshFailed: true })
  assert(output.includes('- **Receita \\[TAX\\]:** R$\u00a0123,45'))
  assert(output.indexOf('⚠️') < output.indexOf('### 🧾 Fonte e filtros'))
  assert(output.includes('\n\n'))
  assert(output.includes('2026-10 · TAX'))
})
