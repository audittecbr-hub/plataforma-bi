import type { ChamadaDeFerramenta, MensagemLlm } from './llm'

export type LlmActivity = 'reasoning' | 'output'

/** Consume completion deltas; report activity without exposing the model's reasoning. */
export async function readLlmCompletionStream(response: Response, onActivity: (activity: LlmActivity) => void, signal?: AbortSignal) {
  if (!response.body) throw new Error('O provedor não retornou o fluxo da resposta.')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', content = '', reasoning = '', finish: string | null = null, tokens = 0, doneMarker = false
  let previous: LlmActivity | undefined, reportedAt = 0
  const tools = new Map<number, ChamadaDeFerramenta>()
  const report = (activity: LlmActivity) => {
    if (activity !== previous || Date.now() - reportedAt >= 10_000) {
      previous = activity; reportedAt = Date.now(); onActivity(activity)
    }
  }
  function consume() {
    let boundary: RegExpExecArray | null
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      const block = buffer.slice(0, boundary.index); buffer = buffer.slice(boundary.index + boundary[0].length)
      const payload = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!payload) continue
      if (payload === '[DONE]') { doneMarker = true; continue }
      const event = JSON.parse(payload)
      if (event.error) throw new Error('O provedor interrompeu a geração da resposta.')
      if (typeof event.usage?.total_tokens === 'number') tokens = event.usage.total_tokens
      const choice = event.choices?.[0], delta = choice?.delta
      if (choice?.finish_reason) finish = choice.finish_reason
      if (!delta) continue
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) { reasoning += delta.reasoning_content; report('reasoning') }
      if (typeof delta.content === 'string' && delta.content) { content += delta.content; report('output') }
      for (const call of delta.tool_calls ?? []) {
        if (!Number.isInteger(call.index) || call.index < 0) throw new Error('O provedor retornou uma ferramenta inválida.')
        const tool = tools.get(call.index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } }
        if (call.id) tool.id = call.id
        if (call.function?.name) tool.function.name += call.function.name
        if (call.function?.arguments) tool.function.arguments += call.function.arguments
        tools.set(call.index, tool); report('output')
      }
    }
  }
  try {
    while (!doneMarker) {
      signal?.throwIfAborted()
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true }); consume()
      if (done) break
    }
    if (!finish || !doneMarker) throw new Error('O provedor interrompeu a geração antes de concluir. Envie a pergunta novamente.')
    const calls = [...tools.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call)
    const message: MensagemLlm = { role: 'assistant', content: content || null,
      ...(reasoning ? { reasoning_content: reasoning } : {}), ...(calls.length ? { tool_calls: calls } : {}) }
    return { message, calls, tokens, finish }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
