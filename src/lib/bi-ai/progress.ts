export interface BiProgress {
  step: 1 | 2 | 3
  total: 3
  title: string
  detail?: string
  completedQueries?: number
}

export type BiProgressReporter = (progress: BiProgress) => void

export function biProgress(step: BiProgress['step'], detail?: string): BiProgress {
  const titles = { 1: 'Entendendo a pergunta', 2: 'Buscando dados e fazendo cruzamentos', 3: 'Analisando e conferindo a resposta' }
  return { step, total: 3, title: titles[step], ...(detail ? { detail } : {}) }
}

export interface BiChatResult {
  ok: boolean
  conversationId: string
  answer?: string
  continuationToken?: string
  clarification?: { question: string; options: string[]; token: string }
  queries?: { purpose: string; rowCount: number }[]
}

export type BiChatEvent = { type: 'progress'; progress: BiProgress }
  | { type: 'result'; result: BiChatResult }
  | { type: 'error'; error: string; code?: string }

/** UTF-8 and event delimiters may be split across network chunks. */
export async function readBiChatStream(response: Response, onProgress: BiProgressReporter): Promise<BiChatResult> {
  if (!response.body) throw new Error('A conexão não retornou uma resposta.')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', result: BiChatResult | undefined
  function consume() {
    let boundary: RegExpExecArray | null
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      const block = buffer.slice(0, boundary.index)
      buffer = buffer.slice(boundary.index + boundary[0].length)
      const payload = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!payload) continue
      const event = JSON.parse(payload) as BiChatEvent
      if (event.type === 'progress' && [1, 2, 3].includes(event.progress?.step) && event.progress.total === 3) onProgress(event.progress)
      else if (event.type === 'error') throw new Error(event.error || 'Não consegui concluir a análise.')
      else if (event.type === 'result') result = event.result
    }
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      consume()
      if (done) break
    }
    if (!result) throw new Error('A conexão foi interrompida antes de concluir a resposta. Envie a pergunta novamente.')
    return result
  } finally { reader.releaseLock() }
}
